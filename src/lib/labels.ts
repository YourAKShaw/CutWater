// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/** The standard label set: loading, diffing and idempotent sync. */
import { CutwaterError } from "./errors.ts";
import { gh, ghJson, type ExecContext } from "./exec.ts";
import { readAsset } from "./templates.ts";

export interface Label {
  name: string;
  color: string;
  description: string;
}

interface LabelAsset extends Label {
  emoji: string;
}

let cache: LabelAsset[] | null = null;

function assetLabels(): LabelAsset[] {
  if (cache === null) {
    const parsed = JSON.parse(readAsset("labels.json")) as { labels: LabelAsset[] };
    cache = parsed.labels;
  }
  return cache;
}

/** The label name as it appears on GitHub, with the emoji when opted in. */
export function labelName(base: string, emojiLabels: boolean): string {
  const asset = assetLabels().find((label) => label.name === base);
  if (!asset) throw new CutwaterError("USAGE", `Unknown standard label "${base}"`);
  return emojiLabels ? `${asset.emoji} ${asset.name}` : asset.name;
}

export function desiredLabels(emojiLabels: boolean): Label[] {
  return assetLabels().map((label) => ({
    name: emojiLabels ? `${label.emoji} ${label.name}` : label.name,
    color: label.color.toLowerCase(),
    description: label.description,
  }));
}

export interface LabelDiff {
  create: Label[];
  update: Label[];
  ok: Label[];
}

export function diffLabels(desired: Label[], current: Label[]): LabelDiff {
  const byName = new Map(current.map((label) => [label.name.toLowerCase(), label]));
  const diff: LabelDiff = { create: [], update: [], ok: [] };
  for (const label of desired) {
    const existing = byName.get(label.name.toLowerCase());
    if (!existing) diff.create.push(label);
    else if (
      existing.color.toLowerCase() !== label.color.toLowerCase() ||
      (existing.description ?? "") !== label.description
    ) {
      diff.update.push(label);
    } else diff.ok.push(label);
  }
  return diff;
}

export async function listLabels(ctx: ExecContext, repo: string): Promise<Label[]> {
  return ghJson<Label[]>(ctx, [
    "label",
    "list",
    "--repo",
    repo,
    "--json",
    "name,color,description",
    "--limit",
    "500",
  ]);
}

/** `gh label create --force` is an upsert, so this is safe to repeat. */
export async function applyLabels(ctx: ExecContext, repo: string, labels: Label[]): Promise<void> {
  for (const label of labels) {
    await gh(ctx, [
      "label",
      "create",
      label.name,
      "--repo",
      repo,
      "--color",
      label.color,
      "--description",
      label.description,
      "--force",
    ]);
  }
}
