// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/** Stack and project-metadata detection for interview defaults. */
import { basename, join } from "node:path";
import { isFile, readText } from "./fsutil.ts";

export const STACKS = ["node-ts", "node", "python", "go", "generic"] as const;
export type Stack = (typeof STACKS)[number];

export interface StackProfile {
  label: string;
  ciTemplate: string;
  gitignoreTemplate: string;
  /** Dependabot ecosystem, or "" when only GitHub Actions are updated. */
  packageEcosystem: string;
  installCommand: string;
  testCommand: string;
}

export function stackProfile(stack: Stack, root: string): StackProfile {
  const hasLock = isFile(join(root, "package-lock.json"));
  switch (stack) {
    case "node-ts":
    case "node":
      return {
        label: stack === "node-ts" ? "Node.js / TypeScript" : "Node.js",
        ciTemplate: "workflows/ci-node.yml",
        gitignoreTemplate: "repo/gitignore-node",
        packageEcosystem: "npm",
        installCommand: hasLock ? "npm ci" : "npm install",
        testCommand: "npm test",
      };
    case "python":
      return {
        label: "Python",
        ciTemplate: "workflows/ci-python.yml",
        gitignoreTemplate: "repo/gitignore-python",
        packageEcosystem: "pip",
        installCommand: "python -m pip install -e .",
        testCommand: "pytest",
      };
    case "go":
      return {
        label: "Go",
        ciTemplate: "workflows/ci-go.yml",
        gitignoreTemplate: "repo/gitignore-go",
        packageEcosystem: "gomod",
        installCommand: "go mod download",
        testCommand: "go test ./...",
      };
    case "generic":
      return {
        label: "Generic (no toolchain detected)",
        ciTemplate: "workflows/ci-generic.yml",
        gitignoreTemplate: "repo/gitignore-generic",
        packageEcosystem: "",
        installCommand: "# no install step detected",
        testCommand: "# no test command detected",
      };
  }
}

export interface Detection {
  stack: Stack;
  evidence: string[];
  name: string;
  description: string;
}

function readJson(path: string): Record<string, unknown> | null {
  const text = readText(path);
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function tomlString(toml: string, key: string): string | null {
  // Reads `key = "value"` inside the [project] table (PEP 621).
  const section = /^\[project\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(toml);
  if (!section) return null;
  const match = new RegExp(`^${key}\\s*=\\s*["']([^"']*)["']`, "m").exec(section[1] ?? "");
  return match?.[1] ?? null;
}

export function detect(root: string): Detection {
  const evidence: string[] = [];
  let stack: Stack = "generic";
  let name = basename(root);
  let description = "";

  const pkg = readJson(join(root, "package.json"));
  if (pkg) {
    evidence.push("package.json");
    const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) };
    const ts = isFile(join(root, "tsconfig.json")) || "typescript" in deps;
    if (isFile(join(root, "tsconfig.json"))) evidence.push("tsconfig.json");
    stack = ts ? "node-ts" : "node";
    if (typeof pkg.name === "string" && pkg.name !== "") name = pkg.name.replace(/^@[^/]+\//, "");
    if (typeof pkg.description === "string") description = pkg.description;
  } else if (
    isFile(join(root, "pyproject.toml")) ||
    isFile(join(root, "requirements.txt")) ||
    isFile(join(root, "setup.py"))
  ) {
    stack = "python";
    for (const file of ["pyproject.toml", "requirements.txt", "setup.py"]) {
      if (isFile(join(root, file))) evidence.push(file);
    }
    const toml = readText(join(root, "pyproject.toml"));
    if (toml) {
      name = tomlString(toml, "name") ?? name;
      description = tomlString(toml, "description") ?? "";
    }
  } else if (isFile(join(root, "go.mod"))) {
    stack = "go";
    evidence.push("go.mod");
    const mod = /^module\s+(\S+)/m.exec(readText(join(root, "go.mod")) ?? "");
    if (mod?.[1]) name = mod[1].split("/").pop() ?? name;
  }
  return { stack, evidence, name, description };
}
