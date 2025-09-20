async function getCurrentTabId() {
	return new Promise((resolve) => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			const tab = tabs && tabs[0];
			resolve(tab && tab.id != null ? tab.id : null);
		});
	});
}

async function init() {
	const toggleButton = document.getElementById("toggle");
	const colorInput = document.getElementById("color");

	try {
		const stored = await chrome.storage.sync.get(["highlightColor"]);
		if (stored && stored.highlightColor) {
			colorInput.value = stored.highlightColor;
		}
	} catch {}

	toggleButton.addEventListener("click", async () => {
		const tabId = await getCurrentTabId();
		if (tabId != null) {
			try {
				await chrome.tabs.sendMessage(tabId, { type: "toggleHighlight" });
			} catch (e) {
				// Ignore errors (e.g., pages where content scripts cannot run)
			}
		}
	});

	colorInput.addEventListener("input", async (e) => {
		const newColor = e.target.value;
		try {
			await chrome.storage.sync.set({ highlightColor: newColor });
		} catch {}
	});
}

document.addEventListener("DOMContentLoaded", init);


