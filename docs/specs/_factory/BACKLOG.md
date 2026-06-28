# Factory Backlog

> Issues for the factory itself — not extensions. See each `docs/specs/<extension-id>/BACKLOG.md` for extension-specific issues.

## Icebox

- [ ] F-007 — Self-hosted weekly digest email (currently Telegram-only ping) [score: 6]
- [ ] F-008 — Backfill historical snapshots from CWS API (≥12 weeks) [score: 4]
- [ ] F-009 — Score-rubric A/B test harness (run old + new, compare top-5) [score: 7]

## Ready

- [ ] F-001 — First weekly research snapshot via cron
  - **What:** Wire `weekly-digest.yml` to call `research-collector.js`, write to `docs/research/<YYYY-Www>.json`
  - **Why:** Validates the research loop end-to-end before any spec ships
  - **Acceptance criteria:** One snapshot file exists, validates against `agents/contracts/research-snapshot.schema.json`, ≥3 sources populated
  - **Out of scope:** Scoring, spec writing, PR drafting

- [ ] F-002 — First scored candidate pool
  - **What:** Run `idea-scorer.js` against first snapshot
  - **Why:** Validates the deterministic scoring rubric
  - **Acceptance criteria:** `docs/ideas/<YYYY-Www>.json` exists, ≥5 candidates with `score_total ≥ 5.0`
  - **Out of scope:** Spec writing

- [ ] F-003 — First extension spec
  - **What:** Run `spec-writer.js` against top-1 candidate, write `docs/specs/<id>/GOAL.md`
  - **Why:** Validates the spec-writer agent + 9-section contract
  - **Acceptance criteria:** GOAL.md exists, ≤2,500 words, all 9 sections + monetization present
  - **Out of scope:** Code

- [ ] F-004 — First extension MVP (PR)
  - **What:** Per the chosen spec's §11 First-PR scope
  - **Why:** Proves end-to-end: research → spec → code → CI → CWS-ready
  - **Acceptance criteria:** PR merged, CI green, `extension.zip` built
  - **Out of scope:** CWS submission (human-only)

## In progress

_(none)_

## Shipped

_(none)_
