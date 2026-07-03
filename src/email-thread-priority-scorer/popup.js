import { scoreEmailThread, summarizePriority } from './lib/priorityScorer.js';

const TIP_LINKS = {
  tip3: 'https://buy.stripe.com/test_replace_tip3',
  tip5: 'https://buy.stripe.com/test_replace_tip5',
  tip10: 'https://buy.stripe.com/test_replace_tip10',
};

const DEMO_THREAD = {
  subject: 'URGENT: contract renewal approval needed today',
  sender: 'vp-sales@customer.example',
  body: 'The customer is blocked. Please review the contract, pricing, and renewal terms before EOD today.',
};

function setTipLinks() {
  for (const [id, href] of Object.entries(TIP_LINKS)) {
    const el = document.getElementById(id);
    if (el) el.href = href;
  }
}

function renderResult(result) {
  const target = document.getElementById('result');
  target.className = `card ${result.level}`;
  target.innerHTML = `
    <div class="score">${result.score}</div>
    <strong>${summarizePriority(result)}</strong>
    <ul>${result.reasons.map((reason) => `<li>${reason}</li>`).join('')}</ul>
  `;
}

function renderError(message) {
  const target = document.getElementById('result');
  target.className = 'card muted';
  target.textContent = message;
}

async function scoreCurrentThread() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://mail.google.com/')) {
      renderError('Open a Gmail thread first, or use the demo sample.');
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'EMAIL_PRIORITY_CAPTURE_THREAD' });
    if (!response?.ok) throw new Error('No Gmail thread content returned');
    const result = scoreEmailThread(response.thread);
    await chrome.storage.local.set({ lastPriorityScore: { ...result, at: new Date().toISOString(), url: tab.url } });
    renderResult(result);
  } catch (error) {
    renderError(`Could not read this Gmail tab yet. Reload Gmail and try again. (${error.message})`);
  }
}

function runDemo() {
  renderResult(scoreEmailThread(DEMO_THREAD));
}

setTipLinks();
document.getElementById('scoreCurrentThread').addEventListener('click', scoreCurrentThread);
document.getElementById('runDemo').addEventListener('click', runDemo);
