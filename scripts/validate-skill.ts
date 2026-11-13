// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/**
 * Offline package validator for skills/cutwater.
 *
 * Checks the Agent Skills spec rules (frontmatter fields, name, description
 * and compatibility limits), this project's limits (SKILL.md ≤ 300 lines and
 * ≤ ~5,000 tokens, references one level deep, tables of contents for long
 * references), that every local link and anchor resolves, that every
 * reference is reachable from SKILL.md, and that all version numbers agree.
 *
 *   node scripts/validate-skill.ts [skill-dir]
 */
import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SPEC_FIELDS = [
  "name",
  "description",
  "license",
  "allowed-tools",
  "compatibility",
  "metadata",
];
export const MAX_SKILL_LINES = 300;
export const MAX_SKILL_TOKENS = 5000;
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface Frontmatter {
  fields: Record<string, string>;
  metadata: Record<string, string>;
  body: string;
  bodyStartLine: number;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Parses the YAML subset skills use: scalars, folded/literal blocks, one nested map. */
export function parseFrontmatter(text: string): Frontmatter {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0] !== "---") throw new Error("SKILL.md must start with a --- frontmatter line");
  const end = lines.indexOf("---", 1);
  if (end === -1) throw new Error("SKILL.md frontmatter is not closed with ---");
  const fields: Record<string, string> = {};
  const metadata: Record<string, string> = {};
  let i = 1;
  while (i < end) {
    const line = lines[i] ?? "";
    const match = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
    if (!match) {
      if (line.trim() !== "" && !line.trim().startsWith("#"))
        throw new Error(`Unexpected frontmatter line ${i + 1}: ${line}`);
      i++;
      continue;
    }
    const key = match[1] ?? "";
    const rest = (match[2] ?? "").trim();
    i++;
    if (rest === ">-" || rest === ">" || rest === "|" || rest === "|-") {
      const block: string[] = [];
      while (i < end && /^\s+\S|^\s*$/.test(lines[i] ?? "") && !/^[A-Za-z]/.test(lines[i] ?? ""))
        block.push((lines[i++] ?? "").trim());
      fields[key] = rest.startsWith(">")
        ? block.filter((l) => l !== "").join(" ")
        : block.join("\n");
    } else if (rest === "") {
      while (i < end && /^\s+\S/.test(lines[i] ?? "")) {
        const nested = /^\s+([\w-]+):\s*(.*)$/.exec(lines[i] ?? "");
        if (!nested) throw new Error(`Unexpected nested line ${i + 1}`);
        metadata[nested[1] ?? ""] = unquote(nested[2] ?? "");
        i++;
      }
      fields[key] = "";
    } else {
      fields[key] = unquote(rest);
    }
  }
  return { fields, metadata, body: lines.slice(end + 1).join("\n"), bodyStartLine: end + 2 };
}

/** GitHub-style heading anchor. */
export function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function anchors(markdown: string): Set<string> {
  const set = new Set<string>();
  const counts = new Map<string, number>();
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const heading = /^#{1,6}\s+(.+?)\s*#*$/.exec(line)?.[1];
    if (!heading) continue;
    const base = slug(heading);
    const n = counts.get(base) ?? 0;
    set.add(n === 0 ? base : `${base}-${n}`);
    counts.set(base, n + 1);
  }
  return set;
}

