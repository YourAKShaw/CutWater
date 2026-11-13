import assert from "node:assert/strict";
import { test } from "node:test";
import { lintTitle, parseTitle } from "../src/lib/title.ts";

const rules = (title: string, opts = {}) => lintTitle(title, opts).errors.map((e) => e.rule);

test("accepts the valid rows of the convention table", () => {
  for (const title of [
    "🔒️ feat(exec): pin gh project calls to the repository owner",
    "🐛 fix(preflight): report missing project scope when Projects are chosen",
    "✨ feat(projects): ship opt-in GitHub Projects support in v0.2.0",
    "🔍️ docs(gh-commands): verify `gh project` capabilities and token matrix",
    "🏗️ docs(adr): record ADR 0010 for GitHub Projects integration",
    "✨ [Req-004] feat(install): back up hook config before writing it",
    "🐛 [PROV-142] fix(daemon): fall back to spool when the socket is gone",
    "✨ [ENG-87] feat(tui): show live diff per agent session",
    "♻️ refactor(api)!: drop the v1 endpoints",
    "🔒 feat(exec): accept the emoji without its variation selector",
    "🐛 fix(api): GitHub returns 502 on large payloads",
  ]) {
    assert.deepEqual(rules(title), [], title);
  }
});

test("rejects each invalid row with its rule", () => {
  const cases: [string, string][] = [
    ["feat(exec): pin gh project calls", "emoji-missing"],
    ["✨🔒 feat(exec): pin calls", "emoji-multiple"],
    [":sparkles: feat(exec): pin calls", "emoji-shortcode"],
    ["✨ Feat(Exec): Added owner pinning.", "type-case"],
    ["✨ Feat(Exec): Added owner pinning.", "scope-case"],
    ["✨ Feat(Exec): Added owner pinning.", "summary-case"],
    ["✨ Feat(Exec): Added owner pinning.", "summary-full-stop"],
    ["✨ feat: owner pinning", "scope-missing"],
    ["EPIC: Projects", "emoji-missing"],
    ["✨ EPIC: Projects", "kind-in-title"],
    ["✨ [Req-004][Req-005] feat(install): back up config", "ticket-multiple"],
    ["[Req-004] ✨ feat(install): back up config", "ticket-position"],
    ["✨ feat(install): back up hook config [Req-004]", "ticket-position"],
    ["✨ [N/A] feat(ci): fix the build", "ticket-placeholder"],
    ["✨ [Req-004] Feat(install): back up config", "type-case"],
    ["🐛 feat(exec): pin calls", "emoji-type-mismatch"],
    ["🦄 feat(exec): pin calls", "emoji-unknown"],
    ["✨ feature(exec): pin calls", "type-enum"],
    ["🐛 fix(<scope>): crash on start", "scope-placeholder"],
    ["🐛 fix(api): crash on start #12", "summary-issue-number"],
    ["🐛 fix(api): [WIP] crash on start", "kind-in-title"],
    ["✨  feat(api): two spaces", "title-whitespace"],
    ["✨feat(api): no space", "emoji-space"],
    ["✨ feat(api): " + "x".repeat(70), "title-length"],
    ["✨ feat(api): hidden\u202etext", "title-hidden-chars"],
    ["✨ [a b; rm -rf] feat(api): inject", "ticket-format"],
    ["✨ [ABCDEFGHIJKLMNOPQRSTU-1] feat(api): long key", "ticket-length"],
    ["", "title-empty"],
  ];
  for (const [title, rule] of cases) {
    assert.ok(rules(title).includes(rule), `${title} → ${rules(title).join(",")}`);
  }
});

test("validates the ticket against the configured tracker", () => {
  assert.deepEqual(rules("✨ [Req-004] feat(install): back up config", { tracker: "entalpa" }), []);
  assert.deepEqual(rules("✨ [REQ-4] feat(install): back up config", { tracker: "entalpa" }), [
    "ticket-format",
  ]);
  assert.deepEqual(rules("✨ [PROV-142] feat(api): add x", { tracker: "jira" }), []);
  assert.deepEqual(rules("✨ [prov-142] feat(api): add x", { tracker: "jira" }), ["ticket-format"]);
});

test("the ticket prefix does not count toward the 72-character limit", () => {
  const core = "feat(api): " + "x".repeat(61);
  assert.equal([...core].length, 72);
  assert.deepEqual(rules(`✨ [ENG-87] ${core}`), []);
});

test("checks the type label", () => {
  assert.deepEqual(rules("✨ feat(api): add x", { labelType: "fix" }), ["type-label-mismatch"]);
});

test("parses the parts", () => {
  assert.deepEqual(parseTitle("✨ [Req-004] feat(install)!: back up"), {
    emoji: "✨",
    ticket: "Req-004",
    type: "feat",
    scope: "install",
    breaking: true,
    summary: "back up",
  });
});
