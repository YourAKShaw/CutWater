# Vendored CodeRabbit schema

`schema.v2.json` is a third-party file, copied unchanged from
<https://coderabbit.ai/integrations/schema.v2.json> on 2026-11-14 (JSON Schema draft 2020-12).

`test/coderabbit-schema.test.ts` validates the rendered `assets/repo/coderabbit.yaml` against it
offline, so a template change that CodeRabbit would reject fails CI. Refresh it when CodeRabbit
changes its schema (see `docs/MAINTENANCE.md`), then run `npm test`.
