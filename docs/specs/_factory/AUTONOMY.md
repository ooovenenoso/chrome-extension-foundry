# Autonomy Contract

> The factory is 100% autonomous. There are no human approval gates in the
> day-to-day loop. Everything that happens here is triggered by cron,
> `workflow_dispatch`, or the GitHub Actions runtime itself.

## Allowed actions (no human required)

| Action | Trigger | Owner |
|---|---|---|
| Generate fresh ideas | `daily-idea-digest.yml` cron, Mon-Fri 01:00/13:00 UTC | `research-collector` agent |
| Score ideas | same run | `idea-scorer` agent (deterministic, rubric v2) |
| Draft spec | same run, when top ≥ 6.0 | `spec-writer` agent |
| Generate MV3 scaffold | same run, when spec drafted | `pr-drafter` agent + `syntax-guard` |
| Validate scaffold JS | inside `pr-drafter` | `syntax-guard.js` |
| Open PR | same run, after verify passes | `peter-evans/create-pull-request@v6` |
| Auto-merge scaffold PRs | `ci-auto-fix.yml` + repo CI | `ci-auto-fixer.js` (M3-powered) |
| Cut release | every push to `main` | `release.yml` (auto-bumps `package.json` patch) |
| Package extension ZIPs | inside `release.yml` | `package-extension.py` |
| Prune orphan scaffold branches | inside `daily-idea-digest` | `orphan-branch-guard.js` (24h TTL) |
| Auto-fix failing CI | on `pull_request` CI failure | `ci-auto-fix.yml` |

## Forbidden actions (require explicit `workflow_dispatch` input)

- **Submit extension to Chrome Web Store** — the "Submit" button click is
  always manual via `dev-console.yml`. The repo has no `CWS_CDP_URL` secret
  configured. Per GOAL.md §11 ("stop at the CWS submission button").
- **Create Stripe Payment Links** — placeholder links live in
  `STRIPE_LINKS.md` per extension. Real Payment Links are inserted by hand
  before CWS submission.
- **Modify `package.json` major/minor versions** — only patch bumps happen
  automatically. MAJOR/MINOR require a PR that updates the factory contract.

## Forbidden surfaces (cron-owned, never edit by hand)

Per `daily-idea-digest` loop table:

- `docs/research/` — append-only weekly snapshots
- `docs/ideas/` — append-only scored pools
- `docs/specs/_rejected/` — rejection markers

Editing these by hand causes cron divergence. They are git-owned by the
cron workflow.

## Cron schedules

| Workflow | Cron | What it does |
|---|---|---|
| `daily-idea-digest` | `0 1,13 * * 1-5` UTC | Research → Score → Spec → PR → Ping + orphan-branch guard |
| `ci` | on push + PR | Unit + integration + Playwright smoke |
| `ci-auto-fix` | on `pull_request` CI failure | M3 patches failing tests |
| `release` | on push to `main` | Bump patch, package, GitHub Release |

## Exit conditions

The factory's stop-the-world signals:

1. **All cron sources fail for 7 consecutive days** → CI opens a
   `factory-degraded` issue.
2. **5 scaffold PRs open with no review in 7 days** → CI opens a
   `review-needed` issue.
3. **`MINIMAX_API_KEY` missing** → `research-collector` exits 3; `idea-scorer`
   still runs on prior snapshots; `daily-idea-digest` exits non-zero and
   Telegram pings.

## Manual override

The `--force-pr` input on `daily-idea-digest.yml` lets a human trigger the
Path B pipeline even when no candidate crossed the threshold. Useful for
testing, never used in production.

## Backtest cron (future)

Per GOAL.md §7, the `score-rubric-backtest` cron runs Fri 16:00 AST and
re-scores all `docs/ideas/*.json` against the active rubric. Implemented in
`scripts/scoring-rubric.migrate.js` (manual trigger today; cron pending).
