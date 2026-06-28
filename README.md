# Chrome Extension Idea Factory

> An autonomous system that finds, scores, specs, and ships monetizable Chrome extensions — end to end, twice every weekday.

A monorepo of **research data**, **scored idea pools**, **drafted specs**, **GitHub Actions workflows**, and **agent contracts** that turn AI-generated market signal into a working MV3 extension with a Stripe tip jar, packaged for the Chrome Web Store.

The goal is not to generate ideas — **the goal is to publish Chrome extensions**. Ideas are the input; extensions are the output.

---

## How it works

```
GitHub Actions (cloud, on this repo)
  cron: 0 1,13 * * 1-5 UTC  →  9am AST + 9pm AST, Mon–Fri
  manual: gh workflow run daily-idea-digest.yml
```

Every run executes this pipeline:

| # | Step | Agent / Action | What it does | Output |
|---|---|---|---|---|
| 1 | research-collector | `agents/scripts/research-collector.js` | Calls MiniMax-M2.7-highspeed chat completions (JSON mode) to generate 15 fresh Chrome-extension ideas. Extracts JSON from response (handles `<!-- raw HTML omitted -->...<!-- raw HTML omitted -->` thinking blocks). Dedups by Jaccard similarity (≥ 0.75) against the last 60 snapshots. Falls back to top-3 lowest-jaccard entries if dedup eats everything. | `docs/research/<slot>.json` (15 raw → 5-12 after dedup) |
| 2 | idea-scorer | `agents/scripts/idea-scorer.js` | Reads the snapshot. For each idea scores 4 axes: `demand` (from `metric.llm_demand` 1-10), `wtp` (audience → tier score), `buildability` (keyword factors), `defensibility` (vertical moat). Total = weighted sum. | `docs/ideas/<slot>.json` (3-5 candidates ≥ 5.0) |
| 3 | validate-contracts | `scripts/validate-contracts.js` | AJV validates every JSON against schemas. | exit 0 or abort |
| 4 | threshold check | bash inline | Reads top score. If ≥ 7.0 → `spec_threshold=true`. | step outputs |
| 5a | spec-writer | `agents/scripts/spec-writer.js` | **Only if threshold hit.** Fills `docs/specs/_template/GOAL.md` (11 sections) with the top idea. Writes BACKLOG.md. Hard rejects: pitch <50 chars, pain <80 chars, score <7, dedup jaccard ≥0.5, missing monetization. | `docs/specs/<id>/GOAL.md` + `BACKLOG.md` |
| 5b | or reject | spec-writer | If quality check fails: writes `docs/specs/_rejected/<slot>-<id>.md` and exits 1. No PR, no Telegram. | rejected file |
| 6 | commit auto | bash | `git add docs/* && git pull --rebase origin main && git commit && git push`. Rebase avoids conflicts between concurrent runs. | commit `chore(digest): daily AI ideas + scoring for <slot>` on `main` |
| 7 | pr-drafter | `agents/scripts/pr-drafter.js` | **Only if threshold hit.** Generates MV3 scaffold (10 files: manifest, popup, contentScript, lib, tests, STRIPE_LINKS placeholder, PRIVACY.md) and stages them in git. | 10 staged files |
| 8 | open PR | `peter-evans/create-pull-request@v6` | Commits the staged scaffold on branch `feat/mvp-<id>-scaffold`, opens a PR against `main`. | PR #N opened |
| 9 | Telegram ping | `appleboy/telegram-action@master` | Sends a message to chat `Home` (id `7996285776`) with the top idea, score, and PR number. | Telegram notification |

---

## Output paths

There are two paths depending on whether a "good" idea emerged.

### Path A — the silent majority (every run)

```
score < 7.0
   ↓
docs/research/<slot>.json       ← raw LLM ideas
docs/ideas/<slot>.json          ← scored pool
commit on main                  ← "chore(digest): daily AI ideas + scoring for <slot>"
   END
```

This is what happens on ~80% of runs. No PR, no Telegram, no spec.

### Path B — the happy path (threshold hit + quality OK)

