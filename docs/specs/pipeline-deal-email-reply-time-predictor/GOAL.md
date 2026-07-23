# GOAL.md — Pipeline Deal Email Reply Time Predictor

> Spec template. Replace every `<PLACEHOLDER>`. Keep body ≤2,500 words. Every behavior claim must be traceable to a test in `tests/`.

---

## §1. Mission

Sidebar widget on Gmail/Outlook for sales reps predicts reply probability by sender reply-history pattern, throttling follow-ups. Per-seat for sales managers. Existing reply-time tools are generic ema

---

## §2. Surface

### §2.1 Where users interact

- **Popup** — primary UI, opens on toolbar click
- **Content script** — runs on `https://mail.google.com/*` (e.g. `https://*.linkedin.com/*`)
- **Sidepanel** — optional, opens via `chrome.sidePanel.open()` (Chrome 114+)
- **New tab override** — optional, replaces `chrome://newtab`
- **Service worker** — MV3 background, event-driven

### §2.2 Where code lives

```
src/<extension-id>/
├── manifest.json           # MV3, version = package.json
├── popup.{html,css,js}
├── contentScript.js
├── sidepanel.{html,css,js} # if used
├── service-worker.js
├── lib/                    # pure logic, no chrome.* imports
│   ├── <feature-1>.js
│   └── <feature-2>.js
├── assets/
│   └── icons/{16,32,48,128}.png
└── PRIVACY.md
```

### §2.3 Visual identity

**Locked. Do not propose new palettes in PRs.**

- Background: `#<HEX>`
- Accent: `#<HEX>`
- Typography: `system-ui, -apple-system, "Segoe UI", sans-serif`
- Signature element: `Compact toolbar icon, dark-mode default.`

---

## §3. Behavior contracts

Every behavior claim below is grounded in a test in `tests/<extension-id>/`.

### §3.1 Feature: `<NAME>`

- **Given** <state>
- **When** <action>
- **Then** <observable outcome>

(e.g. *Given a user is on a LinkedIn profile page, When the user clicks the popup's "Save contact" button, Then the contact is stored in `chrome.storage.local` and visible in the popup's contact list within 200ms.*)

### §3.2 Feature: `<NAME>`

(repeat per feature — minimum 3 features for MVP)

### §3.3 Edge cases (explicit)

- `<EDGE_CASE>` → expected behavior
- `<EDGE_CASE>` → expected behavior

---

## §4. Permissions rationale

MV3 minimum. Every permission declared in `manifest.json` must appear here with a 1-line justification.

| Permission | Why |
|---|---|
| `storage` | Required for the MVP feature set; see §3. |
| `activeTab` | Required for the MVP feature set; see §3. |
| `<HOST_PERMISSION>` | Required for the MVP feature set; see §3. |
| `scripting` | Required for the MVP feature set; see §3. |

**Reject criterion:** any permission without a justification.

---

## §5. Testing contract

| Test type | What it covers | Files |
|---|---|---|
| Unit (Node test) | Pure logic in `src/<extension-id>/lib/` | `tests/unit/*.test.js` |
| Integration (Node + JSDOM) | State machines, storage | `tests/integration/*.test.js` |
| E2E (Playwright) | Popup render, click flows | `tests/e2e/*.test.js` |

**Coverage target:** ≥80% for `lib/`. 100% for any function touching `chrome.storage.*` or `chrome.tabs.*`.

**Performance target:** e2e ≤60s total.

---

## §6. Backlog

See `BACKLOG.md` in this directory. One concern per issue. PR-first workflow — no direct commits to `main` after the initial scaffold.

Issue template: `## What` · `## Why` · `## Acceptance criteria` · `## Out of scope`.

---

## §7. Loops-allowed table

What autonomous loops may touch this extension:

| Loop | Allowed surface | Forbidden | Trigger |
|---|---|---|---|
| Spec drift auditor | Read-only | Writes | Weekly |
| Issue janitor | Labels + comments | Code edits | Daily |
| Stripe link health check | Read-only on `STRIPE_LINKS.md` | Edits without PR | Weekly |
| Asset regenerator | `assets/` only | Anything outside | On `GOAL.md` visual identity change |

---

## §8. Versioning

- Semver: `MAJOR.MINOR.PATCH`
- `package.json` version = `manifest.json` version = store listing version
- CHANGELOG follows Keep a Changelog

---

## §9. Anti-goals

This extension is **NOT**:

- ❌ <NOT_THING_1>
- ❌ <NOT_THING_2>
- ❌ <NOT_THING_3>

---

## §10. Monetization

**Required.** Pick one (or propose a new model in the spec PR):

| Model | When to use |
|---|---|
| Stripe tip jar (3 Payment Links: $3/$5/$10) | Consumer pain, no clear buyer |
| Freemium → SaaS bridge | B2B devtool |
| Per-seat subscription ($10-30/mo) | Sales / prospecting |
| Freemium with monthly quota ($5-15/mo) | AI wrapper, vertical |
| Donation + paid support tier | Privacy / security |

**Implementation contract:**

- Stripe account must be **live mode**. Verify with `GET /v1/account`.
- Store link IDs + URLs in `STRIPE_LINKS.md` (single source of truth).
- Popup HTML: `<a id="tip3" target="_blank">...</a>` — JS sets `.href` from `TIP_LINKS` constant.
- **Never** use Stripe Elements. **Never** read the click. **Never** track conversion with pixels.
- Conversion comes from `GET /v1/charges` filtered by price IDs (server-side, optional cron).

---

## §11. First-PR scope

The first PR for this extension is intentionally minimal:

1. `manifest.json` (MV3) + version
2. `popup.html` + minimal `popup.js` (renders a single button + tip links)
3. `contentScript.js` (noop)
4. `lib/<one-feature>.js` (one pure function with one test)
5. `tests/unit/<one-feature>.test.js` (passes)
6. `STRIPE_LINKS.md` (placeholder if real Stripe links not yet created)
7. CI green

**Stop here.** Future PRs add features per `BACKLOG.md`.
