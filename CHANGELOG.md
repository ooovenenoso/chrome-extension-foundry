# Changelog

All notable changes to the Chrome Extension Idea Factory are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial repo skeleton (`docs/`, `workflows/`, `agents/`, `src/`, `tests/`, `assets/`, `scripts/`)
- `GOAL.md` (root) — factory mission + autonomy contract
- `agents/contracts/scoring-rubric.json` — v1 scoring rubric
- `agents/prompts/research-collector.md` — weekly research agent prompt
- `agents/prompts/idea-scorer.md` — deterministic scoring agent prompt
- `agents/prompts/spec-writer.md` — GOAL.md generator agent prompt
- `agents/prompts/pr-drafter.md` — PR-first opener agent prompt
- `workflows/ci.yml` — unit + integration + Playwright e2e gate
- `workflows/release.yml` — `extension.zip` + GitHub Release on tag
- `workflows/asset-pack.yml` — Pillow normalize + ZIP for CWS submission
- `workflows/dev-console.yml` — Playwright CDP for CWS DevDashboard fill
- `workflows/weekly-digest.yml` — Monday 9am AST research + scoring ping
- `docs/specs/_template/GOAL.md` — 9-section spec skeleton

### Removed
- `vercel.json`, `site/`, `scripts/build-site.js`, `workflows/site-rebuild.yml` — repo-only, no public deploy surface

### Pending (first cron run)
- `docs/research/<YYYY-Www>.json` — first weekly research snapshot
- `docs/ideas/<YYYY-Www>.json` — first scored candidate pool
- `docs/specs/<first-id>/GOAL.md` — first extension spec

[Unreleased]: https://github.com/<owner>/chrome-extension-idea-factory/compare/main...HEAD
