# Idea pools

Scored candidate pools from the `idea-scorer` agent.

## File naming

`<YYYY-Www>.json` — same week as the source research snapshot.

## Schema

See `agents/contracts/idea-pool.schema.json`.

Each file has `week`, `scored_at`, `rubric_version`, and `candidates[]` sorted by `score_total` desc.

Each candidate has `id`, `name`, `pitch`, `pain`, `source_refs[]`, `scores{demand,wtp,buildability,defensibility}`, `score_total`, `monetization_hint`, and `dedup_state`.

## Thresholds

- `< 5.0` — dropped from the pool.
- `5.0 – 7.0` — visible in `docs/ideas/`, not eligible for `spec-writer`.
- `≥ 7.0` — eligible for `spec-writer` (the next agent in the pipeline).
- `≥ 7.0` — also the threshold above which `weekly-digest` pings the operator.

## Editing rules

- **Never edit manually.** This directory is cron-owned.
- The score is deterministic — same input → same output. If you want a different score, change `agents/contracts/scoring-rubric.v1.json` via a PR.