```
score ≥ 7.0 AND pitch ≥ 50 AND pain ≥ 80 AND monetization present
   ↓
docs/specs/<extension-id>/GOAL.md       ← 11-section spec
docs/specs/<extension-id>/BACKLOG.md    ← MVP issues
commit on main                          ← "chore(digest): ... (+ spec)"
PR #N opened on branch feat/mvp-<id>-scaffold
   ↓ contains:
   ├─ src/<extension-id>/manifest.json   ← MV3
   ├─ src/<extension-id>/popup.{html,css,js}
   ├─ src/<extension-id>/contentScript.js
   ├─ src/<extension-id>/lib/hello.js
   ├─ src/<extension-id>/PRIVACY.md
   ├─ tests/unit/hello.test.js
   ├─ tests/integration/manifest.test.js
   └─ STRIPE_LINKS.md (placeholder)
Telegram ping to chat Home
   END
```

---

## From PR to Chrome Web Store (manual)

The workflow stops at PR. Everything after is human work — by design, to keep one engineer in the loop on what actually ships.

```
1. Open PR #N
2. Read docs/specs/<id>/GOAL.md end-to-end
3. Implement §3 features in src/<id>/
4. Replace STRIPE_LINKS.md placeholders with real Stripe Payment Links
5. Run `npm test` locally; CI re-runs on push
6. Squash-merge to main
7. Manual: run `asset-pack.yml` from GitHub Actions UI
   → generates icons + screenshots in assets/<id>/cws-final/
8. Manual: run `dev-console.yml` from GitHub Actions UI (one time)
   → fills Chrome Web Store Developer Dashboard
9. git tag v0.1.0 && git push --tags
   → release.yml triggers, packages src/<id>/ into <id>-v0.1.0.zip
   → attaches to a GitHub Release
10. Download the .zip, upload to Chrome Web Store Developer Dashboard
11. Click "Submit for review"
12. 🎉 Live in Chrome Web Store
```

---

## Why 2×/day and not weekly

The previous version ran once a week on Monday morning. With an LLM at temperature 0.9, the score variance is high — Monday's run might produce a 6.2 top, then 7 days of silence. With 2×/day we get ~14 chances per week instead of 1, and the system captures more threshold hits without sacrificing determinism (the rubric is fixed, only the LLM output varies).

---

## Configuration

### Environment variables

| Name | Required | Default | Purpose |
|---|---|---|---|
| `MINIMAX_API_KEY` | yes | — | MiniMax chat completions API key |
| `MINIMAX_MODEL` | no | `MiniMax-M2.7-highspeed` | Any MiniMax chat model |
| `MINIMAX_BASE_URL` | no | `https://api.minimax.io/v1` | Endpoint |

For local dev, copy `.env.example` → `.env`. The `npm run research` script uses `node --env-file=.env` automatically.

### GitHub Secrets (production)

Set these on the repo before the first workflow run:

| Secret | Purpose |
|---|---|
| `MINIMAX_API_KEY` | Same as env var above |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Target chat id |

Optional GitHub Variables: `MINIMAX_MODEL`, `MINIMAX_BASE_URL` (override defaults).

---

## Repo layout

| Path | Purpose |
|---|---|
| `docs/research/` | AI-generated snapshots per slot — append-only dated JSON |
| `docs/ideas/` | Scored candidate pools — top ideas ranked by `score_total` |
| `docs/specs/` | `GOAL.md` + `BACKLOG.md` per idea that crossed 7.0 with quality OK |
| `docs/specs/_rejected/` | Spec-writer rejections (debug aid) |
| `agents/scripts/` | research-collector, idea-scorer, spec-writer, pr-drafter |
| `agents/contracts/` | AJV schemas + scoring rubric |
| `agents/prompts/` | Agent role docs (one .md per agent) |
| `.github/workflows/` | daily-idea-digest (main), release, asset-pack, dev-console, ci |
| `src/` | Extension code (one subdir per `docs/specs/<id>`) |
| `tests/` | Unit + integration per extension |
| `assets/` | Icons, screenshots, promo tiles (manual workflow output) |
| `scripts/` | Local CLI tools (validate-contracts, asset-pack, dev-console) |

---

## Spec contract

Every idea that crosses the threshold gets a `docs/specs/<id>/GOAL.md` with 11 sections:

