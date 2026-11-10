/**
 * Unified diff between two texts, used to show the user exactly what an
 * overwrite would change before they say yes (invariant I3).
 */
import { normalizeEol } from "./fsutil.ts";

type Op = { kind: " " | "-" | "+"; line: string };

/** Above this many lines per side the diff falls back to a full replace. */
const MAX_LCS_LINES = 5000;

function splitLines(text: string): string[] {
  const lines = normalizeEol(text).split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function diffOps(a: string[], b: string[]): Op[] {
  // Trim the common prefix and suffix first; most edits are local.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const ops: Op[] = a.slice(0, start).map((line) => ({ kind: " ", line }));

  if (midA.length > MAX_LCS_LINES || midB.length > MAX_LCS_LINES) {
    ops.push(...midA.map((line): Op => ({ kind: "-", line })));
    ops.push(...midB.map((line): Op => ({ kind: "+", line })));
  } else {
    const n = midA.length;
    const m = midB.length;
    const table = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * (m + 1) + j] =
          midA[i] === midB[j]
            ? (table[(i + 1) * (m + 1) + j + 1] ?? 0) + 1
            : Math.max(table[(i + 1) * (m + 1) + j] ?? 0, table[i * (m + 1) + j + 1] ?? 0);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        ops.push({ kind: " ", line: midA[i] ?? "" });
        i++;
        j++;
      } else if (
        i < n &&
        (j === m || (table[(i + 1) * (m + 1) + j] ?? 0) >= (table[i * (m + 1) + j + 1] ?? 0))
      ) {
        // Prefer deletions first so a replaced line reads "-old" then "+new".
        ops.push({ kind: "-", line: midA[i] ?? "" });
        i++;
      } else {
        ops.push({ kind: "+", line: midB[j] ?? "" });
        j++;
      }
    }
  }
  ops.push(...a.slice(endA).map((line): Op => ({ kind: " ", line })));
  return ops;
}

/** Unified diff with `context` lines around each change; "" when equal. */
export function unifiedDiff(oldText: string, newText: string, path: string, context = 3): string {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const ops = diffOps(a, b);
  if (!ops.some((op) => op.kind !== " ")) return "";

  const out = [`--- a/${path}`, `+++ b/${path}`];
  let index = 0;
  while (index < ops.length) {
    while (index < ops.length && ops[index]?.kind === " ") index++;
    if (index >= ops.length) break;
    const hunkStart = Math.max(0, index - context);
    let hunkEnd = index;
    // Extend the hunk while changes are within 2 * context of each other.
    let cursor = index;
    while (cursor < ops.length) {
      if (ops[cursor]?.kind !== " ") {
        hunkEnd = cursor;
        cursor++;
        continue;
      }
      let run = 0;
      while (cursor + run < ops.length && ops[cursor + run]?.kind === " ") run++;
      if (cursor + run >= ops.length || run > context * 2) break;
      cursor += run;
    }
    const sliceEnd = Math.min(ops.length, hunkEnd + context + 1);
    let oldLine = 1;
    let newLine = 1;
    for (let k = 0; k < hunkStart; k++) {
      if (ops[k]?.kind !== "+") oldLine++;
      if (ops[k]?.kind !== "-") newLine++;
    }
    const hunk = ops.slice(hunkStart, sliceEnd);
    const oldCount = hunk.filter((op) => op.kind !== "+").length;
    const newCount = hunk.filter((op) => op.kind !== "-").length;
    out.push(
      `@@ -${oldCount === 0 ? oldLine - 1 : oldLine},${oldCount} +${newCount === 0 ? newLine - 1 : newLine},${newCount} @@`,
    );
    for (const op of hunk) out.push(`${op.kind}${op.line}`);
    index = sliceEnd;
  }
  return `${out.join("\n")}\n`;
}
