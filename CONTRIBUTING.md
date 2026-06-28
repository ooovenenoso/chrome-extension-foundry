# Contributing

> Rule #1: **Read `GOAL.md` before opening an issue or PR.** Specs without a GOAL.md are auto-rejected.

This repo is the **factory**, not a single extension. Most contributions are **research data, scoring rubric updates, or new extension specs** — not code. Code contributions live under `src/<extension-id>/` and follow the PR-first workflow.

---

## What you can contribute

| Type | Where it lives | Owner |
|---|---|---|
| Weekly research snapshot | `docs/research/<YYYY-Www>.json` | `research-collector` agent or human |
| Idea scoring rubric update | `agents/contracts/scoring-rubric.json` | Human (debated in PR) |
| Scored idea | `docs/ideas/<YYYY-Www>.json` | `idea-scorer` agent or human |
| New extension spec | `docs/specs/<extension-id>/GOAL.md` | `spec-writer` agent or human |
| Extension code | `src/<extension-id>/` | Human PR (CI-gated) |
| Agent prompts/contracts | `agents/prompts/` or `agents/contracts/` | Human PR |
| Workflow | `workflows/` | Human PR |

---

## Issue/PR template

**Before opening**, make sure:

- [ ] I read `GOAL.md` (root) and understand the factory's autonomy contract
- [ ] My change fits in one of the contribution types above
- [ ] If a spec: my `GOAL.md` covers all 9 sections
- [ ] If code: my branch is `<type>/#<issue-number>-<kebab-summary>` (e.g. `feat/42-idea-scorer-rubric-v2`)
- [ ] If scoring rubric: I included 5+ candidate examples scored by both old and new rubric

---

## PR-first workflow

1. **Branch:** `<type>/#<issue-number>-<kebab-summary>`
2. **Title:** conventional commit — `feat(...)`, `fix(...)`, `docs(...)`, `chore(...)`, `refactor(...)`, `test(...)`
3. **Body sections:** `## What` · `## How` · `## Test plan` · `## Checklist`
4. **CI must be green** before squash-merge to `main`
5. **No force-pushes** after first review

If your PR touches more than one concern, **split it**. The chicken-and-egg trap of dependent PRs is real — if you hit it, document the scope-deviation in the PR body instead of merging a multi-concern PR.

---

## Scoring rubric changes

The scoring rubric (`agents/contracts/scoring-rubric.json`) is the **single source of truth** for what counts as a good idea. Changing it is high-impact:

1. Open an issue with `rubric-change` label explaining the motivation
2. Include ≥5 historical candidates scored by both old and new rubric
3. Show that the new rubric's top-5 differs from the old rubric's top-5 in a *meaningful* way (not just reshuffled)
4. Tag at least one extension maintainer for review
5. PR must include a `## Backtest` section with the before/after top-10

---

## Specs that get rejected

The `spec-writer` and `pr-drafter` agents auto-reject specs that:

- Skip the monetization section
- Declare permissions without justification
- Have anti-goals that contradict the mission
- Omit the testing contract
- Are >2,500 words in the spec body (verbose specs ship late)

---

## Code of conduct

Be direct, be honest, be brief. This repo optimizes for shipped extensions, not committee consensus.
