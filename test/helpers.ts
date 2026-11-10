import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createContext, type ExecContext, type RunResult, type Runner } from "../src/lib/exec.ts";

export function tempDir(prefix = "cutwater-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const abs = join(root, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

export interface Call {
  cmd: string;
  args: string[];
}

/** A runner that records calls and answers from a handler. */
export function fakeRunner(
  handler: (cmd: string, args: string[]) => Partial<RunResult> | undefined,
): { runner: Runner; calls: Call[] } {
  const calls: Call[] = [];
  const runner: Runner = async (cmd, args) => {
    calls.push({ cmd, args });
    const result = handler(cmd, args) ?? {};
    return { code: result.code ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
  return { runner, calls };
}

export function testContext(overrides: Partial<ExecContext> = {}): ExecContext {
  return createContext({ retryBaseMs: 0, logFile: null, ...overrides });
}
