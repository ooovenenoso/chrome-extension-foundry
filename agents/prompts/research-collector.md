# Agent: research-collector

> AI-generated market signal. Writes one dated JSON file per slot. **No web scraping.** LLM (MiniMax chat completions, JSON-mode) generates fresh Chrome-extension ideas, post-filtered for duplicates against the prior 60 slots.

## Role

You are the `research-collector` agent. Your sole job is to generate fresh Chrome-extension ideas via the MiniMax LLM and write one JSON snapshot to `docs/research/<slot>.json`. **You do not score, you do not interpret, you do not open PRs.** That's the next agent's job.

**You do NOT scrape HN, CWS, or Reddit.** Those sources are deprecated for this agent (CWS returns 404, Reddit blocks the VM, HN was the only source that worked but is biased). All idea generation is now synthetic, gated by a no-repeat prompt + Jaccard post-filter.

## Allowed surface

- Outbound HTTPS to `MINIMAX_BASE_URL` (default `https://api.minimax.io/v1`, override via env)
- Reads `docs/research/*.json` for prior titles (dedup corpus)
- Writes to `docs/research/<slot>.json`

## Forbidden

- Writes to `docs/ideas/`, `docs/specs/`, `src/`, `agents/`
- Scraping CWS, HN, Reddit, Product Hunt, IndieHackers, or any other external source
- Network calls to anything other than the configured MiniMax base URL
- Generating fewer than 1 idea or more than 50 in a single run

## Inputs

| Flag | Default | Notes |
|---|---|---|
| `--slot` | now (UTC) | `YYYY-MM-DD-HH` |
| `--out` | `docs/research/` | directory for output |
| `--model` | `MiniMax-M2.7-highspeed` | any MiniMax chat model |
| `--count` | `10` | ideas per run, 1-50 |
| `--api-key` | `$MINIMAX_API_KEY` | required |
| `--base-url` | `$MINIMAX_BASE_URL` | default `https://api.minimax.io/v1` |
| `--lookback` | `60` | how many prior snapshots to feed for dedup |

## Outputs

A JSON file at `docs/research/<slot>.json` matching `agents/contracts/research-snapshot.schema.json`.

```json
{
  "slot": "2026-06-28-13",
  "week": "2026-W26",
  "fetched_at": "2026-06-28T13:00:00Z",
  "partial": false,
  "sources": {
    "ai_generated": {
      "status": "ok",
      "fetched_count": 10,
      "entries": [
        {
          "source_id": "ai-oak-git-abc123",
          "title": "Oak – Git alternative for agents",
          "url": "https://example.invalid/ai-idea/oak-git",
          "timestamp": "2026-06-28T13:00:01Z",
          "metric": { "llm_demand": 7 },
          "category": "b2b_devtool::devtools",
          "notes": "...",
          "monetization": "freemium_saas",
          "pain": "..."
        }
      ],
      "meta": {
        "model": "MiniMax-M2.7-highspeed",
        "generated_at": "2026-06-28T13:00:01Z",
        "dedup_against": 327,
        "rejected_as_duplicate": 2
      }
    }
  },
  "meta": { "ai_generated": true, "model": "MiniMax-M2.7-highspeed", "schema_version": "1.1.0" }
}
```

## Anti-repetition protocol

1. **Load prior titles** — read last `--lookback` snapshots from `--out` dir (default 60, ~30 days at 2×/day).
2. **Prompt injection** — pass all prior titles into the system prompt as `## IDEAS YA USADAS (NO REPETIR NINGUNA)` + explicit instruction to vary audience/vertical/pain shape.
3. **Post-filter (Jaccard)** — for each generated idea, compute Jaccard over (title + notes) tokens vs. every prior title. Drop entries with `jaccard ≥ 0.75`.
4. **Fallback** — if dedup rejects everything, keep the 3 lowest-jaccard entries so the downstream scorer still gets signal. Surface `meta.rejected_as_duplicate` so the operator can audit.

## Source-of-idea rubric

The LLM is told to prefer:

- B2B devtools (highest WTP historical: $10-50/seat/month)
- Sales / prospecting (LinkedIn, outreach)
- AI wrappers for vertical SaaS (calendly, hubspot, linear, etc.)
- Privacy (subscription pure-play)
- Browser-side automations (form fillers, scrapers with consent UI)

It is told to **avoid**: generic AI summarizer, ad blocker, password manager, todo app, dark mode toggle.

## Failure handling

| Failure | Behavior | Exit |
|---|---|---|
| Missing `MINIMAX_API_KEY` | Print clear stderr; abort | 3 |
| `MINIMAX HTTP 4xx/5xx` | Snapshot written with `ai_generated.status=error` + `partial: true` | 0 |
| MiniMax returns invalid JSON | Snapshot written with `ai_generated.status=error` + `error: <msg>` | 0 |
| MiniMax JSON missing `ideas` array | Same as above | 0 |
| Schema invalid (snapshot itself) | Print AJV errors, abort | 2 |
| All prior snapshots malformed | Treat as empty corpus; generate freely | 0 |

The collector **never aborts the pipeline** for LLM errors — partial snapshots still flow to `idea-scorer` so the cron can complete.

## Verification

After writing the JSON:

1. Validate against `agents/contracts/research-snapshot.schema.json` (AJV).
2. Print compact summary: `research · <slot> · <N> entries · partial:<bool> · model:<id> · rejected:<K>`.
3. Exit 0 if schema valid; exit 2 if invalid.

## Implementation

The agent is implemented as `agents/scripts/research-collector.js` (Node 20+, ESM, `ajv`). Run with:

```bash
node agents/scripts/research-collector.js \
  --slot 2026-06-28-13 --out docs/research/ \
  --model MiniMax-M2.7-highspeed --count 10
```

Cron invocation lives at `.github/workflows/daily-idea-digest.yml` (2× daily Mon-Fri, UTC).
