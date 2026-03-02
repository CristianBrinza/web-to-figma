const DEFAULT_CAPTURE_OPTIONS = {
  includeImages: true,
  maxNodes: 1200
};

chrome.runtime.onInstalled.addListener(async () => {
  const { captureOptions } = await chrome.storage.local.get("captureOptions");

  if (!captureOptions) {
    await chrome.storage.local.set({ captureOptions: DEFAULT_CAPTURE_OPTIONS });
  }
});
