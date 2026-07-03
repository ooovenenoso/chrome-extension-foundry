# Privacy — Email Thread Priority Scorer

Email Thread Priority Scorer runs locally in Chrome.

- It reads visible Gmail thread text only after the user clicks the popup action.
- It does not send email content to any external server.
- It stores only the latest score summary in `chrome.storage.local`.
- The first MVP uses deterministic local scoring, not an LLM API.
- Stripe links are placeholders until live payment links are configured.
