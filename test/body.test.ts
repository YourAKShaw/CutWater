import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ISSUE_KINDS,
  issueKindFor,
  renderIssueBody,
  renderPrBody,
  skeletonSections,
} from "../src/lib/body.ts";
import { CutwaterError } from "../src/lib/errors.ts";
import { readAsset } from "../src/lib/templates.ts";

const code = (error: unknown) => (error instanceof CutwaterError ? error.code : null);

test("issue form labels match the agent's body skeleton headings", () => {
  for (const kind of ISSUE_KINDS) {
    const form = readAsset(`issue-forms/${kind}.yml`);
    const labels = [...form.matchAll(/^\s{6}label: (.+)$/gm)].map((match) => match[1]);
    assert.deepEqual(
      labels,
      skeletonSections(kind).map((section) => section.heading),
      kind,
    );
  }
});

test("maps commit types to issue skeletons", () => {
  assert.equal(issueKindFor("feat"), "feature");
  assert.equal(issueKindFor("fix"), "bug");
  assert.equal(issueKindFor("docs"), "docs");
  assert.equal(issueKindFor("refactor"), "chore");
});

test("renders checkboxes for criteria and checklists, None for empty optionals", () => {
  const body = renderIssueBody("feature", {
    sections: {
      Context: "Users lose work when sessions expire.",
      Goal: "Sessions refresh silently.",
      "Acceptance criteria": [
        "Token refreshes 60 s before expiry",
        "- [ ] No logout during active use",
      ],
      Scope: ["Web client"],
      "Task checklist": ["Add refresh timer", "Add tests"],
    },
  });
  assert.match(
    body,
    /## Acceptance criteria\n\n- \[ \] Token refreshes 60 s before expiry\n- \[ \] No logout/,
  );
  assert.match(body, /## Scope\n\n- Web client/);
  assert.match(body, /## Out of scope\n\n_None._/);
});

test("rejects missing required and unknown sections", () => {
  assert.throws(
    () => renderIssueBody("bug", { sections: { Summary: "x" } }),
    (e: unknown) => code(e) === "VALIDATION",
  );
  assert.throws(
    () =>
      renderIssueBody("docs", {
        sections: {
          Context: "a",
          "Pages affected": "b",
          Goal: "c",
          "Acceptance criteria": ["d"],
          "Task checklist": ["e"],
          Extra: "f",
        },
      }),
    /Unknown sections/,
  );
});

const pr = {
  summary: "Refresh access tokens before they expire.",
  issue: 42,
  changes: ["Add a refresh timer"],
  testing: [{ command: "npm test", result: "41 passed" }],
  notVerified: ["Behaviour on Safari"],
};

test("PR bodies always link the issue and list what was not verified", () => {
  const body = renderPrBody(pr);
  assert.match(body, /^## Summary/);
  assert.match(body, /\nCloses #42\n/);
  assert.match(body, /## Not verified\n\n- Behaviour on Safari/);
  assert.match(body, /does not merge/);
});

test("PR bodies require Not verified and an issue or a no-issue reason", () => {
  assert.throws(() => renderPrBody({ ...pr, notVerified: [] }), /notVerified/);
  assert.throws(() => renderPrBody({ ...pr, issue: null }), /noIssueReason/);
  const trivial = renderPrBody({ ...pr, issue: null, noIssueReason: "typo fix in README" });
  assert.match(trivial, /No issue: trivial edit declared by the user \(typo fix in README\)/);
});

test("bodies containing credentials are refused", () => {
  const leaked = { ...pr, summary: `Uses ${"ghp_" + "x".repeat(36)}` };
  assert.throws(
    () => renderPrBody(leaked),
    (e: unknown) => code(e) === "SECRET",
  );
});

test("emits Tracker refs only when given, and validates each ref", () => {
  const sections = {
    Context: "c",
    Goal: "g",
    "Acceptance criteria": ["a"],
    "Task checklist": ["t"],
  };
  assert.doesNotMatch(renderIssueBody("feature", { sections }), /Tracker refs/);
  const body = renderIssueBody("feature", {
    sections,
    trackerRefs: [{ key: "Req-004", url: "https://entalpa.example/req/4" }],
  });
  assert.match(body, /## Tracker refs\n\n- Req-004: https:\/\/entalpa\.example\/req\/4\n$/);
  for (const ref of [
    { key: "Req 004", url: "https://x.example" },
    { key: "Req-004", url: "javascript:alert(1)" },
    { key: "Req-004", url: "https://x.example/a b" },
    { key: "Req-004", url: "https://tracker.example:bad/req/4" },
    { key: "Req-004", url: "https://:443/req/4" },
  ]) {
    assert.throws(
      () => renderIssueBody("feature", { sections, trackerRefs: [ref] }),
      CutwaterError,
    );
  }
});
