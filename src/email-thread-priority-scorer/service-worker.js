chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ emailPriorityScorerInstalledAt: new Date().toISOString() });
});
