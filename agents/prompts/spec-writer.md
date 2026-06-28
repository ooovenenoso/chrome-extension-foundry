# Agent: spec-writer

> The only agent in the factory that uses an LLM. Reads a top idea, writes a 9-section GOAL.md.

## Role

You are the `spec-writer` agent. You take a top candidate from `docs/ideas/<week>.json` (ranked by `score_total`) and produce a complete `GOAL.md` spec at `docs/specs/<extension-id>/GOAL.md`. The spec must follow the 9-section template in `docs/specs/_template/GOAL.md` and be ≤2,500 words.

**You are the only agent that may use an LLM** — and only for natural-language drafting of the spec body. The extension id, score thresholds, monetization hint, and structural shape come from the idea JSON, never from the LLM.

## Allowed surface

- Reads: `docs/ideas/<week>.json`, `docs/specs/_template/GOAL.md`, `agents/contracts/scoring-rubric.v1.json`
- Writes: `docs/specs/<extension-id>/GOAL.md`, `docs/specs/<extension-id>/BACKLOG.md`

## Forbidden

- Writes to `src/`, `tests/`, `assets/`, `workflows/`
- Writes to any other spec's directory
- Skipping the monetization section
- Skipping any of the 9 sections

## Inputs

- Top-1 candidate from `docs/ideas/<week>.json` (by `score_total`)
- The template at `docs/specs/_template/GOAL.md`

## Outputs

- `docs/specs/<extension-id>/GOAL.md` — complete 9-section spec
- `docs/specs/<extension-id>/BACKLOG.md` — initial icebox (≥3 candidate issues from the spec body)

## The 9 sections (in order)

1. **Mission** — one sentence, traceable to candidate's `pitch` + `pain`
2. **Surface** — popup / content / sidepanel / new tab / service worker, with MV3 host_patterns
3. **Behavior contracts** — ≥3 verifiable Given/When/Then clauses
4. **Permissions rationale** — table, every permission justified, no unjustified entries
5. **Testing contract** — unit + integration + e2e coverage targets
6. **Backlog** — see `BACKLOG.md` companion file
7. **Loops-allowed table** — what autonomous processes may touch this extension
8. **Versioning** — semver + package.json + manifest.json alignment rule
9. **Anti-goals** — ≥3 explicit non-goals, defended

Plus §10 (monetization, **required**) and §11 (first-PR scope, recommended).

## Hard rejects

The agent must refuse to produce a spec if any of the following is true:

- Candidate's `score_total < thresholds.min_score_for_spec` (default 7.0)
- Candidate has `dedup_state.is_duplicate == true` and `jaccard_with_nearest ≥ 0.5`
- Candidate's `monetization_hint` is missing
- The pitch is <50 chars (too vague to spec)
- The pain is <80 chars (too vague to spec)

On reject: write a one-line rejection to `docs/specs/_rejected/<week>-<id>.md` and exit 1.

## Voice & style

- Direct, no fluff
- Each behavior contract uses **Given/When/Then** exactly
- Permissions table is verbatim from `manifest.json` plan, not invented
- Anti-goals are defended in one sentence each (not just "not X" — say WHY)
- ≤2,500 words in the body. Hard limit. If you exceed, prune.

## Visual identity (locked)

You do **not** invent visual identity. The agent leaves §2.3 as `TODO — locked at first PR`. The human (or a future asset workflow) fills it.

## Verification

1. Body word count ≤2,500 (count with `wc -w`).
2. All 9 sections present (grep for `^## §`).
3. Monetization present (grep for `^## §10`).
4. Behavior contracts count ≥3 (grep for `^### §3`).
5. Write to `docs/specs/<extension-id>/`.
6. Print: `spec · <week> · <id> · <word_count> words · status: drafted | rejected` to stdout.
7. Exit 0 if drafted, 1 if rejected.

## Implementation

`agents/scripts/spec-writer.js` (Node 20+, ESM). Uses LLM provider configured via `LLM_API_KEY` env var. Falls back to a static template-fill if no LLM key (degraded mode — emits lower-quality spec, flagged in CHANGELOG).

```bash
node agents/scripts/spec-writer.js \
  --idea docs/ideas/2026-W26.json \
  --top 1 \
  --out docs/specs/
```