1. **Mission** — one sentence (who is this for, what pain, how they describe it to a friend)
2. **Surface** — popup / sidepanel / content script / new tab / service worker
3. **Behavior contracts** — verifiable in tests
4. **Permissions rationale** — MV3 minimum, justified per permission
5. **Testing contract** — unit + integration + e2e criteria
6. **Backlog** — laser-focused issues (1 PR = 1 concern)
7. **Loops-allowed table** — explicit surface for every cron / agent
8. **Versioning** — semver + store-listing alignment
9. **Anti-goals** — what this is NOT, defended
10. **Monetization** — model, tier, monthly price USD, Stripe plan
11. **First-PR scope** — what MVP contains (the scaffold)

See `docs/specs/_template/GOAL.md` for the full skeleton.

---

## Monetization model

Every spec carries a **monetization section** derived from the idea's WTP (willingness-to-pay) score:

| WTP signal | Default model |
|---|---|
| B2B devtool, recurring friction (e.g. CI/CD helpers) | Freemium → SaaS bridge ($15/mo) |
| Sales / prospecting pain (e.g. LinkedIn, email) | Per-seat subscription ($20/mo) |
| Developer internal (e.g. JSON formatters) | Stripe tip jar ($3/$5/$10) + sponsor link |
| AI wrapper, vertical (e.g. meeting summarizer) | Freemium with monthly quota ($8/mo) |
| Privacy / security (e.g. tracker blocker) | Donation + paid support tier |
| Consumer productivity (e.g. todo, notes) | Stripe tip jar ($3/$5/$10) |

**Rule:** no extension ships without a documented monetization path. Specs that skip it are auto-rejected by `spec-writer`.

---

## Agent autonomy contract

| Agent | Allowed surface | Forbidden |
|---|---|---|
| `research-collector` | MiniMax API → `docs/research/<slot>.json` | Writes to `src/`, `docs/specs/`, direct commits |
| `idea-scorer` | `docs/research/` → `docs/ideas/` | External API calls, web fetches |
| `spec-writer` | `docs/ideas/<top>.json` → `docs/specs/<id>/GOAL.md` + `BACKLOG.md` | Anything outside `docs/specs/` |
| `pr-drafter` | `docs/specs/<id>/` → MV3 scaffold files staged in git | Direct commits to `main`, force-pushes, `gh pr create` (uses peter-evans instead) |

---

## Quick start

```bash
# Install deps
npm ci

# Run the full pipeline locally with your .env
npm run research           # research-collector (uses --env-file=.env)
npm run score              # idea-scorer (uses latest research/)

# Validate everything
npm run validate           # AJV checks every JSON schema
npm test                   # 9 unit tests
```

Or trigger a workflow run from GitHub:

```bash
gh workflow run daily-idea-digest.yml --repo ooovenenoso/chrome-extension-idea-factory

# Override slot or count
gh workflow run daily-idea-digest.yml \
  --raw-field slot=2026-06-28-13 \
  --raw-field count=25 \
  --raw-field skip_pr=false
```

---

## Status

| Component | Status |
|---|---|
| Repo | ✅ live on github.com/ooovenenoso/chrome-extension-idea-factory |
| Workflow cron | ✅ active — runs 2×/day Mon–Fri (01:00, 13:00 UTC) |
| Research loop | ✅ AI-powered via MiniMax-M2.7-highspeed |
| Scoring rubric | ✅ v1.0.0 (4 axes, weights, dedup) |
| Spec template | ✅ v1 (11 sections, see `docs/specs/_template/`) |
| Spec-writer | ✅ running — drafts GOAL.md + BACKLOG.md on threshold hits |
| PR-drafter | ✅ running — stages MV3 scaffold |
| Auto-PR | ✅ running — peter-evans/create-pull-request opens the PR |
| Telegram ping | ✅ active — sends to chat `Home` on threshold hits |
| CI workflow | ✅ ready |
| Release workflow | ✅ ready (triggered by tag push) |
| Asset-pack workflow | ✅ ready (manual dispatch) |
| Dev-console workflow | ✅ ready (manual dispatch) |
| First extension published | ⏳ pending — depends on first PR being merged + tagged |

---

## License

MIT — see `LICENSE`.
