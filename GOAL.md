# GOAL.md — Chrome Extension Idea Factory

> The canonical contract. Anything not grounded here is drift.

---

## §1. Mission

Ship **one monetizable Chrome extension per month** by autonomously turning weekly market signal (CWS top charts, HN, Reddit) into a spec'd, PR-built, CI-gated, CWS-ready MV3 extension — without sacrificing quality for speed.

---

## §2. Surface

### §2.1 Repo (the factory)

| Path | Purpose | Owner |
|---|---|---|
| `docs/research/<YYYY-Www>.json` | Raw weekly snapshot, append-only | `research-collector` agent |
| `docs/ideas/<YYYY-Www>.json` | Scored candidate pool | `idea-scorer` agent |
| `docs/specs/<extension-id>/` | One subdir per shipped extension — `GOAL.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `PRIVACY.md` | `spec-writer` agent |
| `src/<extension-id>/` | MV3 source (manifest.json, popup, content script, sidepanel, service worker, lib) | human PR |
| `tests/<extension-id>/` | Unit + integration + Playwright e2e | human PR |
| `assets/<extension-id>/` | Icons, screenshots, promo tiles, contact sheets | human + asset workflow |
| `workflows/` | GitHub Actions YAML — CI, release, asset-pack, dev-console, weekly-digest | human PR |
| `agents/` | Agent definitions — prompts, JSON contracts, helper scripts | human PR |
| `scripts/` | Local CLI tools (contract validator, CWS asset pack, dev console filler) | human PR |
### §2.2 Visual identity

The factory itself has no chrome (the consumer extensions do). The README and `GOAL.md` are plain markdown. No palette locked.

---

## §3. Behavior contracts

Every component of the factory must satisfy these verifiable contracts:

### §3.1 `research-collector` (weekly)

- Fetches **last 7 days** of: CWS top 50 (productivity + devtools), HN Show HN, Reddit r/chrome_extensions + r/sideproject + r/InternetIsBeautiful
- Output: `docs/research/<YYYY-Www>.json` with shape `{week, fetched_at, cws:[], hn:[], reddit:[]}`
- Each entry has `source_id`, `title`, `url`, `metric` (install count / points / score), `timestamp`
- **Contract:** if any of the 5 sources is unreachable, the entry has `partial:true` and the file is still valid JSON (no schema reject)
- **Silent on failure:** no ping if all sources 200; one-shot warning if ≥2 sources 5xx

### §3.2 `idea-scorer` (per research snapshot)

- Reads `docs/research/<YYYY-Www>.json`, dedupes, scores against `agents/contracts/scoring-rubric.json`
- Output: `docs/ideas/<YYYY-Www>.json` — top 50 candidates sorted by `score_total` desc
- Each candidate has: `id`, `name`, `pitch`, `pain`, `source_refs[]`, `scores{demand,wtp,buildability,defensibility}`, `score_total`, `monetization_hint`
- **Contract:** deterministic — same input always produces same output (no LLM in the loop for the score itself)
- **Silent:** no candidate with `score_total < 5.0`

### §3.3 `spec-writer` (per top-1 idea)

- Reads `docs/ideas/<YYYY-Www>.json` top-1
- Output: `docs/specs/<extension-id>/GOAL.md` covering all 9 sections (mission, surface, behavior contracts, permissions, testing, backlog, loops-allowed, versioning, anti-goals) + §10 monetization + §11 first-PR scope
- **Contract:** ≤2,500 words in spec body; every behavior claim traceable to a test in `tests/<extension-id>/`
- **Reject:** missing monetization section, unjustified permissions, contradictory anti-goals

### §3.4 `pr-drafter` (per spec)

- Reads `docs/specs/<extension-id>/`
- Output: branch `<type>/#<issue-number>-<extension-id>-mvp`, PR via `gh pr create --body-file`
- **Contract:** PR body contains `## What` · `## How` · `## Test plan` · `## Checklist`. CI must be green before squash-merge.
- **Reject:** if CI red, no auto-merge — comment in PR with the red CI URL

### §3.5 Repo health

- `npm test` exits 0 (unit + integration)
- `npm run validate` exits 0 (contract schemas)
- All `workflows/*.yml` parse as valid YAML
- `docs/research/` and `docs/ideas/` are append-only (no edits, only new weekly files)

---

## §4. Permissions rationale

