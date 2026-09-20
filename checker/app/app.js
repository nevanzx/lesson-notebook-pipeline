import { parseRosterFile, downloadWorkbook } from "./lib/sheets-io.js";
import { parseRosterSheet, mergeRosters, joinSubmissions } from "./lib/roster.js";
import { decryptSubmission } from "./lib/decrypt.js";
import { scoreNonAI } from "./lib/score.js";
import { gradeAll } from "./lib/sa.js";
import { buildWorkbookData } from "./lib/export-book.js";

const MODELS_BUILTIN = [
  "muse-spark-1.3-contributor",
  "glm-5.3-flash",
  "deepseek-v4.1-flash",
  "qwen3.8-flash",
];
const WORKER_DEFAULT = "https://checker-grade.<account>.workers.dev";

const state = {
  setup: { workerUrl: WORKER_DEFAULT, apiKey: "", model: MODELS_BUILTIN[0] },
  roster: [],
  assignments: [],
  unmatchedAll: [],
  missingAll: [],
};

let saLocked = false;
let pendingSubFiles = [];

const $ = (id) => document.getElementById(id);

function studentKey(r) {
  return (r && r.id) || (r && r.name) || "";
}

function tagFromOutput(output, fallbackName) {
  const raw = String(output || "");
  if (raw) {
    const base = raw.split(/[\\/]/).pop().replace(/\.[^.]*$/, "");
    if (base) return base;
  }
  return String(fallbackName || "assignment")
    .replace(/-key\.json$/i, "")
    .replace(/\.json$/i, "");
}

/* ---- 1. Setup ---- */

function setModelOptions(models) {
  const sel = $("modelSel");
  sel.innerHTML = "";
  for (const m of models) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  }
  if (models.includes(state.setup.model)) sel.value = state.setup.model;
}

async function loadModels() {
  try {
    const res = await fetch(`${state.setup.workerUrl.replace(/\/$/, "")}/models`);
    if (!res.ok) throw new Error(`models failed: ${res.status}`);
    const data = await res.json();
    const models = Array.isArray(data) ? data : data.models;
    if (!Array.isArray(models) || models.length === 0) throw new Error("models empty");
    setModelOptions(models.map(String));
  } catch {
    setModelOptions(MODELS_BUILTIN);
  }
}

function initSetup() {
  const savedKey = localStorage.getItem("checker.goKey");
  if (savedKey) {
    $("goKey").value = savedKey;
    $("rememberKey").checked = true;
    state.setup.apiKey = savedKey;
  }
  const savedModel = localStorage.getItem("checker.model");
  if (savedModel) state.setup.model = savedModel;
  if ($("workerUrl").value) state.setup.workerUrl = $("workerUrl").value;
  setModelOptions(MODELS_BUILTIN);
  if (savedModel && MODELS_BUILTIN.includes(savedModel)) $("modelSel").value = savedModel;
  loadModels();
  $("saveSetup").addEventListener("click", () => {
    state.setup.apiKey = $("goKey").value;
    state.setup.workerUrl = $("workerUrl").value.trim() || WORKER_DEFAULT;
    state.setup.model = $("modelSel").value;
    if ($("rememberKey").checked) {
      localStorage.setItem("checker.goKey", state.setup.apiKey);
    } else {
      localStorage.removeItem("checker.goKey");
    }
    localStorage.setItem("checker.model", state.setup.model);
    loadModels();
  });
  $("clearKey").addEventListener("click", () => {
    $("goKey").value = "";
    $("rememberKey").checked = false;
    state.setup.apiKey = "";
    localStorage.removeItem("checker.goKey");
  });
  $("modelSel").addEventListener("change", () => {
    state.setup.model = $("modelSel").value;
    localStorage.setItem("checker.model", state.setup.model);
  });
}

/* ---- 2. Roster ---- */

async function handleRosterFiles(files) {
  const lists = [];
  let parsed = 0;
  for (const f of files) {
    const buf = await f.arrayBuffer();
    const sheets = parseRosterFile(globalThis.XLSX, buf);
    for (const s of sheets) {
      const rows = parseRosterSheet(s.rows, f.name);
      parsed += rows.length;
      lists.push(rows);
    }
  }
  state.roster = mergeRosters(lists);
  const skipped = parsed - state.roster.length;
  $("rosterCount").textContent =
    `${state.roster.length} students loaded, ${skipped} duplicates skipped.`;
}

