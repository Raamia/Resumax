// Content script
// - MVP scanner: compare job posting keywords vs saved resume tokens, show overlay, highlight missing
// - Legacy: link highlighting demo (kept for now)

const STYLE_ELEMENT_ID = "resumax-style";
const HIGHLIGHT_CLASS = "resumax-highlight-link";

// Scanner/overlay constants
const OVERLAY_ID = "resumax-overlay";
const OVERLAY_STYLE_ID = "resumax-overlay-style";
const HIGHLIGHT_MISSING_CLASS = "resumax-missing";
const HIGHLIGHT_MATCH_CLASS = "resumax-match";

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


// =========================
// Job scanner & overlay MVP
// =========================

function ensureOverlayStyles() {
	if (document.getElementById(OVERLAY_STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = OVERLAY_STYLE_ID;
	style.textContent = `
		#${OVERLAY_ID} { position: fixed; top: 16px; right: 16px; z-index: 2147483647; width: 340px; max-height: 70vh; overflow: auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,.12); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
		#${OVERLAY_ID} .rx-h { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-weight: 600; }
		#${OVERLAY_ID} .rx-b { padding: 10px 12px; }
		#${OVERLAY_ID} .rx-row { display: flex; gap: 8px; align-items: center; margin: 8px 0; flex-wrap: wrap; }
		#${OVERLAY_ID} .rx-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid #e5e7eb; background: #f8fafc; margin: 2px; font-size: 12px; }
		#${OVERLAY_ID} button { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; cursor: pointer; }
		#${OVERLAY_ID} button:hover { background: #f9fafb; }
		#${OVERLAY_ID} .rx-muted { color: #6b7280; font-size: 12px; }
		.${HIGHLIGHT_MISSING_CLASS} { background: #ffe1e1 !important; outline: 1px solid #fda4af; border-radius: 2px; }
		.${HIGHLIGHT_MATCH_CLASS} { background: #e3ffe1 !important; outline: 1px solid #86efac; border-radius: 2px; }
	`;
	document.documentElement.appendChild(style);
}

function removeOverlay() {
	const existing = document.getElementById(OVERLAY_ID);
	if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
}

function createOverlay(stats) {
	ensureOverlayStyles();
	removeOverlay();
	const root = document.createElement("div");
	root.id = OVERLAY_ID;
	root.innerHTML = `
		<div class="rx-h">
			<span>Resumax</span>
			<div class="rx-row">
				<button id="rx-rescan">Rescan</button>
				<button id="rx-clear">Clear</button>
				<button id="rx-close">Close</button>
			</div>
		</div>
		<div class="rx-b">
			<div class="rx-row rx-muted">Matched: <strong>${stats.matched.length}</strong> · Missing: <strong>${stats.missing.length}</strong></div>
			<div class="rx-row"><strong>Missing keywords</strong></div>
			<div class="rx-row" id="rx-missing"></div>
			<div class="rx-row"><strong>Matched keywords</strong></div>
			<div class="rx-row" id="rx-matched"></div>
			<div class="rx-row rx-muted">Tip: open Options to adjust stopwords/min length.</div>
		</div>
	`;
	document.documentElement.appendChild(root);

	const missingContainer = root.querySelector("#rx-missing");
	const matchedContainer = root.querySelector("#rx-matched");
	for (const t of stats.missing.slice(0, 100)) {
		const s = document.createElement("span");
		s.className = "rx-pill";
		s.textContent = t;
		missingContainer.appendChild(s);
	}
	for (const t of stats.matched.slice(0, 100)) {
		const s = document.createElement("span");
		s.className = "rx-pill";
		s.textContent = t;
		matchedContainer.appendChild(s);
	}

	root.querySelector("#rx-close").addEventListener("click", () => {
		removeOverlay();
	});
	root.querySelector("#rx-clear").addEventListener("click", () => {
		clearHighlights();
	});
	root.querySelector("#rx-rescan").addEventListener("click", () => {
		scanAndShowOverlay();
	});
}

function normalizeWhitespace(text) {
	return (text || "").replace(/\r\n?|\n/g, " \n ").replace(/\s+/g, " ").trim();
}

function deriveTokensFromText(text, customStopwordsCsv, minTokenLength) {
	const lower = normalizeWhitespace(text).toLowerCase();
	const customStopwords = new Set(
		(customStopwordsCsv || "")
			.split(",")
			.map(s => s.trim().toLowerCase())
			.filter(Boolean)
	);
	const defaultStopwords = new Set([
		"and","or","the","a","an","to","of","in","on","for","with","by","at","from","is","are","be","as","that","this","it","we","you","i","our","their","they","include","including","will","shall","can","able","ability","skills","skill","experience","experiences","work","works","working","project","projects","team","teams","using","used","use","detail","details","detailed","etc","eg","e.g","ie","i.e","years","year","month","months","job","role","position","candidate","preferred","required","responsibilities","qualifications"
	]);
	const combinedStopwords = new Set([...defaultStopwords, ...customStopwords]);

	const tokens = lower
		.replace(/[^a-z0-9+#.\-\s]/g, " ")
		.split(/\s+/)
		.map(t => t.trim())
		.filter(Boolean)
		.filter(t => t.length >= (minTokenLength || 3))
		.filter(t => !combinedStopwords.has(t));

	const canonicalize = (t) => t.replace(/s$/i, "");
	const frequency = new Map();
	for (const t of tokens) {
		const c = canonicalize(t);
		frequency.set(c, (frequency.get(c) || 0) + 1);
	}
	return Array.from(frequency.entries())
		.sort((a,b) => b[1] - a[1])
		.map(([t]) => t)
		.slice(0, 400);
}

function pickMainContentRoot() {
	const candidates = [
		"main",
		"article",
		"[role=main]",
		"#main",
		".job, .job-details, .jobDescription, .job-description, .jobdescription, .description, .posting, .jobcontent",
	];
	for (const sel of candidates) {
		const el = document.querySelector(sel);
		if (el) return el;
	}
	return document.body;
}

function getJobText() {
	const root = pickMainContentRoot();
	if (!root) return document.body ? document.body.innerText || "" : "";
	return root.innerText || root.textContent || "";
}

function clearHighlights() {
	const highlighted = document.querySelectorAll(`span.${HIGHLIGHT_MISSING_CLASS}, span.${HIGHLIGHT_MATCH_CLASS}`);
	for (const node of highlighted) {
		const parent = node.parentNode;
		if (!parent) continue;
		parent.replaceChild(document.createTextNode(node.textContent || ""), node);
		parent.normalize();
	}
}

function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAlnum(token) {
	return /^[a-z0-9]+$/i.test(token);
}

function highlightTokens(tokens, className) {
	const root = pickMainContentRoot();
	if (!root) return;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
			const parent = node.parentElement;
			if (!parent) return NodeFilter.FILTER_REJECT;
			const tag = parent.tagName && parent.tagName.toLowerCase();
			if (tag && (tag === "script" || tag === "style" || tag === "noscript" || tag === "input" || tag === "textarea")) return NodeFilter.FILTER_REJECT;
			if (parent.closest(`#${OVERLAY_ID}`)) return NodeFilter.FILTER_REJECT;
			return NodeFilter.FILTER_ACCEPT;
		}
	});

	const alnumTokens = tokens.filter(isAlnum).sort((a,b) => b.length - a.length);
	if (alnumTokens.length === 0) return;
	const pattern = new RegExp(`\\b(${alnumTokens.map(escapeRegex).join("|")})\\b`, "gi");

	const toProcess = [];
	let n;
	while ((n = walker.nextNode())) toProcess.push(n);

	for (const textNode of toProcess) {
		const original = textNode.nodeValue;
		if (!pattern.test(original)) continue;
		pattern.lastIndex = 0;
		const frag = document.createDocumentFragment();
		let lastIndex = 0;
		let m;
		while ((m = pattern.exec(original))) {
			const [full] = m;
			const start = m.index;
			const end = start + full.length;
			if (start > lastIndex) frag.appendChild(document.createTextNode(original.slice(lastIndex, start)));
			const span = document.createElement("span");
			span.className = className;
			span.textContent = original.slice(start, end);
			frag.appendChild(span);
			lastIndex = end;
		}
		if (lastIndex < original.length) frag.appendChild(document.createTextNode(original.slice(lastIndex)));
		textNode.parentNode.replaceChild(frag, textNode);
	}
}

async function scanAndShowOverlay() {
	try {
		const stored = await chrome.storage.sync.get(["resumeTokens", "customStopwords", "minTokenLength"]);
		const resumeTokens = Array.isArray(stored.resumeTokens) ? new Set(stored.resumeTokens.map(s => String(s).toLowerCase())) : new Set();
		const jobText = getJobText();
		const jobTokens = deriveTokensFromText(jobText, stored.customStopwords || "", stored.minTokenLength || 3);
		const missing = [];
		const matched = [];
		for (const t of jobTokens) {
			if (resumeTokens.has(t)) matched.push(t); else missing.push(t);
		}
		clearHighlights();
		highlightTokens(missing, HIGHLIGHT_MISSING_CLASS);
		createOverlay({ missing, matched });
	} catch (e) {
		console.error("Resumax scan failed", e);
	}
}

// Listen for popup trigger
chrome.runtime.onMessage.addListener((message) => {
	if (!message) return;
	if (message.type === "scanJob") {
		scanAndShowOverlay();
	} else if (message.type === "clearOverlay") {
		clearHighlights();
		removeOverlay();
	}
});


