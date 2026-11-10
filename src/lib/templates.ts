/**
 * Template rendering for files in assets/.
 *
 * Syntax (deliberately tiny):
 *   {{name}}                 substitute a variable (identifier characters only)
 *   {{#if name}} … {{/if}}   keep the enclosed lines when the value is truthy
 *   {{#unless name}} … {{/unless}}
 * Block tags must sit alone on their line; the tag lines are removed.
 * GitHub Actions expressions such as `${{ github.ref }}` contain spaces or
 * dots and are left untouched. Unknown variables are an error.
 */
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { CutwaterError } from "./errors.ts";
import { isDir, readText } from "./fsutil.ts";

export type TemplateValue = string | boolean | number | null;
export type TemplateVars = Record<string, TemplateValue>;

const BLOCK = /^\s*\{\{(#if|#unless|\/if|\/unless) ?([A-Za-z][A-Za-z0-9]*)?\}\}\s*$/;
const VARIABLE = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;

function truthy(value: TemplateValue | undefined): boolean {
  return value !== undefined && value !== null && value !== false && value !== "" && value !== 0;
}

export function render(template: string, vars: TemplateVars, name = "template"): string {
  const out: string[] = [];
  const stack: { tag: string; keep: boolean }[] = [];
  const lines = template.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, index) => {
    const block = BLOCK.exec(line);
    if (block) {
      const [, tag = "", key] = block;
      if (tag === "#if" || tag === "#unless") {
        if (key === undefined)
          throw new CutwaterError("VALIDATION", `${name}:${index + 1}: ${tag} needs a name`);
        if (!(key in vars))
          throw new CutwaterError("VALIDATION", `${name}:${index + 1}: unknown variable "${key}"`);
        const value = truthy(vars[key]);
        stack.push({ tag: tag.slice(1), keep: tag === "#if" ? value : !value });
      } else {
        const open = stack.pop();
        if (!open || open.tag !== tag.slice(1)) {
          throw new CutwaterError("VALIDATION", `${name}:${index + 1}: unmatched {{${tag}}}`);
        }
      }
      return;
    }
    if (stack.some((frame) => !frame.keep)) return;
    out.push(
      line.replace(VARIABLE, (_match, key: string) => {
        if (!(key in vars)) {
          throw new CutwaterError("VALIDATION", `${name}:${index + 1}: unknown variable "${key}"`);
        }
        const value = vars[key];
        return value === null || value === undefined ? "" : String(value);
      }),
    );
  });
  if (stack.length > 0)
    throw new CutwaterError("VALIDATION", `${name}: unclosed {{#${stack[0]?.tag}}}`);
  return out.join("\n");
}

let cachedAssetsDir: string | null = null;

/**
 * Locate the skill's assets/ directory. The bundled helper lives in
 * skills/cutwater/scripts/, the TypeScript source in src/lib/.
 */
export function assetsDir(): string {
  if (process.env.CUTWATER_ASSETS) return process.env.CUTWATER_ASSETS;
  if (cachedAssetsDir !== null) return cachedAssetsDir;
  const here = fileURLToPath(new URL(".", import.meta.url));
  for (const candidate of [
    join(here, "..", "assets"),
    join(here, "..", "..", "skills", "cutwater", "assets"),
  ]) {
    if (isDir(candidate)) {
      cachedAssetsDir = candidate;
      return candidate;
    }
  }
  throw new CutwaterError("USAGE", "Cannot find the cutwater assets/ directory next to the helper");
}

export function readAsset(relPath: string): string {
  const text = readText(join(assetsDir(), relPath));
  if (text === null) throw new CutwaterError("USAGE", `Missing asset: assets/${relPath}`);
  return text;
}

export function renderAsset(relPath: string, vars: TemplateVars): string {
  return render(readAsset(relPath), vars, `assets/${relPath}`);
}
