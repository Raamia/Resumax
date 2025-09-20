// Background service worker (MV3)
// - Initializes default highlight color
// - Relays toggle requests from the popup to the active tab's content script

chrome.runtime.onInstalled.addListener(async () => {
	try {
		const stored = await chrome.storage.sync.get(["highlightColor"]);
		if (!stored || !stored.highlightColor) {
			await chrome.storage.sync.set({ highlightColor: "#fff59d" });
		}
	} catch (error) {
		console.error("Resumax: failed to initialize default color", error);
	}
});

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
	if (message && message.type === "toggleHighlight") {
		chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
			const activeTab = tabs && tabs[0];
			if (activeTab && activeTab.id != null) {
				chrome.tabs.sendMessage(activeTab.id, { type: "toggleHighlight" }).catch(() => {});
			}
		});
	}
});


