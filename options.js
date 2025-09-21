const DEFAULT_MIN_TOKEN_LENGTH = 3;

function normalizeWhitespace(text) {
	return (text || "").replace(/\r\n?|\n/g, "\n").trim();
}

function deriveTokensFromResume(resumeText, customStopwordsCsv, minTokenLength) {
	const text = normalizeWhitespace(resumeText).toLowerCase();
	const customStopwords = new Set(
		(customStopwordsCsv || "")
			.split(",")
			.map(s => s.trim().toLowerCase())
			.filter(Boolean)
	);
	const defaultStopwords = new Set([
		"and","or","the","a","an","to","of","in","on","for","with","by","at","from","is","are","be","as","that","this","it","we","you","i","our","their","they","include","including","will","shall","can","able","ability","skills","skill","experience","experiences","work","works","working","project","projects","team","teams","using","used","use","detail","details","detailed","etc","eg","e.g","ie","i.e","years","year","month","months"
	]);
	const combinedStopwords = new Set([...defaultStopwords, ...customStopwords]);

	const tokens = text
		.replace(/[^a-z0-9+#.\-\s]/g, " ")
		.split(/\s+/)
		.map(t => t.trim())
		.filter(Boolean)
		.filter(t => t.length >= (minTokenLength || DEFAULT_MIN_TOKEN_LENGTH))
		.filter(t => !combinedStopwords.has(t));

	// Collapse simple plurals and dedupe
	const canonicalize = (t) => t.replace(/s$/i, "");
	const frequency = new Map();
	for (const t of tokens) {
		const c = canonicalize(t);
		frequency.set(c, (frequency.get(c) || 0) + 1);
	}
	return Array.from(frequency.entries())
		.sort((a,b) => b[1] - a[1])
		.map(([t]) => t)
		.slice(0, 300);
}

async function saveOptions() {
	const resumeText = document.getElementById("resumeText").value;
	const customStopwords = document.getElementById("customStopwords").value;
	const minTokenLength = Number(document.getElementById("minTokenLength").value) || DEFAULT_MIN_TOKEN_LENGTH;

	const tokens = deriveTokensFromResume(resumeText, customStopwords, minTokenLength);
	await chrome.storage.sync.set({ resumeText, customStopwords, minTokenLength, resumeTokens: tokens });

	setStatus("Saved.");
	renderTokens(tokens);
}

async function restoreOptions() {
	const stored = await chrome.storage.sync.get(["resumeText","customStopwords","minTokenLength","resumeTokens"]);
	document.getElementById("resumeText").value = stored.resumeText || "";
	document.getElementById("customStopwords").value = stored.customStopwords || "";
	document.getElementById("minTokenLength").value = stored.minTokenLength || DEFAULT_MIN_TOKEN_LENGTH;
	renderTokens(stored.resumeTokens || []);
}

function setStatus(text) {
	const el = document.getElementById("status");
	el.textContent = text;
	setTimeout(() => (el.textContent = ""), 1200);
}

function renderTokens(tokens) {
	const container = document.getElementById("tokens");
	container.innerHTML = "";
	for (const t of tokens) {
		const span = document.createElement("span");
		span.className = "pill";
		span.textContent = t;
		container.appendChild(span);
	}
}

function revealAdvancedSections() {
	const adv = document.getElementById("advancedSections");
	if (adv && adv.style.display === "none") adv.style.display = "";
}

function attachDropzoneHandlers() {
	const dropzone = document.getElementById("dropzone");
	const fileInput = document.getElementById("fileInput");
	if (!dropzone || !fileInput) return;

	function clearHover() { dropzone.classList.remove("hover"); }
	function setHover() { dropzone.classList.add("hover"); }

	function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

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
}

function handlePickedFile(file) {
	if (!file) return;
	revealAdvancedSections();
	const name = file.name || "resume";
	const type = (file.type || "").toLowerCase();
	if (type === "text/plain" || name.toLowerCase().endsWith(".txt")) {
		const reader = new FileReader();
		reader.onload = () => {
			document.getElementById("resumeText").value = String(reader.result || "");
			setStatus("Loaded text from file. Review and Save.");
		};
		reader.onerror = () => setStatus("Failed to read file");
		reader.readAsText(file);
	} else {
		setStatus("File attached. For PDF/DOCX, paste extracted text below and Save.");
	}
}

document.addEventListener("DOMContentLoaded", () => {
	document.getElementById("save").addEventListener("click", () => {
		saveOptions();
	});
	document.getElementById("clear").addEventListener("click", async () => {
		document.getElementById("resumeText").value = "";
		document.getElementById("customStopwords").value = "";
		await chrome.storage.sync.remove(["resumeText","customStopwords","resumeTokens"]);
		renderTokens([]);
		setStatus("Cleared.");
	});
	restoreOptions().then(() => {
		const current = document.getElementById("resumeText").value;
		if (current && current.trim()) revealAdvancedSections();
	});
	attachDropzoneHandlers();
});


