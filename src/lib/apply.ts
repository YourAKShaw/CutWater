/**
 * Apply a plan. Order: repository creation, files, labels, verification,
 * manifest (last, and only after everything verified; invariant I8).
 *
 * Gating: if the plan has gated entries and the caller passed no approval
 * list at all, nothing is written and the result asks for confirmation
 * (exit 2). With an approval list, approved gated entries are applied and the
 * rest are declined. Before each write the file's current hash is compared
 * with the hash recorded in the plan (compare-and-set), so concurrent edits
 * are never clobbered.
 */
import { join } from "node:path";
import type { Answers } from "./answers.ts";
import { validateAnswers } from "./answers.ts";
import { CutwaterError } from "./errors.ts";
import { gh, type ExecContext } from "./exec.ts";
import { readText, sha256, writeTextAtomic } from "./fsutil.ts";
import { applyLabels, desiredLabels, diffLabels, listLabels } from "./labels.ts";
import { buildManifest, readManifest, serializeManifest, type ManifestFile } from "./manifest.ts";
import type { FilePlanEntry, Plan, PlanEntry } from "./plan.ts";
import { MANIFEST_PATH, VERSION } from "../version.ts";

export type EntryResult = "created" | "updated" | "skipped" | "declined" | "failed" | "planned";

export interface ApplyResult {
  status: "applied" | "no-changes" | "needs-confirmation" | "dry-run" | "failed";
  results: { id: string; result: EntryResult; detail?: string }[];
  manifest: "written" | "unchanged" | "not-written" | "planned";
  pendingConfirmation: string[];
  plannedCommands: string[][];
  changes: number;
  failures: string[];
}

export interface ApplyOptions {
  root: string;
  /** Approved gated entry ids, or null when the caller passed none. */
  approved: Set<string> | null;
  now: string;
}

export function validatePlan(value: unknown): Plan {
  if (value === null || typeof value !== "object")
    throw new CutwaterError("VALIDATION", "plan must be a JSON object");
  const plan = value as Plan;
  if (plan.planVersion !== 1 || !Array.isArray(plan.entries)) {
    throw new CutwaterError(
      "VALIDATION",
      "not a cutwater plan (planVersion 1 with entries expected)",
    );
  }
  validateAnswers(plan.answers);
  for (const entry of plan.entries) {
    if (
      entry.kind === "file" &&
      (entry.path.startsWith("/") || entry.path.split("/").includes(".."))
    ) {
      throw new CutwaterError("VALIDATION", `plan entry ${entry.id} points outside the repository`);
    }
  }
  return plan;
}

function needsApproval(entry: PlanEntry): boolean {
  return entry.gated && entry.action !== "skip";
}