export function localLinks(
  markdown: string,
): { target: string; anchor: string | null; line: number }[] {
  const links: { target: string; anchor: string | null; line: number }[] = [];
  let fenced = false;
  markdown.split("\n").forEach((line, index) => {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) return;
    const stripped = line.replace(/`[^`]*`/g, "");
    for (const match of stripped.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = match[1] ?? "";
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      const [target = "", anchor] = href.split("#");
      links.push({ target, anchor: anchor ?? null, line: index + 1 });
    }
  });
  return links;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (lstatSync(abs).isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  stats: {
    skillLines: number;
    estimatedTokens: number;
    descriptionLength: number;
    references: number;
  };
}

export function validateSkill(skillDir: string, repoRoot: string | null): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const skillPath = join(skillDir, "SKILL.md");
  let text: string;
  try {
    text = readFileSync(skillPath, "utf8");
  } catch {
    return {
      errors: ["SKILL.md is missing"],
      warnings,
      stats: { skillLines: 0, estimatedTokens: 0, descriptionLength: 0, references: 0 },
    };
  }
  let fm: Frontmatter;
  try {
    fm = parseFrontmatter(text);
  } catch (error) {
    return {
      errors: [(error as Error).message],
      warnings,
      stats: { skillLines: 0, estimatedTokens: 0, descriptionLength: 0, references: 0 },
    };
  }

  for (const key of Object.keys(fm.fields)) {
    if (!SPEC_FIELDS.includes(key))
      errors.push(
        `frontmatter field "${key}" is not in the Agent Skills spec (${SPEC_FIELDS.join(", ")})`,
      );
  }
  const name = fm.fields.name ?? "";
  if (!NAME.test(name) || name.length > 64)
    errors.push(`name "${name}" must be 1-64 lower-case letters, digits and single hyphens`);
  if (name !== basename(skillDir))
    errors.push(`name "${name}" must match the directory name "${basename(skillDir)}"`);
  if (/anthropic|claude/.test(name)) errors.push(`name "${name}" uses a reserved word`);
  const description = fm.fields.description ?? "";
  if (description.length === 0 || description.length > 1024)
    errors.push(`description must be 1-1024 characters (is ${description.length})`);
  if (/[<>]/.test(description)) errors.push("description must not contain angle brackets");
  if (!/\bUse when\b/.test(description))
    warnings.push('description should say when to use the skill ("Use when …")');
  if ((fm.fields.compatibility ?? "").length > 500)
    errors.push("compatibility must be at most 500 characters");
  if (!fm.metadata.version) errors.push("metadata.version is required for releases");

  const allLines = text.split("\n").length;
  const estimatedTokens = Math.ceil(text.length / 4);
  if (allLines > MAX_SKILL_LINES)
    errors.push(`SKILL.md has ${allLines} lines; the limit is ${MAX_SKILL_LINES}`);
  if (estimatedTokens > MAX_SKILL_TOKENS)
    errors.push(`SKILL.md is ~${estimatedTokens} tokens; the limit is ${MAX_SKILL_TOKENS}`);

  const linked = new Set<string>();
  const checkLinks = (file: string, markdown: string, oneLevel: boolean) => {
    const own = anchors(markdown);
    for (const link of localLinks(markdown)) {
      const where = `${relative(skillDir, file)}:${link.line}`;
      if (link.target === "") {
        if (link.anchor && !own.has(link.anchor))
          errors.push(`${where}: anchor #${link.anchor} not found`);
        continue;
      }
      const abs = resolve(dirname(file), link.target);
      let exists: boolean;
      try {
        const stat = statSync(abs);
        exists = stat.isFile() || stat.isDirectory();
      } catch {
        exists = false;
      }
      if (!exists) {
        errors.push(`${where}: link target ${link.target} does not exist`);
        continue;
      }
      linked.add(abs);
      if (oneLevel && abs.endsWith(".md"))
        errors.push(
          `${where}: references must not link to other Markdown files (keep them one level deep)`,
        );
      if (
        link.anchor &&
        abs.endsWith(".md") &&
        !anchors(readFileSync(abs, "utf8")).has(link.anchor)
      ) {
        errors.push(`${where}: anchor #${link.anchor} not found in ${link.target}`);
      }
    }
  };
  checkLinks(skillPath, fm.body, false);

  const referencesDir = join(skillDir, "references");
  let references: string[] = [];
  try {
    references = readdirSync(referencesDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(referencesDir, f));
  } catch {
    errors.push("references/ is missing");
  }
  for (const ref of references) {
    const markdown = readFileSync(ref, "utf8");
    if (!linked.has(ref)) errors.push(`${relative(skillDir, ref)} is not linked from SKILL.md`);
    const lines = markdown.split("\n");
    if (lines.length > 100 && !lines.slice(0, 12).some((line) => /^## Contents/.test(line))) {
      errors.push(
        `${relative(skillDir, ref)} has ${lines.length} lines and needs a "## Contents" section at the top`,
      );
    }
    checkLinks(ref, markdown, true);
  }

  for (const file of walk(skillDir)) {
    const rel = relative(skillDir, file);
    if (lstatSync(file).isSymbolicLink()) errors.push(`${rel} is a symbolic link`);
    else if (statSync(file).size === 0) errors.push(`${rel} is empty`);
    if (/\.md$/.test(file) && /\b(TODO|TBD|FIXME)\b/.test(readFileSync(file, "utf8")))
      errors.push(`${rel} has an unfinished TODO/TBD/FIXME marker`);
  }
  for (const required of [
    "LICENSE",
    "scripts/cutwater.mjs",
    "agents/openai.yaml",
    "assets/manifest.schema.json",
    "assets/labels.json",
  ]) {
    try {
      statSync(join(skillDir, required));
    } catch {
      errors.push(`${required} is missing`);
    }
  }
  const bundle = (() => {
    try {
      return readFileSync(join(skillDir, "scripts/cutwater.mjs"), "utf8");
    } catch {
      return "";
    }
  })();
  if (bundle && !bundle.startsWith("#!/usr/bin/env node"))
    errors.push("scripts/cutwater.mjs must start with a node shebang");
  if (bundle && /\bfrom ["'](?!node:)[^"'./][^"']*["']/.test(bundle))
    errors.push(
      "scripts/cutwater.mjs imports a non-builtin package; it must have zero dependencies",
    );

  if (repoRoot) {
    const version = fm.metadata.version;
    const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");
    const versions: Record<string, string | undefined> = {
      "package.json": (JSON.parse(read("package.json")) as { version?: string }).version,
      ".claude-plugin/plugin.json": (
        JSON.parse(read(".claude-plugin/plugin.json")) as { version?: string }
      ).version,
      "src/version.ts": /VERSION = "([^"]+)"/.exec(read("src/version.ts"))?.[1],
    };
    for (const [file, value] of Object.entries(versions)) {
      if (value !== version)
        errors.push(`${file} version ${value} does not match SKILL.md metadata.version ${version}`);
    }
    if (
      !read("CHANGELOG.md").includes(`## [${version}]`) &&
      !read("CHANGELOG.md").includes("## [Unreleased]")
    ) {
      errors.push(`CHANGELOG.md has no section for ${version}`);
    }
  }

  return {
    errors,
    warnings,
    stats: {
      skillLines: allLines,
      estimatedTokens,
      descriptionLength: description.length,
      references: references.length,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const skillDir = resolve(process.argv[2] ?? join(repoRoot, "skills/cutwater"));
  const report = validateSkill(skillDir, process.argv[2] ? null : repoRoot);
  for (const warning of report.warnings) console.warn(`⚠️  ${warning}`);
  for (const error of report.errors) console.error(`❌ ${error}`);
  const { skillLines, estimatedTokens, descriptionLength, references } = report.stats;
  console.log(
    `${report.errors.length === 0 ? "✅" : "❌"} ${relative(process.cwd(), skillDir) || "."}: SKILL.md ${skillLines} lines, ~${estimatedTokens} tokens, description ${descriptionLength} chars, ${references} references, ${report.errors.length} errors`,
  );
  process.exit(report.errors.length === 0 ? 0 : 1);
}
