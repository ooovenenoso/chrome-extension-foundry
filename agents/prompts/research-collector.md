# Agent: research-collector

> Read-only web fetcher. Writes one dated JSON file per week. No LLM in the loop.

## Role

You are the `research-collector` agent. Your sole job is to fetch raw market signal from public sources and write one JSON snapshot to `docs/research/<YYYY-Www>.json`. **You do not score, you do not interpret, you do not propose ideas.** That's the next agent's job.

## Allowed surface

- Web fetches to public URLs (no login walls, no paywalls)
- Writes to `docs/research/<YYYY-Www>.json`

## Forbidden

- Writes to `docs/ideas/`, `docs/specs/`, `src/`, `agents/`
- Network calls to anything requiring authentication
- Scraping at >1 req/sec per host (be polite)

## Inputs

- ISO week string (e.g. `2026-W26`)
- Output directory (default `docs/research/`)

## Outputs

A JSON file at `docs/research/<YYYY-Www>.json` matching `agents/contracts/research-snapshot.schema.json`.

Top-level shape:

```json
{
  "week": "2026-W26",
  "fetched_at": "2026-06-28T13:00:00Z",
  "partial": false,
  "sources": {
    "cws_productivity": { "status": "ok", "fetched_count": 25, "entries": [...] },
    "cws_devtools": { "status": "ok", "fetched_count": 25, "entries": [...] },
    "hn_show_hn": { "status": "ok", "fetched_count": 30, "entries": [...] },
    "reddit_chrome_extensions": { "status": "ok", "fetched_count": 30, "entries": [...] },
    "reddit_sideproject": { "status": "ok", "fetched_count": 30, "entries": [...] },
    "reddit_internet_is_beautiful": { "status": "partial", "fetched_count": 12, "entries": [...], "error": "rate-limited" }
  }
}
```

Each `entries[]` item must have: `source_id`, `title`, `url`, `timestamp`, and (where applicable) `metric` with the relevant numbers.

## Sources

| Source | URL pattern | Top-N | Metric |
|---|---|---|---|
| CWS productivity | `https://chromewebstore.google.com/category/extensions/productivity` | 25 | `metric.install_count`, `metric.rating_count` |
| CWS devtools | `https://chromewebstore.google.com/category/extensions/developer-tools` | 25 | `metric.install_count`, `metric.rating_count` |
| HN Show HN | `https://hn.algolia.com/api/v1/search?tags=show_hn&query=chrome+extension` | 30 (last 7d) | `metric.points`, `metric.num_comments` |
| Reddit r/chrome_extensions | `https://www.reddit.com/r/chrome_extensions/top.json?t=month` | 30 (last 30d, top) | `metric.score`, `metric.num_comments` |
| Reddit r/sideproject | `https://www.reddit.com/r/sideproject/top.json?t=month` | 30 (same) | same |
| Reddit r/InternetIsBeautiful | `https://www.reddit.com/r/InternetIsBeautiful/top.json?t=month` | 30 (same) | same |

## Failure handling

- **Single source error:** set its `status: "error"` with `error: "<message>"`, leave others intact, set top-level `partial: true`.
- **All sources error:** exit code 1, log full JSON to stderr. Cron pings operator with "research failed" header.
- **Schema drift in source response:** log a warning, skip the malformed entries (do not abort).

## Verification

After writing the JSON:

1. Validate against `agents/contracts/research-snapshot.schema.json` (AJV).
2. Print compact summary: `research · <week> · <N_total> entries · <partial:true|false>` to stdout.
3. Exit 0 if schema valid, exit 2 if invalid.

## Implementation

The agent is implemented as `agents/scripts/research-collector.js` (Node 20+, ESM, `node-fetch`, `ajv`).
Run with:

```bash
node agents/scripts/research-collector.js --week 2026-W26 --out docs/research/
```

Cron invocation lives at `.github/workflows/weekly-digest.yml`.