export async function applyPlan(
  ctx: ExecContext,
  plan: Plan,
  opts: ApplyOptions,
): Promise<ApplyResult> {
  const answers: Answers = plan.answers;
  const result: ApplyResult = {
    status: "applied",
    results: [],
    manifest: "not-written",
    pendingConfirmation: [],
    plannedCommands: [],
    changes: 0,
    failures: [],
  };
  const gated = plan.entries.filter(needsApproval).map((entry) => entry.id);
  if (opts.approved === null && gated.length > 0) {
    result.status = "needs-confirmation";
    result.pendingConfirmation = gated;
    return result;
  }
  const approved = opts.approved ?? new Set<string>();
  const approve = (entry: PlanEntry) => !needsApproval(entry) || approved.has(entry.id);
  const repo = answers.repo;
  ctx.repo = repo;
  let repoAvailable = !plan.entries.some((entry) => entry.kind === "repo-create");

  for (const entry of plan.entries) {
    if (entry.kind === "repo-create") {
      if (!approve(entry)) {
        result.results.push({ id: entry.id, result: "declined" });
        continue;
      }
      await gh(ctx, entry.command.slice(1));
      repoAvailable = !ctx.dryRun;
      result.results.push({ id: entry.id, result: ctx.dryRun ? "planned" : "created" });
      result.changes++;
    } else if (entry.kind === "file") {
      result.results.push(applyFile(ctx, entry, opts.root, approve(entry), result));
    }
  }

  const labelsEntry = plan.entries.find((entry) => entry.kind === "labels");
  let verifiedLabels: string[] = [];
  if (labelsEntry && labelsEntry.kind === "labels") {
    if (!repoAvailable && !ctx.dryRun) {
      result.results.push({ id: "labels", result: "skipped", detail: "no GitHub repository" });
    } else if (labelsEntry.labels.length === 0) {
      result.results.push({ id: "labels", result: "skipped" });
    } else {
      try {
        await applyLabels(ctx, repo, labelsEntry.labels);
        result.results.push({
          id: "labels",
          result: ctx.dryRun ? "planned" : "updated",
          detail: `${labelsEntry.labels.length} labels`,
        });
        result.changes++;
      } catch (error) {
        result.failures.push(`labels: ${(error as Error).message}`);
        result.results.push({ id: "labels", result: "failed", detail: (error as Error).message });
      }
    }
    if (!ctx.dryRun && repoAvailable && result.failures.length === 0) {
      const diff = diffLabels(desiredLabels(answers.emojiLabels), await listLabels(ctx, repo));
      if (diff.create.length + diff.update.length > 0) {
        result.failures.push(
          `labels not verified: ${[...diff.create, ...diff.update].map((label) => label.name).join(", ")}`,
        );
      }
      verifiedLabels = diff.ok.map((label) => label.name);
    }
  }

  // Verification: every file cutwater claims must match its rendered hash.
  const recorded: Record<string, ManifestFile> = {};
  for (const entry of plan.entries) {
    if (entry.kind !== "file") continue;
    const outcome = result.results.find((item) => item.id === entry.id)?.result;
    if (outcome === "failed" || outcome === "declined") continue;
    if (entry.action === "skip" && entry.reason !== "identical") continue;
    if (ctx.dryRun) {
      recorded[entry.path] = { template: entry.template, sha256: entry.newSha256 };
      continue;
    }
    const onDisk = readText(join(opts.root, entry.path));
    if (onDisk === null || sha256(onDisk) !== entry.newSha256) {
      result.failures.push(`${entry.path} did not verify after writing`);
      continue;
    }
    recorded[entry.path] = { template: entry.template, sha256: entry.newSha256 };
  }

  if (ctx.dryRun) {
    result.plannedCommands = ctx.planned.map((call) => [call.cmd, ...call.args]);
    result.status = "dry-run";
    result.manifest = "planned";
    return result;
  }
  if (result.failures.length > 0) {
    result.status = "failed";
    return result;
  }

  const previous = readManifest(opts.root).manifest;
  const { manifest, changed } = buildManifest({
    previous,
    answers,
    skillVersion: VERSION,
    files: recorded,
    labels: verifiedLabels,
    now: opts.now,
  });
  if (changed) {
    writeTextAtomic(join(opts.root, MANIFEST_PATH), serializeManifest(manifest));
    result.manifest = "written";
    result.changes++;
  } else {
    result.manifest = "unchanged";
  }
  if (result.changes === 0) result.status = "no-changes";
  return result;
}

function applyFile(
  ctx: ExecContext,
  entry: FilePlanEntry,
  root: string,
  approved: boolean,
  result: ApplyResult,
): { id: string; result: EntryResult; detail?: string } {
  if (entry.action === "skip") return { id: entry.id, result: "skipped", detail: entry.reason };
  if (!approved) return { id: entry.id, result: "declined" };
  const abs = join(root, entry.path);
  const current = readText(abs);
  const currentSha = current === null ? null : sha256(current);
  if (currentSha !== entry.expectedSha256) {
    const detail = "changed on disk since the plan was made; run plan again";
    result.failures.push(`${entry.path}: ${detail}`);
    return { id: entry.id, result: "failed", detail };
  }
  if (ctx.dryRun) return { id: entry.id, result: "planned" };
  writeTextAtomic(abs, entry.content);
  result.changes++;
  return { id: entry.id, result: entry.action === "create" ? "created" : "updated" };
}
