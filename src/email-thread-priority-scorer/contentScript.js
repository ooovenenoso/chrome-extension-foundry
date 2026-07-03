function textFromSelectors(selectors) {
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    const text = node?.innerText?.trim() || node?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function extractVisibleGmailThread() {
  const subject = textFromSelectors(['h2.hP', '[data-thread-perm-id] h2', 'h2']);
  const sender = textFromSelectors(['.gD[email]', '.gD', '[email]']);
  const bodies = Array.from(document.querySelectorAll('.a3s.aiL, .ii.gt, [role="listitem"]'))
    .map((node) => node.innerText || node.textContent || '')
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(-5);

  const fallbackBody = document.body?.innerText?.trim().slice(0, 6000) || '';
  return {
    subject,
    sender,
    body: bodies.length ? bodies.join('\n\n---\n\n') : fallbackBody,
    url: location.href,
    capturedAt: new Date().toISOString(),
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'EMAIL_PRIORITY_CAPTURE_THREAD') {
    sendResponse({ ok: true, thread: extractVisibleGmailThread() });
    return true;
  }
  return false;
});
