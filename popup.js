async function getCurrentTabId() {
	return new Promise((resolve) => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			const tab = tabs && tabs[0];
			resolve(tab && tab.id != null ? tab.id : null);
		});
	});
}

async function init() {
	const scanButton = document.getElementById("scan");
	const clearButton = document.getElementById("clear");
	const optionsButton = document.getElementById("options");

	scanButton.addEventListener("click", async () => {
		const tabId = await getCurrentTabId();
		if (tabId != null) {
			try {
				await chrome.tabs.sendMessage(tabId, { type: "scanJob" });
			} catch (e) {}
		}
	});

	clearButton.addEventListener("click", async () => {
		const tabId = await getCurrentTabId();
		if (tabId != null) {
			try {
				await chrome.tabs.sendMessage(tabId, { type: "clearOverlay" });
			} catch (e) {}
		}
	});

	optionsButton.addEventListener("click", async () => {
		await chrome.runtime.openOptionsPage();
	});
}

document.addEventListener("DOMContentLoaded", init);


