# Chrome Extension Idea Factory

> An autonomous system that finds, scores, specs, and ships monetizable Chrome extensions — end to end, every week.

A monorepo of **research data**, **specs**, **GitHub Actions workflows**, and **agent contracts** that turn raw market signal into a working MV3 extension with a Stripe tip jar, packaged for the Chrome Web Store.

---

## What this repo is

This is **not** an extension. It is the **factory** that builds extensions.

```
   ┌────────────────┐    ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
   │  Research      │ ─▶ │  Scoring       │ ─▶ │  Spec          │ ─▶ │  PR            │
   │  (weekly cron) │    │  (deterministic│    │  (agent +      │    │  (CI-gated,    │
   │                │    │   rubric)      │    │   GOAL.md)     │    │   squash merge)│
   └────────────────┘    └────────────────┘    └────────────────┘    └────────────────┘
        CWS top              score 0-10            §1-§9 per issue      manifest MV3
        HN Show HN           WTP signal            PR-first             Stripe tip jar
        Reddit pains         buildability                              CWS ready
```

Every artifact is **versioned**, **dated**, and **append-only**. Nothing deletes. The factory is reproducible: re-run any agent from its inputs and you get the same output.

---

## Repo layout

| Path | Purpose |
|---|---|
| `docs/research/` | Raw weekly snapshots from CWS, HN, Reddit — append-only dated JSON |
| `docs/ideas/` | Scored candidate pool — top 50 by week, ranked by `score_total` |
| `docs/specs/` | `GOAL.md` per candidate — 9-section spec ready for PR-first build |
| `agents/` | All agent definitions (prompts + JSON contracts + helper scripts) |
| `workflows/` | GitHub Actions YAML for CI, release, asset pack, dev console, weekly digest |
| `src/` | Working extension code (one subdir per `docs/specs/<id>`) |
| `tests/` | Unit, integration, and Playwright e2e per extension |
| `assets/` | Icons, screenshots, promo tiles, contact sheets |
| `scripts/` | Local CLI tools (CWS asset pack, dev console filler, contract validator) |
| `.github/agents/` | GitHub Copilot agent definitions for repo automation |

---

## Quick start

```bash
# 1. Run the weekly research collector locally
node agents/scripts/research-collector.js --week 2026-W26 --out docs/research/

# 2. Score this week vs the rubric
node agents/scripts/idea-scorer.js --in docs/research/2026-W26.json --out docs/ideas/

# 3. Pick the top idea, generate GOAL.md
node agents/scripts/spec-writer.js --idea docs/ideas/2026-W26-top1.json --out docs/specs/

# 4. Open a PR with the spec (workflow auto-builds + scores)
gh pr create --base main --head spec/2026-W26-top1 --body-file .github/PULL_REQUEST_TEMPLATE.md
```

---

## The 9-section GOAL.md contract

Every idea that survives scoring gets a `docs/specs/<id>/GOAL.md` written by the `spec-writer` agent. The contract is **identical** to the Save My Prompt playbook so all extensions share the same shape:

1. **Mission** — one sentence
2. **Surface** — popup / sidepanel / content script / new tab / service worker
3. **Behavior contracts** — verifiable in tests
4. **Permissions rationale** — MV3 minimum, justified
5. **Testing contract** — unit + integration + e2e criteria
6. **Backlog** — laser-focused issues (1 PR = 1 concern)
7. **Loops-allowed table** — explicit surface for every cron / agent
8. **Versioning** — semver + store-listing alignment
9. **Anti-goals** — what this is NOT, defended

See `docs/specs/_template/GOAL.md` for the full skeleton.

---

## Monetization model

Every spec carries a **monetization section** derived from the idea's WTP (willingness-to-pay) score:

| WTP signal | Default model |
|---|---|
| Consumer pain, no clear buyer (e.g. productivity) | Stripe tip jar (3 Payment Links: $3/$5/$10) |
| B2B devtool, recurring friction (e.g. CI/CD helpers) | Freemium → SaaS bridge (paid tier via external Stripe) |
| Sales / prospecting pain (e.g. LinkedIn, email) | Per-seat subscription, $10-30/mo |
| AI wrapper, vertical (e.g. meeting summarizer) | Freemium with monthly quota, $5-15/mo |
| Privacy / security (e.g. tracker blocker) | Donation + paid "support tier" |

**Rule:** no extension ships without a documented monetization path. Specs that skip it are auto-rejected by `pr-drafter`.

---

## Autonomy contract

| Agent | Allowed surface | Forbidden |
|---|---|---|
| `research-collector` | Read-only web fetches → `docs/research/<date>.json` | Writes to `src/`, `docs/specs/`, or any PR |
| `idea-scorer` | `docs/research/` → `docs/ideas/` | External API calls, web fetches |
| `spec-writer` | `docs/ideas/<top>.json` → `docs/specs/<id>/GOAL.md` | Anything outside `docs/specs/` |
| `pr-drafter` | `docs/specs/<id>/` → branch + PR via `gh` | Direct commits to `main`, force-pushes |

**Silence-by-default:** weekly cron only pings if a new top-5 idea emerges with `score_total ≥ 7.0`. No-op weeks are silent.

---

## License

MIT — see `LICENSE`.

---

## Status

| | |
|---|---|
| Repo | 🟢 scaffold + contracts |
| Research loop | 🟡 first weekly snapshot pending |
| Scoring rubric | 🟢 v1 (see `agents/contracts/scoring-rubric.json`) |
| Spec templates | 🟢 v1 (see `docs/specs/_template/`) |
| CI workflow | 🟢 ready |
| Release workflow | 🟢 ready |
| Public site | n/a (repo-only) |
| First extension | 🔴 not yet built |
