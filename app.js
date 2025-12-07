// Ollama Translator UI logic

const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

const els = {
  from: document.getElementById("fromLang"),
  to: document.getElementById("toLang"),
  swap: document.getElementById("swapLang"),
  modelBtn: document.getElementById("modelBtn"),
  translateBtn: document.getElementById("translateBtn"),
  text: document.getElementById("sourceText"),
  charCount: document.getElementById("charCount"),
  tokenWarning: document.getElementById("tokenWarning"),
  clearBtn: document.getElementById("clearInputBtn"),
  results: document.getElementById("results"),
  // settings
  settingsBtn: document.getElementById("settingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  apiBaseUrlOllama: document.getElementById("apiBaseUrlOllama"),
  apiBaseUrlOpenAI: document.getElementById("apiBaseUrlOpenAI"),
  apiToken: document.getElementById("apiToken"),
  settingsSave: document.getElementById("settingsSave"),
  settingsCancel: document.getElementById("settingsCancel"),
  // models
  modelsModal: document.getElementById("modelsModal"),
  modelsList: document.getElementById("modelsList"),
  modelsFilter: document.getElementById("modelsFilter"),
  selectedModels: document.getElementById("selectedModels"),
  modelsDone: document.getElementById("modelsDone"),
  modelsCancel: document.getElementById("modelsCancel"),
  refreshModels: document.getElementById("refreshModels"),
};

// Modal state for model picker
let modalState = null; // { all: {ollama:string[], openai:string[]}, filter: string }

// Model info cache: { modelName: { contextLength: number, ... } }
let modelInfoCache = {};

function getCachedModelLists() {
  try {
    const raw = localStorage.getItem('cached_model_lists');
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Check if cache is less than 1 hour old
    const cacheAge = Date.now() - (data.timestamp || 0);
    if (cacheAge > 3600000) return null; // 1 hour expiry
    return data;
  } catch {
    return null;
  }
}

function setCachedModelLists(ollama, openai, modelInfo) {
  try {
    const data = {
      timestamp: Date.now(),
      ollama,
      openai,
      modelInfo
    };
    localStorage.setItem('cached_model_lists', JSON.stringify(data));
  } catch {}
}

function clearCachedModelLists() {
  try {
    localStorage.removeItem('cached_model_lists');
  } catch {}
}

function getOllamaBaseUrl() { return (localStorage.getItem('ollama_base_url') || OLLAMA_DEFAULT_BASE_URL).replace(/\/$/, ""); }
function setOllamaBaseUrl(url) { localStorage.setItem('ollama_base_url', (url || OLLAMA_DEFAULT_BASE_URL).replace(/\/$/, "")); }
function getOpenAiBaseUrl() { return (localStorage.getItem('openai_base_url') || OPENAI_DEFAULT_BASE_URL).replace(/\/$/, ""); }
function setOpenAiBaseUrl(url) { localStorage.setItem('openai_base_url', (url || OPENAI_DEFAULT_BASE_URL).replace(/\/$/, "")); }
function getOpenAiToken() { return localStorage.getItem('openai_token') || ''; }
function setOpenAiToken(tok) { if (tok) localStorage.setItem('openai_token', tok); }

function getSelectedModels() {
  try {
    const raw = localStorage.getItem('selected_models');
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function setSelectedModels(list) {
  try { localStorage.setItem('selected_models', JSON.stringify(Array.from(new Set(list)))); } catch {}
}

function getMinTokenLimit() {
  const selected = getSelectedModels();
  if (!selected.length) return 5000; // default if no models selected
  
  let minLimit = Infinity;
  for (const modelName of selected) {
    const info = modelInfoCache[modelName];
    if (info && info.contextLength) {
      // Reserve ~20% for output and system prompt
      const inputLimit = Math.floor(info.contextLength * 0.8);
      minLimit = Math.min(minLimit, inputLimit);
    }
  }
  
  // If no info found, use conservative default
  return minLimit === Infinity ? 2048 : minLimit;
}

function updateInputLimit() {
  const limit = getMinTokenLimit();
  // Approximate: 1 token ~= 4 characters for English text
  const charLimit = Math.floor(limit * 4);
  els.text.setAttribute('maxlength', charLimit);
  updateCharCount();
}

function updateCharCount() {
  const v = els.text.value || "";
  const limit = parseInt(els.text.getAttribute('maxlength')) || 5000;
  els.charCount.textContent = `${v.length} / ${limit}`;
  
  // Show warning if approaching or exceeding limit
  const tokenLimit = getMinTokenLimit();
  const approxTokens = Math.ceil(v.length / 4);
  
  if (approxTokens > tokenLimit * 0.9) {
    const selectedModels = getSelectedModels();
    const modelNames = selectedModels.length > 0 ? selectedModels.join(', ') : 'selected models';
    els.tokenWarning.textContent = `⚠️ Input approaching token limit (~${approxTokens} tokens). Max for ${modelNames}: ${tokenLimit} tokens`;
    els.tokenWarning.classList.remove('hidden');
  } else {
    els.tokenWarning.classList.add('hidden');
  }
}

function swapLanguages() {
  const a = els.from.value;
  els.from.value = els.to.value;
  els.to.value = a;
}

async function listModels() { /* legacy for modal; prefer listAllModels */ return []; }

async function getOllamaModelInfo(modelName) {
  try {
    const base = getOllamaBaseUrl();
    const res = await fetch(`${base}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName })
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Extract context length from modelinfo or parameters
    let contextLength = 2048; // default fallback
    if (data.model_info) {
      // Try to find context length in various possible fields
      const info = typeof data.model_info === 'string' ? JSON.parse(data.model_info) : data.model_info;
      contextLength = info['llama.context_length'] || info.context_length || info.num_ctx || contextLength;
    }
    if (data.parameters) {
      const params = data.parameters.split('\n');
      for (const param of params) {
        if (param.includes('num_ctx')) {
          const match = param.match(/num_ctx\s+(\d+)/);
          if (match) contextLength = parseInt(match[1]);
        }
      }
    }
    return { contextLength };
  } catch {
    return { contextLength: 2048 };
  }
}

async function listAllModels(forceRefresh = false) {
  // Try to use cache unless force refresh
  if (!forceRefresh) {
    const cached = getCachedModelLists();
    if (cached) {
      // Restore model info cache
      modelInfoCache = cached.modelInfo || {};
      return { ollama: cached.ollama || [], openai: cached.openai || [] };
    }
  }

  const ollamaBase = getOllamaBaseUrl();
  const openaiBase = getOpenAiBaseUrl();
  const token = getOpenAiToken();
  const results = { ollama: [], openai: [] };
  const tasks = [];
  tasks.push((async () => {
    try { 
      const res = await fetch(`${ollamaBase}/api/tags`); 
      if (res.ok) { 
        const data = await res.json(); 
        results.ollama = (data.models || []).map(m=>m.name).sort((a,b)=>a.localeCompare(b));
        // Fetch model info for each Ollama model
        for (const modelName of results.ollama) {
          const info = await getOllamaModelInfo(modelName);
          if (info) modelInfoCache[modelName] = info;
        }
      } 
    } catch {}
  })());
  tasks.push((async () => {
    if (!token) return; 
    try { 
      const res = await fetch(`${openaiBase.replace(/\/$/, '')}/models`, { headers: { 'Authorization': `Bearer ${token}` } }); 
      if (res.ok) { 
        const data = await res.json(); 
        results.openai = (data.data || []).map(m=>m.id).sort((a,b)=>a.localeCompare(b));
        // Set default context lengths for OpenAI models (these are approximations)
        const knownLimits = {
          'gpt-4': 8192, 'gpt-4-32k': 32768, 'gpt-4-turbo': 128000, 'gpt-4-turbo-preview': 128000,
          'gpt-3.5-turbo': 4096, 'gpt-3.5-turbo-16k': 16384, 'gpt-3.5-turbo-1106': 16385,
          'gpt-4o': 128000, 'gpt-4o-mini': 128000
        };
        for (const modelId of results.openai) {
          // Try to match known models or use conservative default
          let contextLength = 4096; // conservative default
          for (const [pattern, limit] of Object.entries(knownLimits)) {
            if (modelId.includes(pattern)) {
              contextLength = limit;
              break;
            }
          }
          modelInfoCache[modelId] = { contextLength };
        }
      } 
    } catch {}
  })());
  await Promise.all(tasks);
  
  // Cache the results
  setCachedModelLists(results.ollama, results.openai, modelInfoCache);
  
  return results;
}

function renderCombined(all, filterText = "") {
  els.modelsList.innerHTML = "";
  const q = (filterText || "").toLowerCase();
  const apply = (arr) => q ? arr.filter(m => m.toLowerCase().includes(q)) : arr;
  const renderSection = (label, items) => {
    const hdr = document.createElement('div');
    hdr.className = 'selected-title';
    hdr.textContent = label;
    els.modelsList.appendChild(hdr);
    const list = apply(items || []);
    if (!list.length) {
      const none = document.createElement('div');
      none.className = 'model-item';
      none.textContent = 'No models';
      els.modelsList.appendChild(none);
      return;
    }
    list.forEach(name => {
      const item = document.createElement('label');
      item.className = 'model-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = name;
      cb.checked = modalState && modalState.selected ? modalState.selected.has(name) : false;
      cb.addEventListener('change', () => {
        if (!modalState) return;
        if (cb.checked) modalState.selected.add(name); else modalState.selected.delete(name);
        updateSelectedModelsView();
        updateInputLimit();
      });
      const span = document.createElement('span');
      const info = modelInfoCache[name];
      const contextText = info ? ` (${info.contextLength} tokens)` : '';
      span.textContent = name + contextText;
      item.appendChild(cb);
      item.appendChild(span);
      els.modelsList.appendChild(item);
    });
  };
  renderSection('Ollama', all.ollama);
  renderSection('OpenAI-compatible', all.openai);
}

function updateSelectedModelsView() {
  if (!els.selectedModels) return;
  els.selectedModels.innerHTML = "";
  const arr = modalState ? Array.from(modalState.selected).sort((a,b)=>a.localeCompare(b)) : getSelectedModels();
  arr.forEach(name => {
    const pill = document.createElement('span');
    pill.className = 'selected-pill';
    const txt = document.createElement('span'); txt.textContent = name;
    const x = document.createElement('button'); x.type = 'button'; x.title = 'Remove'; x.textContent = '×';
    x.addEventListener('click', () => {
      if (modalState) {
        modalState.selected.delete(name);
        updateSelectedModelsView();
        // reflect in checkboxes if present
        const cb = els.modelsList.querySelector(`input[type="checkbox"][value="${CSS.escape(name)}"]`);
        if (cb) cb.checked = false;
      }
    });
    pill.append(txt, x);
    els.selectedModels.appendChild(pill);
  });
}

function openSettings() {
  if (els.apiBaseUrlOllama) els.apiBaseUrlOllama.value = getOllamaBaseUrl();
  if (els.apiBaseUrlOpenAI) els.apiBaseUrlOpenAI.value = getOpenAiBaseUrl();
  if (els.apiToken) els.apiToken.value = getOpenAiToken();
  els.settingsModal.classList.remove('hidden');
}
function closeSettings() { els.settingsModal.classList.add("hidden"); }

async function openModels() {
  els.modelsModal.classList.remove("hidden");
  modalState = { all: { ollama: [], openai: [] }, selected: new Set(getSelectedModels()), filter: "" };
  if (els.modelsFilter) els.modelsFilter.value = ""; // clear filter on open
  try {
    const all = await listAllModels(false); // Use cache if available
    modalState.all = all;
    renderCombined(all, "");
    updateSelectedModelsView();
  } catch (e) {
    modalState.all = { ollama: [], openai: [] };
    renderCombined(modalState.all, "");
    alert(e.message);
  }
}
function closeModels() { els.modelsModal.classList.add("hidden"); modalState = null; }

function updateModelButtonText() {
  const count = getSelectedModels().length;
  els.modelBtn.textContent = count > 0 ? `Models (${count})` : 'Models';
}

async function refreshModelsList() {
  try {
    clearCachedModelLists();
    const all = await listAllModels(true);
    if (modalState) modalState.all = all;
    renderCombined(all, modalState ? modalState.filter : "");
  } catch (e) { alert(e.message); }
}

function collectModelsFromModal() { return modalState ? Array.from(modalState.selected) : getSelectedModels(); }

// (single renderCombined definition above creates checkboxes)

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
  enhanceCodeBlocks(body);
  const btn = card.querySelector(".result-actions .icon-btn");
  if (btn) {
    btn.disabled = !text;
    btn.onclick = () => copyToClipboard(text, btn);
  }
}

// Provider-specific translation

async function translateOnceOllama(model, from, to, text, onPartial) {
  const base = getOllamaBaseUrl();
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
          if (obj.error) throw new Error(obj.error);
          if (obj.done) break;
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }
  } finally { try { reader.releaseLock(); } catch {} }
  return fullText;
}

async function translateOnceOpenAI(model, from, to, text, onPartial) {
  const base = getOpenAiBaseUrl();
  const token = getOpenAiToken();
  if (!token) throw new Error('Missing OpenAI token');
  const prompt = `Translate the following text from ${from} to ${to}. Preserve meaning, lists and punctuation. Return only the translated text.\n\n${text}`;
  const url = `${base.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: 'You are a helpful translation engine.' },
        { role: 'user', content: prompt }
      ]
    })
  });
  if (!res.ok || !res.body) throw new Error(`Model ${model} failed: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = chunk.split('\n');
        for (const ln of lines) {
          const m = ln.match(/^data:\s*(.*)$/);
          if (!m) continue;
          const data = m[1].trim();
          if (data === '[DONE]') { buffer = ''; break; }
          try {
            const obj = JSON.parse(data);
            const delta = obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content;
            if (delta) {
              fullText += delta;
              if (typeof onPartial === 'function') onPartial(fullText);
            }
            const err = obj.error && (obj.error.message || obj.error);
            if (err) throw new Error(err);
          } catch {}
        }
      }
    }
  } finally { try { reader.releaseLock(); } catch {} }
  return fullText;
}

async function performTranslate() {
  const text = els.text.value.trim();
  if (!text) { alert("Please enter text to translate."); return; }

  els.translateBtn.disabled = true;
  els.results.innerHTML = "";

  // List models from both providers
  const { ollama, openai } = await listAllModels();
  const selected = new Set(getSelectedModels());
  const ollamaList = selected.size ? ollama.filter(m => selected.has(m)) : ollama;
  const openaiList = selected.size ? openai.filter(m => selected.has(m)) : openai;

  const runGroup = async (label, list, fn, maxConcurrency = 3) => {
    if (!list || !list.length) return;
    const sep = document.createElement('div'); sep.className = 'result-separator'; sep.textContent = label;
    els.results.appendChild(sep);
    
    // Create pending cards for all models
    const tasks = list.map(model => ({
      model,
      card: addResultCardPending(model)
    }));
    
    // Process with concurrency limit
    const runTask = async (task) => {
      try {
        const out = await fn(task.model, els.from.value, els.to.value, text, (partial) => updateResultCard(task.card, partial));
        updateResultCard(task.card, out);
      } catch (e) {
        updateResultCard(task.card, `Error: ${e.message}`);
      }
    };
    
    // Process tasks with limited concurrency
    const executing = [];
    for (const task of tasks) {
      const promise = runTask(task).then(() => {
        executing.splice(executing.indexOf(promise), 1);
      });
      executing.push(promise);
      
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
      }
    }
    
    // Wait for remaining tasks
    await Promise.all(executing);
  };

  await runGroup('Ollama', ollamaList, translateOnceOllama, 3);
  await runGroup('OpenAI-compatible', openaiList, translateOnceOpenAI, 3);

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
els.settingsSave.addEventListener('click', () => {
  if (els.apiBaseUrlOllama) setOllamaBaseUrl((els.apiBaseUrlOllama.value || OLLAMA_DEFAULT_BASE_URL).trim());
  if (els.apiBaseUrlOpenAI) setOpenAiBaseUrl((els.apiBaseUrlOpenAI.value || OPENAI_DEFAULT_BASE_URL).trim());
  if (els.apiToken) setOpenAiToken((els.apiToken.value || '').trim());
  closeSettings();
});

// no mode toggles needed

if (els.modelBtn) els.modelBtn.addEventListener("click", openModels);
els.modelsCancel.addEventListener("click", closeModels);
els.modelsDone.addEventListener("click", () => {
  const picked = collectModelsFromModal();
  setSelectedModels(picked);
  closeModels();
  updateModelButtonText();
  updateInputLimit();
});
els.refreshModels.addEventListener("click", refreshModelsList);

// Close modals when clicking outside
els.modelsModal.addEventListener("click", (e) => {
  if (e.target === els.modelsModal) closeModels();
});
els.settingsModal.addEventListener("click", (e) => {
  if (e.target === els.settingsModal) closeSettings();
});

if (els.modelsFilter) {
  els.modelsFilter.addEventListener('input', (e) => {
    const val = e.target.value;
    if (modalState) modalState.filter = val;
    const all = modalState ? modalState.all : { ollama: [], openai: [] };
    renderCombined(all, val);
  });
}

els.translateBtn.addEventListener("click", performTranslate);

// init
(async () => {
  if (!localStorage.getItem('ollama_base_url')) localStorage.setItem('ollama_base_url', OLLAMA_DEFAULT_BASE_URL);
  if (!localStorage.getItem('openai_base_url')) localStorage.setItem('openai_base_url', OPENAI_DEFAULT_BASE_URL);
  updateModelButtonText();
  // Load model info cache on startup (use cache if available)
  try {
    await listAllModels(false);
    updateInputLimit();
  } catch {}
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
  // If Marked is available, prefer it with Highlight.js
  if (typeof window !== 'undefined' && window.marked) {
    try {
      if (window.hljs) {
        const highlight = (code, lang) => {
          try {
            if (lang && hljs.getLanguage(lang)) {
              return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
          } catch { return code; }
        };
        window.marked.setOptions({ gfm: true, breaks: true, highlight });
      } else {
        window.marked.setOptions({ gfm: true, breaks: true });
      }
      return window.marked.parse(src);
    } catch (e) { /* fall through to fallback */ }
  }

  // Fallback: minimal Markdown
  // Normalize line endings
  let text = String(src).replace(/\r\n?/g, "\n");

  // Escape HTML first to avoid injection
  const escapeHtml = (s) => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Handle fenced code blocks ```lang\n...```
  const codeBlocks = [];
  text = text.replace(/```([A-Za-z0-9_+\-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const highlighted = highlightCode(code, (lang || '').trim(), escapeHtml);
    codeBlocks.push(highlighted);
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

    // Table (GitHub-style): header, separator, rows
    if (line.includes('|') && i + 1 < lines.length) {
      const sep = lines[i + 1];
      const sepMatch = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(sep);
      if (sepMatch) {
        closeLists();
        const parseRow = (row) => row
          .split('|')
          .map(c => c.trim())
          .filter((c, idx, arr) => !(idx === 0 && c === '') && !(idx === arr.length - 1 && c === ''));
        const headerCells = parseRow(line);
        const alignParts = parseRow(sep).map(p => {
          const left = /^:\-+/.test(p);
          const right = /\-+:$/.test(p);
          return left && right ? 'center' : right ? 'right' : 'left';
        });
        const rows = [];
        let j = i + 2;
        while (j < lines.length && lines[j].trim().includes('|')) {
          const r = parseRow(lines[j]);
          if (r.length) rows.push(r);
          j++;
        }
        i = j - 1; // advance
        let tbl = '<table class="md-table">\n<thead><tr>' + headerCells.map((h, idx) => {
          const align = alignParts[idx] || 'left';
          return `<th style="text-align:${align}">${renderInline(h)}</th>`;
        }).join('') + '</tr></thead>';
        tbl += '<tbody>' + (rows.map(r => {
          return '<tr>' + r.map((c, idx) => {
            const align = alignParts[idx] || 'left';
            return `<td style="text-align:${align}">${renderInline(c)}</td>`;
          }).join('') + '</tr>';
        }).join('')) + '</tbody></table>';
        out.push(tbl);
        continue;
      }
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

// Tiny syntax highlighter (best-effort)
function highlightCode(code, lang, escapeHtml) {
  const l = String(lang || '').toLowerCase();
  const esc = escapeHtml(code);
  const span = (cls, s) => `<span class="tok-${cls}">${s}</span>`;
  const kw = (words) => new RegExp(`\\b(${words.join('|')})\\b`, 'g');

  const restore = (src, placeholders) => src.replace(/\uE002(\d+)\uE002/g, (_, i) => placeholders[Number(i)] || '');

  if (['js','jsx','ts','tsx','javascript','typescript'].includes(l)) {
    let tmp = esc;
    const placeholders = [];
    const put = (html) => { const i = placeholders.length; placeholders.push(html); return `\uE002${i}\uE002`; };
    // Wrap and protect comments
    tmp = tmp.replace(/\/\*[\s\S]*?\*\//g, m => put(span('comment', m)));
    tmp = tmp.replace(/^\/\/.*$/gm, m => put(span('comment', m)));
    // Highlight the rest
    tmp = tmp
      .replace(/`[^`]*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, m => span('string', m))
      .replace(/\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\b/g, m => span('number', m))
      .replace(kw(['const','let','var','function','return','if','else','for','while','class','new','import','from','export','default','extends','super','this','try','catch','finally','throw','switch','case','break','continue','true','false','null','undefined','in','of']), m => span('kw', m));
    const highlighted = restore(tmp, placeholders);
    return `<pre><code class="language-${l}">${highlighted}</code></pre>`;
  }

  if (['json'].includes(l)) {
    const rules = [
      { re: /"(?:[^"\\]|\\.)*"(?=\s*:)/g, fn: m => span('prop', m) },
      { re: /"(?:[^"\\]|\\.)*"/g, fn: m => span('string', m) },
      { re: /\b(true|false|null)\b/g, fn: m => span('kw', m) },
      { re: /\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, fn: m => span('number', m) },
    ];
    const highlighted = apply(esc, rules);
    return `<pre><code class="language-${l}">${highlighted}</code></pre>`;
  }

  if (['py','python'].includes(l)) {
    let tmp = esc;
    const placeholders = [];
    const put = (html) => { const i = placeholders.length; placeholders.push(html); return `\uE002${i}\uE002`; };
    tmp = tmp.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, m => put(span('comment', m)));
    tmp = tmp.replace(/^#.*$/gm, m => put(span('comment', m)));
    tmp = tmp
      .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, m => span('string', m))
      .replace(/\b(\d+(?:\.\d+)?)\b/g, m => span('number', m))
      .replace(kw(['def','return','if','elif','else','for','while','class','import','from','as','try','except','finally','with','lambda','True','False','None','pass','break','continue','yield','global','nonlocal','in','is','not','and','or','self']), m => span('kw', m));
    const highlighted = restore(tmp, placeholders);
    return `<pre><code class="language-${l}">${highlighted}</code></pre>`;
  }

  if (['bash','sh','zsh','shell'].includes(l)) {
    let tmp = esc;
    const placeholders = [];
    const put = (html) => { const i = placeholders.length; placeholders.push(html); return `\uE002${i}\uE002`; };
    tmp = tmp.replace(/^#!.*$/gm, m => put(span('comment', m)));
    tmp = tmp.replace(/#.*$/gm, m => put(span('comment', m)));
    tmp = tmp
      .replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, m => span('var', m))
      .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, m => span('string', m))
      .replace(kw(['if','then','fi','elif','else','for','in','do','done','case','esac','function','select','until']), m => span('kw', m))
      .replace(/\b\d+\b/g, m => span('number', m));
    const highlighted = restore(tmp, placeholders);
    return `<pre><code class="language-${l}">${highlighted}</code></pre>`;
  }

  // Fallback: escaped, no highlighting
  return `<pre><code class="language-${l || 'text'}">${esc}</code></pre>`;
}

// After rendering markdown, enhance code blocks: highlight (if hljs), add copy buttons
function enhanceCodeBlocks(root) {
  if (!root) return;
  const pres = root.querySelectorAll('pre');
  pres.forEach(pre => {
    // Remove any previous copy button to avoid duplicates on streaming updates
    const existing = pre.querySelector('.code-copy-btn');
    if (existing) existing.remove();

    const codeEl = pre.querySelector('code') || pre;
    if (window.hljs && codeEl && !codeEl.classList.contains('hljs')) {
      try { window.hljs.highlightElement(codeEl); } catch {}
    }

    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.type = 'button';
    btn.title = 'Copy code';
    btn.textContent = 'Copy';
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const text = codeEl ? codeEl.innerText : pre.innerText;
      await copyToClipboard(text, btn);
    });
    pre.appendChild(btn);
  });
}
