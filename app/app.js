// Copied renderer logic for Electron bundle
// Source: ../app.js

// Ollama Translator UI logic

const DEFAULT_BASE_URL = "http://localhost:11434";

const els = {
  from: document.getElementById("fromLang"),
  to: document.getElementById("toLang"),
  swap: document.getElementById("swapLang"),
  modelBtn: document.getElementById("modelBtn"),
  modelCount: document.getElementById("modelCount"),
  translateBtn: document.getElementById("translateBtn"),
  text: document.getElementById("sourceText"),
  charCount: document.getElementById("charCount"),
  clearBtn: document.getElementById("clearInputBtn"),
  results: document.getElementById("results"),
  // settings
  settingsBtn: document.getElementById("settingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  settingsSave: document.getElementById("settingsSave"),
  settingsCancel: document.getElementById("settingsCancel"),
  // models
  modelsModal: document.getElementById("modelsModal"),
  modelsList: document.getElementById("modelsList"),
  modelsDone: document.getElementById("modelsDone"),
  modelsCancel: document.getElementById("modelsCancel"),
  refreshModels: document.getElementById("refreshModels"),
};

function getBaseUrl() {
  return (localStorage.getItem("ollama_base_url") || DEFAULT_BASE_URL).replace(/\/$/, "");
}
function setBaseUrl(url) {
  localStorage.setItem("ollama_base_url", url.replace(/\/$/, ""));
}

function getSelectedModels() {
  try {
    const raw = localStorage.getItem("ollama_selected_models");
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function setSelectedModels(list) {
  localStorage.setItem("ollama_selected_models", JSON.stringify(list));
  els.modelCount.textContent = String(list.length);
}

function updateCharCount() {
  const v = els.text.value || "";
  els.charCount.textContent = `${v.length} / 5000`;
}

function swapLanguages() {
  const a = els.from.value;
  els.from.value = els.to.value;
  els.to.value = a;
}

async function listModels() {
  const base = getBaseUrl();
  try {
    const res = await fetch(`${base}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = (data.models || []).map(m => m.name).sort((a,b)=>a.localeCompare(b));
    return models;
  } catch (err) {
    console.error("Failed to fetch models", err);
    throw new Error(`Unable to fetch models from ${base}. ${err.message}`);
  }
}

function renderModelsList(allModels, selected) {
  els.modelsList.innerHTML = "";
  if (!allModels.length) {
    const div = document.createElement("div");
    div.textContent = "No models found. Use ollama to pull images.";
    els.modelsList.appendChild(div);
    return;
  }
  allModels.forEach(name => {
    const item = document.createElement("label");
    item.className = "model-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = name;
    cb.checked = selected.includes(name);
    const span = document.createElement("span");
    span.textContent = name;
    item.appendChild(cb);
    item.appendChild(span);
    els.modelsList.appendChild(item);
  });
}

function openSettings() {
  els.apiBaseUrl.value = getBaseUrl();
  els.settingsModal.classList.remove("hidden");
}
function closeSettings() { els.settingsModal.classList.add("hidden"); }

async function openModels() {
  els.modelsModal.classList.remove("hidden");
  const selected = getSelectedModels();
  try {
    const models = await listModels();
    renderModelsList(models, selected);
  } catch (e) {
    renderModelsList([], selected);
    alert(e.message);
  }
}
function closeModels() { els.modelsModal.classList.add("hidden"); }

async function refreshModelsList() {
  const selected = getSelectedModels();
  try {
    const models = await listModels();
    renderModelsList(models, selected);
  } catch (e) {
    alert(e.message);
  }
}

function collectModelsFromModal() {
  const cbs = els.modelsList.querySelectorAll('input[type="checkbox"]');
  const picked = [];
  cbs.forEach(cb => { if (cb.checked) picked.push(cb.value); });
  return picked;
}

function addResultCardPending(model) {
  const card = document.createElement("article");
  card.className = "result-card";
  card.dataset.model = model;
  const header = document.createElement("div");
  header.className = "result-header";
  const title = document.createElement("div");
  title.className = "result-title";
  title.textContent = model;
  const actions = document.createElement("div");
  actions.className = "result-actions";
  const copyBtn = document.createElement("button");
  copyBtn.className = "icon-btn tool-btn";
  copyBtn.title = "Copy result";
  copyBtn.setAttribute("aria-label", "Copy result");
  copyBtn.disabled = true; // enable when content arrives
  copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.7"/><path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.7"/></svg>';
  actions.appendChild(copyBtn);
  header.append(title, actions);
  const body = document.createElement("div");
  body.className = "result-body";
  const line = document.createElement("div");
  line.className = "skeleton";
  line.style.width = "70%";
  const line2 = document.createElement("div");
  line2.className = "skeleton";
  line2.style.width = "40%";
  body.append(line, document.createElement("br"), line2);
  card.append(header, body);
  els.results.appendChild(card);
  return card;
}

function updateResultCard(card, text) {
  const body = card.querySelector(".result-body");
  body.innerHTML = markdownToHtml(text || "");
  const btn = card.querySelector(".result-actions .icon-btn");
  if (btn) {
    btn.disabled = !text;
    btn.onclick = () => copyToClipboard(text, btn);
  }
}

async function translateOnce(model, from, to, text, onPartial) {
  const base = getBaseUrl();
  const prompt = `Translate the following text from ${from} to ${to}. Preserve meaning, lists and punctuation. Return only the translated text.\n\n${text}`;
  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Model ${model} failed: HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.response) {
            fullText += obj.response;
            if (typeof onPartial === "function") onPartial(fullText);
          }
          if (obj.error) {
            throw new Error(obj.error);
          }
          if (obj.done) {
            break;
          }
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  return fullText;
}

async function performTranslate() {
  const text = els.text.value.trim();
  if (!text) { alert("Please enter text to translate."); return; }
  const models = getSelectedModels();
  if (!models.length) { alert("Please select at least one model."); return; }

  els.translateBtn.disabled = true;
  els.results.innerHTML = "";

  for (const model of models) {
    const card = addResultCardPending(model);
    try {
      const out = await translateOnce(
        model,
        els.from.value,
        els.to.value,
        text,
        (partial) => updateResultCard(card, partial)
      );
      updateResultCard(card, out);
    } catch (e) {
      updateResultCard(card, `Error: ${e.message}`);
    }
  }

  els.translateBtn.disabled = false;
}

// Wire events
els.text.addEventListener("input", updateCharCount);
updateCharCount();

els.clearBtn.addEventListener("click", () => {
  els.text.value = "";
  updateCharCount();
  els.text.focus();
});

els.swap.addEventListener("click", swapLanguages);

els.settingsBtn.addEventListener("click", openSettings);
els.settingsCancel.addEventListener("click", closeSettings);
els.settingsSave.addEventListener("click", () => {
  const url = els.apiBaseUrl.value.trim() || DEFAULT_BASE_URL;
  setBaseUrl(url);
  closeSettings();
});

els.modelBtn.addEventListener("click", openModels);
els.modelsCancel.addEventListener("click", closeModels);
els.modelsDone.addEventListener("click", () => {
  const picked = collectModelsFromModal();
  setSelectedModels(picked);
  closeModels();
});
els.refreshModels.addEventListener("click", refreshModelsList);

els.translateBtn.addEventListener("click", performTranslate);

// init
(() => {
  // default base url
  if (!localStorage.getItem("ollama_base_url")) setBaseUrl(DEFAULT_BASE_URL);
  // reflect model count
  els.modelCount.textContent = String(getSelectedModels().length);
})();

// Clipboard helper
async function copyToClipboard(text, btn) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    if (btn) {
      const prev = btn.title;
      btn.title = "Copied!";
      btn.classList.add("copied");
      setTimeout(() => { btn.title = prev; btn.classList.remove("copied"); }, 1200);
    }
  } catch (e) {
    alert("Copy failed: " + e.message);
  }
}

// Basic Markdown renderer (safe subset)
function markdownToHtml(src) {
  if (!src) return "";
  // Normalize line endings
  let text = String(src).replace(/\r\n?/g, "\n");

  // Escape HTML first to avoid injection
  const escapeHtml = (s) => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

  // Handle fenced code blocks ```...```
  const codeBlocks = [];
  text = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    const escaped = escapeHtml(code);
    codeBlocks.push(`<pre><code>${escaped}</code></pre>`);
    return `\uE000${codeBlocks.length - 1}\uE000`;
  });

  // Split into lines and build block HTML
  const lines = text.split(/\n/);
  const out = [];
  let inUl = false, inOl = false;

  const closeLists = () => {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };

  const renderInline = (s) => {
    let t = escapeHtml(s);
    // Inline code `code`
    t = t.replace(/`([^`]+)`/g, (m, a) => `<code>${a}</code>`);
    // Bold **text**
    t = t.replace(/\*\*([^*]+)\*\*/g, (m, a) => `<strong>${a}</strong>`);
    // Italic *text* or _text_
    t = t.replace(/\b_([^_]+)_\b/g, (m, a) => `<em>${a}</em>`);
    t = t.replace(/(^|\W)\*([^*]+)\*(?=\W|$)/g, (m, pre, a) => `${pre}<em>${a}</em>`);
    // Links [text](url)
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
      try {
        const safe = String(href).trim();
        const ok = /^(https?:|mailto:|#|\/)/i.test(safe);
        const h = ok ? safe : '#';
        return `<a href="${h}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      } catch { return label; }
    });
    return t;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { closeLists(); continue; }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeLists();
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      closeLists();
      out.push(`<blockquote>${renderInline(bq[1])}</blockquote>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      if (!inOl) { closeLists(); out.push("<ol>"); inOl = true; }
      out.push(`<li>${renderInline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      if (!inUl) { closeLists(); out.push("<ul>"); inUl = true; }
      out.push(`<li>${renderInline(line.replace(/^\s*[-*+]\s+/, ""))}</li>`);
      continue;
    }

    // Paragraph
    closeLists();
    out.push(`<p>${renderInline(line)}</p>`);
  }
  closeLists();

  let html = out.join("\n");
  // Restore code blocks placeholders
  html = html.replace(/\uE000(\d+)\uE000/g, (_, idx) => codeBlocks[Number(idx)] || "");
  return html;
}
