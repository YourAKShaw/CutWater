# No-skill baseline (milestone M0)

Following Anthropic's skill-authoring guidance, the baseline shows where an agent fails **without** the skill. Every result is compared with it.

## Protocol

1. Use the same hosts, models, fixtures and queries as `../scenarios.json`, with the cutwater skill **not installed**.
2. Run each scenario 3 or more times per model and grade it with the same judge prompt (`node scripts/evals.ts judge <id>`).
3. Record the results as `baseline-<date>.json` in the `report` input format, plus a short `baseline-<date>.md` that lists the observed failure modes (for example "created a branch before an issue" or "merged when asked").
4. When skill results are reported, show them next to the baseline for the same models.

## Results

None recorded yet.
