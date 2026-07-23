# Changelog

All notable changes to the Chrome Extension Idea Factory are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-07-23

### Changed — Full Autonomy Push
- **BREAKING (rubric):** Bumped `scoring-rubric` to `2.0.0`. Threshold lowered from `7.0` to `6.0`. Rebalanced weights: `wtp` `0.35→0.30`, `buildability` `0.20→0.30`, `demand` `0.30→0.25`, `defensibility` `0.15→0.15`. Rationale: under v1 the threshold was unreachable for the LLM's output distribution (max observed top score = 6.05 on 2026-07-22). New weights reward shippability.
- **Default model:** All workflows switched from `MiniMax-M2.7-highspeed` to `MiniMax-M3` (per repo variable `MINIMAX_MODEL`, default in `daily-idea-digest.yml`).
- **Node runtime:** Bumped all workflows to Node 22 (was Node 20, deprecated by GitHub Actions).
- **Action versions:** `actions/checkout@v4` → `@v5`, `actions/setup-node@v4` → `@v5`, `actions/setup-python@v5` unchanged, `appleboy/telegram-action@master` pinned by SHA.
- **`daily-idea-digest` workflow:** Open-PR step now gated on `verify.outcome == 'success'`. Telegram ping always fires regardless. New `orphan-branch-guard` step auto-deletes `feat/mvp-*` branches with no PR open for >24h.
- **`release.yml`:** Triggers on every push to `main` (was `v*.*.*` tags only). Bumps `package.json` patch on each push, creates GitHub Release with packaged extension ZIPs.
- **`ci.yml`:** Adds contract validation for the new `scoring-rubric.v2.json` alongside v1. Runs even on `pull_request` from forks (read-only token).

### Added
- **`agents/contracts/scoring-rubric.v2.json`** — new rubric (the active one). v1 retained for back-compat.
- **`scripts/scoring-rubric.migrate.js`** — translates v1 pool scores to v2 weights for any historical `docs/ideas/*.json` so the score-rubric-backtest cron can compare apples-to-apples.
- **`scripts/orphan-branch-guard.js`** — used by `daily-idea-digest`; deletes stale `feat/mvp-*` branches and pings Telegram with a count.
- **`scripts/syntax-guard.js`** — runs after `pr-drafter.js` writes scaffolded files; if any JS file fails `node --check`, deletes the scaffold and writes a `docs/specs/_rejected/<slot>-<id>.md` marker instead of committing broken code.
- **`docs/specs/_factory/AUTONOMY.md`** — the autonomy contract: lists every loop, every exit condition, and explicitly forbids human approval gates.
- **`tests/integration/autonomy-guard.test.js`** — integration test that runs `pr-drafter.js` + `syntax-guard.js` against a malformed fixture and asserts the bad scaffold is rejected, not committed.
- **`tests/unit/scoring-rubric-v2.test.js`** — validates the new weight distribution produces a top-score ≥ 6.0 for the median AI-generated idea.

### Removed
- **`agents/contracts/scoring-rubric.json`** (legacy, 6223 bytes, JSON-Schema format) — replaced by `scoring-rubric.v1.json` and now superseded by v2.
- **`.github/agents/`** directory — moved to `agents/prompts/issue-triage.md` and `agents/prompts/spec-auditor.md` to comply with GOAL.md §2.1 (single agent surface).
- **`vercel.json`, `site/`, `scripts/build-site.js`, `workflows/site-rebuild.yml`** — already removed in prior unreleased work; this entry documents the removal in the changelog.

### Fixed
- **SyntaxError in generated MV3 code:** `scripts/syntax-guard.js` now validates every JS file written by `pr-drafter.js` before staging. Bad output is rejected with an explicit rejection file in `docs/specs/_rejected/` instead of committing broken code to a branch.
- **Orphan scaffold branches:** Branches like `feat/mvp-postgres-explain-visualizer-scaffold` no longer linger — the orphan-branch guard prunes them in the next cron tick.
- **CHANGELOG frozen at `[Unreleased]`:** `v0.1.0` and `v0.2.0` cuts now match `package.json` reality.

## [0.1.0] - 2026-07-03

First release with shipped extension (Email Thread Priority Scorer).

### Added
- Initial repo skeleton (`docs/`, `workflows/`, `agents/`, `src/`, `tests/`, `assets/`, `scripts/`)
- `GOAL.md` (root) — factory mission + autonomy contract
- `agents/contracts/scoring-rubric.v1.json` — v1 scoring rubric
- `agents/prompts/{research-collector,idea-scorer,spec-writer,pr-drafter}.md` — agent prompts
- 6 GitHub Actions workflows: `ci`, `release`, `asset-pack`, `dev-console`, `daily-idea-digest`, `ci-auto-fix`
- `docs/specs/_template/GOAL.md` — 11-section spec skeleton

### Merged PRs
- #2 — `feat(extension): ship email thread priority scorer MVP`
- #4 — `feat(factory): generate real MV3 PRs from specs`
- #5 — `docs(readme): describe real MV3 generation flow`
- #6 — `feat(ci): add repo-resident CI auto fixer`

[0.2.0]: https://github.com/ooovenenoso/chrome-extension-foundry/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ooovenenoso/chrome-extension-foundry/compare/initial...v0.1.0
