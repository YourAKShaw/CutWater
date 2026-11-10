/**
 * Default-branch ruleset (opt-in, gated). Looked up by name before any
 * write; an existing ruleset is updated with PUT, never duplicated.
 * Requires Administration write; a 403/404 degrades to report-only.
 */
import { CutwaterError } from "./errors.ts";
import { gh, ghJson, type ExecContext } from "./exec.ts";
import { readAsset } from "./templates.ts";
import { RULESET_NAME } from "../version.ts";

export interface RulesetSummary {
  id: number;
  name: string;
  target: string;
  enforcement: string;
}

interface RulesetDetail extends RulesetSummary {
  conditions?: { ref_name?: { include?: string[]; exclude?: string[] } };
  rules?: { type: string; parameters?: Record<string, unknown> }[];
  bypass_actors?: unknown[];
}

export function desiredRuleset(): RulesetDetail {
  return JSON.parse(readAsset("rulesets/default-branch.json")) as RulesetDetail;
}

export interface RulesetLookup {
  ruleset: RulesetSummary | null;
  error: string | null;
}

/** Find cutwater's ruleset, or any active ruleset that targets ~DEFAULT_BRANCH. */
export async function findRuleset(ctx: ExecContext, repo: string): Promise<RulesetLookup> {
  const result = await gh(ctx, ["api", `repos/${repo}/rulesets`], { allowFailure: true });
  if (result.code !== 0) {
    return {
      ruleset: null,
      error: `cannot read rulesets (${(result.stderr.trim().split("\n")[0] ?? "").slice(0, 120)})`,
    };
  }
  const list = JSON.parse(result.stdout) as RulesetSummary[];
  const named = list.find((ruleset) => ruleset.name === RULESET_NAME);
  if (named) return { ruleset: named, error: null };
  for (const candidate of list.filter(
    (ruleset) => ruleset.target === "branch" && ruleset.enforcement === "active",
  )) {
    const detail = await ghJson<RulesetDetail>(ctx, [
      "api",
      `repos/${repo}/rulesets/${candidate.id}`,
    ]);
    if (detail.conditions?.ref_name?.include?.includes("~DEFAULT_BRANCH"))
      return { ruleset: candidate, error: null };
  }
  return { ruleset: null, error: null };
}

function normalise(detail: RulesetDetail): string {
  const rules = [...(detail.rules ?? [])]
    .map((rule) => ({ type: rule.type, parameters: rule.parameters ?? {} }))
    .sort((a, b) => a.type.localeCompare(b.type));
  return JSON.stringify({
    enforcement: detail.enforcement,
    target: detail.target,
    include: [...(detail.conditions?.ref_name?.include ?? [])].sort(),
    rules: rules.map((rule) => ({
      type: rule.type,
      parameters: Object.fromEntries(
        Object.entries(rule.parameters).sort(([a], [b]) => a.localeCompare(b)),
      ),
    })),
  });
}

export interface RulesetOutcome {
  action: "created" | "updated" | "unchanged" | "needs-confirmation" | "planned";
  id: number | null;
  command: string[];
}

export async function ensureRuleset(
  ctx: ExecContext,
  repo: string,
  confirmed: boolean,
): Promise<RulesetOutcome> {
  const desired = desiredRuleset();
  const lookup = await findRuleset(ctx, repo);
  if (lookup.error) {
    throw new CutwaterError(
      "SCOPE",
      `Ruleset not applied: ${lookup.error}. Rulesets need Administration write permission.`,
    );
  }
  let command: string[];
  let id: number | null = null;
  if (lookup.ruleset) {
    id = lookup.ruleset.id;
    const current = await ghJson<RulesetDetail>(ctx, ["api", `repos/${repo}/rulesets/${id}`]);
    if (normalise(current) === normalise(desired)) return { action: "unchanged", id, command: [] };
    command = ["api", "--method", "PUT", `repos/${repo}/rulesets/${id}`, "--input", "-"];
  } else {
    command = ["api", "--method", "POST", `repos/${repo}/rulesets`, "--input", "-"];
  }
  if (!confirmed) return { action: "needs-confirmation", id, command: ["gh", ...command] };
  const result = await gh(ctx, command, { input: JSON.stringify(desired) });
  if (ctx.dryRun) return { action: "planned", id, command: ["gh", ...command] };
  const created = JSON.parse(result.stdout || "{}") as { id?: number };
  return {
    action: lookup.ruleset ? "updated" : "created",
    id: created.id ?? id,
    command: ["gh", ...command],
  };
}