function initRoster() {
  $("rosterFiles").addEventListener("change", (e) => handleRosterFiles([...e.target.files]));
  $("rosterDrop").addEventListener("dragover", (e) => e.preventDefault());
  $("rosterDrop").addEventListener("drop", (e) => {
    e.preventDefault();
    handleRosterFiles([...e.dataTransfer.files]);
  });
}

/* ---- 3. Assignment + 4. Non-AI ---- */

function readFileText(f) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });
}

async function runAssignment() {
  const pemFile = $("pemFile").files[0];
  const keyFile = $("keyFile").files[0];
  if (!pemFile || !keyFile) {
    $("quarantine").textContent = "Upload keys.pem and the -key.json file first.";
    return;
  }
  const pem = await readFileText(pemFile);
  const keyJson = JSON.parse(await readFileText(keyFile));
  const tag = tagFromOutput(keyJson.output, keyFile.name);
  const keyItems = keyJson.items || [];

  const subs = [];
  const quarantine = [];
  for (const f of pendingSubFiles) {
    try {
      const parsed = JSON.parse(await readFileText(f));
      const sub = await decryptSubmission(pem, parsed);
      sub.file = f.name;
      subs.push(sub);
    } catch {
      quarantine.push(f.name);
    }
  }
  const { matched, unmatched, missing } = joinSubmissions(state.roster, subs);
  const saNs = keyItems.filter((k) => k.type === "sa").map((k) => k.n);
  const assignment = {
    tag, keyItems, saNs, matched, unmatched: unmatched.map((s) => s.file || "unknown"),
    missing, quarantine, scored: new Map(), reviews: [], saDone: false,
  };
  for (const { roster, sub } of matched) {
    const r = scoreNonAI(keyItems, sub.answers);
    const key = studentKey(roster);
    const sa = new Map();
    for (const item of r.saItems) sa.set(item.n, { ai: null, reason: "", final: null });
    assignment.scored.set(key, {
      name: roster.name, id: roster.id, mc: r.mc, tf: r.tf, idScore: r.id,
      totalNonAI: r.totalNonAI, sa,
    });
  }
  state.assignments.push(assignment);
  state.unmatchedAll = state.assignments.flatMap((a) => a.unmatched.map((f) => ({ tag: a.tag, file: f })));
  state.missingAll = state.assignments.flatMap((a) => a.missing);
  $("quarantine").textContent = quarantine.length
    ? `Quarantined (decrypt failed, skipped): ${quarantine.join(", ")}`
    : `${subs.length} submissions decrypted, 0 quarantined.`;
  renderResults();
  $("addAssignment").disabled = false;
  maybeUnlockSA();
}

function renderResults() {
  const el = $("resultsTable");
  if (state.assignments.length === 0) {
    el.innerHTML = "<p class='note'>No results yet.</p>";
    return;
  }
  let html = "";
  for (const a of state.assignments) {
    html += `<h3>${a.tag}</h3><table><tr><th>Name</th><th>MC</th><th>TF</th><th>ID</th><th>Total (non-AI)</th></tr>`;
    for (const [, s] of a.scored) {
      html += `<tr><td>${s.name}</td><td>${s.mc}</td><td>${s.tf}</td><td>${s.idScore}</td><td>${s.totalNonAI}</td></tr>`;
    }
    html += "</table>";
    if (a.unmatched.length) html += `<p class='note'>Unmatched: ${a.unmatched.join(", ")}</p>`;
    if (a.missing.length) html += `<p class='note'>Missing: ${a.missing.map((m) => m.name).join(", ")}</p>`;
  }
  el.innerHTML = html;
}

function initAssignment() {
  $("subFiles").addEventListener("change", (e) => {
    pendingSubFiles = [...e.target.files];
  });
  $("subDrop").addEventListener("dragover", (e) => e.preventDefault());
  $("subDrop").addEventListener("drop", (e) => {
    e.preventDefault();
    pendingSubFiles = [...e.dataTransfer.files];
  });
  $("runNonAI").addEventListener("click", runAssignment);
  $("addAssignment").addEventListener("click", () => {
    $("pemFile").value = "";
    $("keyFile").value = "";
    $("subFiles").value = "";
    pendingSubFiles = [];
    $("quarantine").textContent = "";
  });
}

/* ---- 5. SA ---- */

function allScored() {
  return state.assignments.length > 0 && state.assignments.every((a) => a.scored && a.scored.size > 0);
}