This repo is a **monorepo + automation**, not an extension that ships to CWS. **It declares no Chrome permissions.** The shipped extensions (under `src/<extension-id>/`) each declare their own — and that declaration is owned by the spec, not the factory.

`workflows/`-executed GitHub Actions are scoped per-job (minimum scopes only). No deploy tokens are stored in this repo.

---

## §5. Testing contract

| Test type | Tooling | Scope |
|---|---|---|
| Unit | Node's built-in `node:test` | Pure logic in `src/<extension-id>/lib/` |
| Integration | Node + JSDOM | State machines, storage, message passing |
| E2E | Playwright Chromium | Popup render, click flows, `chrome.*` shimmed |
| Contract | AJV | All JSON schemas in `agents/contracts/*.json` must validate a sample payload |

**Gate:** `npm test && npm run test:e2e && npm run validate` must exit 0 before any PR merges.

**Performance contract:** e2e suite must complete in ≤60 seconds (no per-test `page.waitForTimeout()`).

---

## §6. Backlog

See `docs/specs/_template/BACKLOG.md` for the issue shape. Each extension has its own backlog under `docs/specs/<extension-id>/BACKLOG.md`.

The factory itself has a backlog at `docs/specs/_factory/BACKLOG.md` (loops, workflows, agents — not extensions).

---

## §7. Loops-allowed table

| Loop | Allowed surface | Forbidden | Trigger |
|---|---|---|---|
| `weekly-digest` (cron) | Reads `docs/research/`, writes `docs/ideas/` + `docs/specs/`, pings origin chat | Writes to `src/`, `workflows/`, `agents/prompts/` | Mon 09:00 AST |
| `spec-drift-audit` (cron) | Reads `GOAL.md` + code, writes `docs/specs/_factory/drift/<date>.md` | Auto-fixes drift, opens issues | Mon 09:30 AST |
| `score-rubric-backtest` (cron) | Reads `agents/contracts/scoring-rubric.json` + `docs/ideas/` history | Changes the rubric without PR | Fri 16:00 AST |
| `pr-drafter` (agent) | Branch + PR via `gh` | Direct commits to `main`, force-pushes | manual trigger |
| `research-collector` (agent) | Web fetches → `docs/research/` | Anything outside `docs/research/` | weekly cron |

---

## §8. Versioning

Factory: `MAJOR.MINOR.PATCH` — bumped on rubric change (MAJOR), new agent (MINOR), bug fix (PATCH).
Extensions (under `src/<extension-id>/`): each has its own semver, declared in `docs/specs/<extension-id>/CHANGELOG.md`. Store listing version must match `package.json` version.

---

## §9. Anti-goals

The factory is **NOT**:

- ❌ A single extension. This is the factory that builds them.
- ❌ A research repo. We **ship** extensions, not write papers about them.
- ❌ An LLM playground. Every score is deterministic; the LLM is only used for spec drafting (where creativity is wanted).
- ❌ A SaaS itself. The factory runs on free tiers (GH Actions only).
- ❌ A competitive-intelligence tool. We scrape **public** data only; no login walls.
- ❌ A bulk scraper. One snapshot per week per source is the cap.
- ❌ Optimizing for vanity metrics (GitHub stars, CWS installs). The metric is **shipped extensions with paying users**.

---

## §10. Monetization

**The factory itself is MIT and free.** It doesn't monetize.

**Extensions built by the factory** monetize per `docs/specs/_template/GOAL.md` §10:
- Consumer pain, no clear buyer → Stripe tip jar (3 Payment Links)
- B2B devtool → Freemium → SaaS bridge
- Sales / prospecting → Per-seat subscription
- AI wrapper, vertical → Freemium with monthly quota
- Privacy / security → Donation + support tier

**No extension ships without a documented monetization path. Specs that skip it are auto-rejected by `pr-drafter`.**

---

## §11. First-PR scope

The first extension this factory ships is intentionally **boring**:

1. Pick the top-1 idea from the first weekly snapshot
2. Spec it (≤2,500 words, 9 sections + monetization)
3. Build the MVP: `manifest.json` (MV3), popup, content script (1), lib (1 module), 5+ tests
4. Stripe tip jar (3 Payment Links) wired into popup
5. CI green, e2e green, asset pack built, ZIP packaged
6. **Stop at the CWS submission button.** The human clicks submit.

Why boring: validation > novelty. If a vanilla "another note-taker" extension wins, the factory works. If only novel ones do, the factory is broken (selection bias).
