// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/** Skill version; must match SKILL.md metadata.version, package.json and plugin.json. */
export const VERSION = "0.1.0";

/**
 * Newest `.github/cutwater.json` format this helper reads and writes. v1 stays
 * readable, and the writer emits v2 only when a Project was applied.
 */
export const SCHEMA_VERSION = 2;

/** Manifest formats this helper reads. */
export const SCHEMA_VERSIONS: readonly number[] = [1, 2];

/** Where the setup manifest lives in a managed repository. */
export const MANIFEST_PATH = ".github/cutwater.json";

/** Public location of the manifest schema, referenced from every manifest. */
export const MANIFEST_SCHEMA_URL =
  "https://raw.githubusercontent.com/YourAKShaw/CutWater/main/skills/cutwater/assets/manifest.schema.json";

/** Name of the default-branch ruleset cutwater creates and looks for. */
export const RULESET_NAME = "cutwater-default-branch";
