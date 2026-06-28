# Research snapshots

Append-only weekly market snapshots from the `research-collector` agent.

## File naming

`<YYYY-Www>.json` — ISO week (e.g. `2026-W26.json`).

## Schema

See `agents/contracts/research-snapshot.schema.json`.

Each file has top-level `week`, `fetched_at`, `partial`, and `sources.{cws_productivity,cws_devtools,hn_show_hn,reddit_chrome_extensions,reddit_sideproject,reddit_internet_is_beautiful}`.

Each source has `status` (`ok` / `partial` / `error`), `fetched_count`, `entries[]`, and optional `error`.

## Pipeline

1. `weekly-digest.yml` cron runs Mondays 09:00 AST.
2. `research-collector.js` fetches all 6 sources.
3. If any source fails, the file is still valid JSON with `partial: true`.
4. File is committed by the cron (or kept locally on first run).

## Editing rules

- **Never edit manually.** This directory is cron-owned.
- If a source is missing or broken, file an issue with label `area:research`.
