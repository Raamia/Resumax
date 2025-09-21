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
	const dropzone = document.getElementById("dropzone");
	const fileInput = document.getElementById("fileInput");
	const saveButton = document.getElementById("saveResume");
	const clearResumeButton = document.getElementById("clearResume");
	const resumeTextEl = document.getElementById("resumeText");
	const customStopwordsEl = document.getElementById("customStopwords");
	const minLenEl = document.getElementById("minTokenLength");
	const statusEl = document.getElementById("status");
	const advancedSections = document.getElementById("advancedSections");

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


	// Restore stored values to show advanced if present
	try {
		const stored = await chrome.storage.sync.get(["resumeText","customStopwords","minTokenLength"]);
		if (stored.resumeText) {
			resumeTextEl.value = stored.resumeText;
			advancedSections.style.display = "";
		}
		if (stored.customStopwords) customStopwordsEl.value = stored.customStopwords;
		if (stored.minTokenLength) minLenEl.value = stored.minTokenLength;
	} catch {}

	function setStatus(msg) { if (statusEl) { statusEl.textContent = msg; setTimeout(() => statusEl.textContent = "", 1200); } }

	function revealAdvanced() { if (advancedSections && advancedSections.style.display === "none") advancedSections.style.display = ""; }

	function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
	function setHover() { dropzone && dropzone.classList.add("hover"); }
	function clearHover() { dropzone && dropzone.classList.remove("hover"); }

	dropzone.addEventListener("click", () => fileInput.click());
	dropzone.addEventListener("dragenter", (e) => { preventDefaults(e); setHover(); });
	dropzone.addEventListener("dragover", (e) => { preventDefaults(e); setHover(); });
	dropzone.addEventListener("dragleave", (e) => { preventDefaults(e); clearHover(); });
	dropzone.addEventListener("drop", (e) => {
		preventDefaults(e);
		clearHover();
		const files = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : [];
		if (files.length) handlePickedFile(files[0]);
	});
	fileInput.addEventListener("change", () => {
		if (fileInput.files && fileInput.files[0]) handlePickedFile(fileInput.files[0]);
	});

	function handlePickedFile(file) {
		revealAdvanced();
		const name = (file && file.name) || "resume";
		const type = (file && file.type || "").toLowerCase();
		if (type === "text/plain" || name.toLowerCase().endsWith(".txt")) {
			const reader = new FileReader();
			reader.onload = () => { resumeTextEl.value = String(reader.result || ""); setStatus("Loaded text from file"); };
			reader.onerror = () => setStatus("Failed to read file");
			reader.readAsText(file);
		} else {
			setStatus("File attached. For PDF/DOCX, paste extracted text below.");
		}
	}

	saveButton.addEventListener("click", async () => {
		const resumeText = resumeTextEl.value;
		const customStopwords = customStopwordsEl.value;
		const minTokenLength = Number(minLenEl.value) || 3;
		await chrome.storage.sync.set({ resumeText, customStopwords, minTokenLength });
		setStatus("Saved");
	});

	clearResumeButton.addEventListener("click", async () => {
		resumeTextEl.value = "";
		customStopwordsEl.value = "";
		await chrome.storage.sync.remove(["resumeText","customStopwords","resumeTokens"]);
		setStatus("Cleared");
	});
}

document.addEventListener("DOMContentLoaded", init);


