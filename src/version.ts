// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/** Skill version; must match SKILL.md metadata.version, package.json and plugin.json. */
export const VERSION = "0.1.0";

/** Version of the `.github/cutwater.json` manifest format. */
export const SCHEMA_VERSION = 1;

/** Where the setup manifest lives in a managed repository. */
export const MANIFEST_PATH = ".github/cutwater.json";

/** Public location of the manifest schema, referenced from every manifest. */
export const MANIFEST_SCHEMA_URL =
  "https://raw.githubusercontent.com/YourAKShaw/CutWater/main/skills/cutwater/assets/manifest.schema.json";

/** Name of the default-branch ruleset cutwater creates and looks for. */
export const RULESET_NAME = "cutwater-default-branch";
