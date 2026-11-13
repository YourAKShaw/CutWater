// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/**
 * Scans text that is about to be posted to GitHub (issue, PR, comment and
 * wiki bodies) for credentials. Any finding blocks the post. This is a
 * last line of defence against exfiltration, not a complete DLP system.
 */

export interface SecretFinding {
  rule: string;
  line: number;
  preview: string;
}

const RULES: { rule: string; pattern: RegExp }[] = [
  { rule: "github-token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/ },
  { rule: "github-fine-grained-token", pattern: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { rule: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { rule: "private-key", pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
  { rule: "slack-token", pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { rule: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { rule: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { rule: "stripe-live-key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { rule: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { rule: "npm-token", pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  {
    rule: "env-assignment",
    pattern:
      /^\s*(?:export\s+)?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*\s*=\s*["']?[^\s"'<>{}$]{8,}/,
  },
  {
    rule: "url-credentials",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]{6,}@[^\s]+/i,
  },
];

function mask(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "********";
  return `${trimmed.slice(0, 4)}…${"*".repeat(8)}`;
}

export function scanSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, index) => {
    for (const { rule, pattern } of RULES) {
      const match = pattern.exec(line);
      if (match) findings.push({ rule, line: index + 1, preview: mask(match[0]) });
    }
  });
  return findings;
}
