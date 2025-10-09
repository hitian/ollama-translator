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
  const title = document.createElement("div");
  title.className = "result-title";
  title.textContent = model;
  const body = document.createElement("div");
  body.className = "result-body";
  const line = document.createElement("div");
  line.className = "skeleton";
  line.style.width = "70%";
  const line2 = document.createElement("div");
  line2.className = "skeleton";
  line2.style.width = "40%";
  body.append(line, document.createElement("br"), line2);
  card.append(title, body);
  els.results.appendChild(card);
  return card;
}

function updateResultCard(card, text) {
  const body = card.querySelector(".result-body");
  body.textContent = text;
}

async function translateOnce(model, from, to, text) {
  const base = getBaseUrl();
  const prompt = `Translate the following text from ${from} to ${to}. Preserve meaning, lists and punctuation. Return only the translated text.\n\n${text}`;
  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Model ${model} failed: HTTP ${res.status}`);
  const data = await res.json();
  return data.response || "";
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
      const out = await translateOnce(model, els.from.value, els.to.value, text);
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