function maybeUnlockSA() {
  if (!allScored()) return;
  $("saQueue").textContent = "Non-AI complete — grading SA…";
  $("lockSA").disabled = false;
  runSA();
}

async function runSA() {
  const { workerUrl, apiKey, model } = state.setup;
  for (const a of state.assignments) {
    if (a.saDone) continue;
    for (const n of a.saNs) {
      const keyItem = a.keyItems.find((k) => k.n === n) || {};
      const answersByStudent = [];
      for (const { roster, sub } of a.matched) {
        const ans = (sub.answers || []).find((x) => x.q === n);
        answersByStudent.push({
          ref: `${a.tag}:Q${n}:${studentKey(roster)}`,
          text: (ans && typeof ans.answer === "string") ? ans.answer : "",
        });
      }
      // Key file snake_case max_points maps to Worker camelCase maxPoints at this boundary.
      const saMeta = {
        question: keyItem.prompt || "",
        rubric: keyItem.rubric || "",
        maxPoints: keyItem.max_points,
      };
      const onProgress = (done, total) => {
        $("saQueue").textContent = `${a.tag} Q${n}: ${done}/${total} graded…`;
      };
      const out = await gradeAll(workerUrl, apiKey, model, saMeta, answersByStudent, onProgress);
      for (const [ref, { score, reason }] of out) {
        const skey = ref.split(":").pop();
        const row = a.scored.get(skey);
        if (row && row.sa.has(n)) row.sa.set(n, { ai: score, reason, final: score });
        a.reviews.push({ saN: n, ref, ai: score, reason, final: score });
      }
    }
    a.saDone = true;
  }
  $("saQueue").textContent = "SA grading complete — review scores, then Lock SA.";
  renderSA();
}

function renderSA() {
  const el = $("saTable");
  let html = "";
  for (const a of state.assignments) {
    for (const n of a.saNs) {
      html += `<h3>${a.tag} · SA Q${n}</h3><table><tr><th>Student</th><th>AI score</th><th>Reason</th><th>Your score</th></tr>`;
      for (const r of a.reviews.filter((x) => x.saN === n && x.ref.startsWith(`${a.tag}:Q${n}:`))) {
        const skey = r.ref.split(":").pop();
        const row = a.scored.get(skey);
        const name = row ? row.name : skey;
        html += `<tr><td>${name}</td><td>${r.ai}</td><td>${r.reason}</td>` +
          `<td><input type="number" data-tag="${a.tag}" data-san="${n}" data-ref="${r.ref}" value="${r.final ?? ""}"></td></tr>`;
      }
      html += "</table>";
    }
  }
  el.innerHTML = html || "<p class='note'>No SA results yet.</p>";
  el.querySelectorAll("input[type=number]").forEach((inp) => {
    inp.disabled = saLocked;
    inp.addEventListener("change", () => {
      const a = state.assignments.find((x) => x.tag === inp.dataset.tag);
      const rev = a.reviews.find((x) => x.ref === inp.dataset.ref);
      rev.final = inp.value === "" ? null : Number(inp.value);
      const row = a.scored.get(rev.ref.split(":").pop());
      if (row) row.sa.get(Number(inp.dataset.san)).final = rev.final;
    });
  });
}

function initSA() {
  $("lockSA").addEventListener("click", () => {
    saLocked = true;
    $("lockSA").disabled = true;
    $("saQueue").textContent = "SA locked.";
    renderSA();
  });
}

/* ---- 6. Export ---- */

function initExport() {
  $("downloadXlsx").addEventListener("click", () => {
    const assignments = state.assignments.map((a) => {
      const results = new Map();
      for (const [key, s] of a.scored) {
        const saScores = new Map();
        let total = s.totalNonAI;
        for (const n of a.saNs) {
          const fin = s.sa.get(n) ? s.sa.get(n).final : null;
          // Missing SA finals count as blank and are excluded from the total.
          saScores.set(n, fin == null ? "" : fin);
          if (fin != null && fin !== "") total += Number(fin);
        }
        results.set(key, {
          name: s.name, id: s.id, mc: s.mc, tf: s.tf, idScore: s.idScore, saScores, total,
        });
      }
      return { tag: a.tag, saNs: a.saNs, results, unmatched: a.unmatched, missing: a.missing, reviews: a.reviews };
    });
    const data = buildWorkbookData({ roster: state.roster, assignments });
    downloadWorkbook(globalThis.XLSX, data, "grades.xlsx");
  });
}

initSetup();
initRoster();
initAssignment();
initSA();
initExport();
