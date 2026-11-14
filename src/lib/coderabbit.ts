// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/**
 * Post-apply guidance for CodeRabbit. The config file only tunes reviews;
 * the steps here are user actions in GitHub or CodeRabbit, which the agent
 * explains but never performs. Details: references/coderabbit.md.
 */
import type { Answers } from "./answers.ts";

export const CODERABBIT_REFERENCE = "references/coderabbit.md";

/** The compact checklist (at most 8 lines), or [] when CodeRabbit is off. */
export function coderabbitNextSteps(answers: Answers): string[] {
  if (answers.coderabbit === undefined || answers.coderabbit === "off") return [];
  return [
    "CodeRabbit next steps (user actions; details in " + CODERABBIT_REFERENCE + "):",
    "1. Install the CodeRabbit GitHub App on the repository.",
    "2. If a bot opens the PRs, assign it a review seat in CodeRabbit Team Management (may be billed).",
    "3. Commit the CodeRabbit config with the setup.",
    "4. Keep CodeRabbit out of the ruleset's required checks.",
    "5. Optional: install the CodeRabbit CLI and run `cr auth login` yourself.",
  ];
}
