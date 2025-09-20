// Content script
// - Applies/removes a highlight class on all links
// - Reacts to color changes stored in chrome.storage

const STYLE_ELEMENT_ID = "resumax-style";
const HIGHLIGHT_CLASS = "resumax-highlight-link";

let isHighlighted = false;
let currentColor = "#fff59d";

function ensureStyleElement() {
	let styleEl = document.getElementById(STYLE_ELEMENT_ID);
	if (!styleEl) {
		styleEl = document.createElement("style");
		styleEl.id = STYLE_ELEMENT_ID;
		styleEl.textContent = `
\t\t:root { --resumax-hl: ${currentColor}; }
\t\t.${HIGHLIGHT_CLASS} { background-color: var(--resumax-hl, ${currentColor}) !important; outline: 1px solid rgba(0,0,0,.15); border-radius: 2px; }
		`;
		document.documentElement.appendChild(styleEl);
	}
	// Always set the latest color variable
	document.documentElement.style.setProperty("--resumax-hl", currentColor);
}

function queryAllLinks() {
	return Array.from(document.querySelectorAll("a[href]"));
}

function applyHighlight() {
	ensureStyleElement();
	for (const linkElement of queryAllLinks()) {
		linkElement.classList.add(HIGHLIGHT_CLASS);
	}
	isHighlighted = true;
}

function removeHighlight() {
	for (const linkElement of queryAllLinks()) {
		linkElement.classList.remove(HIGHLIGHT_CLASS);
	}
	isHighlighted = false;
}

function toggleHighlight() {
	if (isHighlighted) {
		removeHighlight();
	} else {
		applyHighlight();
	}
}

async function initializeColorFromStorage() {
	try {
		const stored = await chrome.storage.sync.get(["highlightColor"]);
		if (stored && stored.highlightColor) {
			currentColor = stored.highlightColor;
		}
		ensureStyleElement();
	} catch (error) {
		// non-fatal
	}
}

chrome.runtime.onMessage.addListener((message) => {
	if (!message) return;
	if (message.type === "toggleHighlight") {
		toggleHighlight();
	}
});

chrome.storage.onChanged.addListener((changes, areaName) => {
	if (areaName !== "sync") return;
	if (changes.highlightColor) {
		currentColor = changes.highlightColor.newValue || currentColor;
		ensureStyleElement();
	}
});

initializeColorFromStorage();


