import { parseRosterFile, downloadWorkbook } from "./lib/sheets-io.js";
import { parseRosterSheet, mergeRosters, joinSubmissions } from "./lib/roster.js";
import { decryptSubmission, pemFromKeyJson } from "./lib/decrypt.js";
import { scoreNonAI, scoreDag } from "./lib/score.js";
import { gradeAll } from "./lib/sa.js";
import { buildWorkbookData } from "./lib/export-book.js";
import { weekdayInTz } from "./lib/format.js";

const MODELS_BUILTIN = [
  "muse-spark-1.3-contributor",
  "glm-5.3-flash",
  "deepseek-v4.1-flash",
  "qwen3.8-flash",
];
const WORKER_URL = "https://checker-grade.aclc-obero.workers.dev";

const state = {
  setup: { workerUrl: WORKER_URL, apiKey: "", model: MODELS_BUILTIN[0] },
  roster: [],
  assignments: [],
  unmatchedAll: [],
  missingAll: [],
};

let pendingSubFiles = [];

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

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

/* ---- step visibility: only the current step's UI is shown ---- */

const stepCtl = {
  current: 1,
  unlocked: 1,
  goto(n) {
    if (n < 1 || n > 5) return;
    this.current = n;
    for (let i = 1; i <= 5; i++) {
      const sec = $(`s${i}`);
      if (sec) sec.classList.toggle("on", i === n);
      const li = $("stepper").children[i - 1];
      if (li) {
        li.classList.toggle("on", i === n);
        li.classList.toggle("done", i < this.unlocked);
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  },
  unlock(n) {
    if (n > this.unlocked) this.unlocked = n;
    this.goto(n);
  },
};

function initStepper() {
  [...$("stepper").children].forEach((li, i) => {
    li.addEventListener("click", () => {
      if (i + 1 <= stepCtl.unlocked) stepCtl.goto(i + 1);
    });
  });
  stepCtl.goto(1);
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

function updateSetupStatus() {
  const el = $("aiSetupStatus");
  if (!el) return;
  const hasKey = Boolean(state.setup.apiKey);
  el.textContent = `${state.setup.model} · key ${hasKey ? "saved" : "missing"}`;
}

function setSetupModal(open) {
  const modal = $("aiSetupModal");
  if (!modal) return;
  modal.classList.toggle("open", Boolean(open));
  if (open) {
    const keyInput = $("goKey");
    if (keyInput) keyInput.focus();
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
  setModelOptions(MODELS_BUILTIN);
  if (savedModel && MODELS_BUILTIN.includes(savedModel)) $("modelSel").value = savedModel;
  loadModels();
  updateSetupStatus();
  $("aiSetupBtn").addEventListener("click", () => setSetupModal(true));
  $("aiSetupClose").addEventListener("click", () => setSetupModal(false));
  $("aiSetupModal").addEventListener("click", (e) => {
    if (e.target === $("aiSetupModal")) setSetupModal(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setSetupModal(false);
  });
  $("saveSetup").addEventListener("click", () => {
    state.setup.apiKey = $("goKey").value;
    state.setup.model = $("modelSel").value;
    if ($("rememberKey").checked) {
      localStorage.setItem("checker.goKey", state.setup.apiKey);
    } else {
      localStorage.removeItem("checker.goKey");
    }
    localStorage.setItem("checker.model", state.setup.model);
    loadModels();
    updateSetupStatus();
    setSetupModal(false);
  });
  $("clearKey").addEventListener("click", () => {
    $("goKey").value = "";
    $("rememberKey").checked = false;
    state.setup.apiKey = "";
    localStorage.removeItem("checker.goKey");
    updateSetupStatus();
  });
  $("modelSel").addEventListener("change", () => {
    state.setup.model = $("modelSel").value;
    localStorage.setItem("checker.model", state.setup.model);
    updateSetupStatus();
  });
}

/* ---- 2. Roster ---- */

async function handleRosterFiles(files) {
  if (!globalThis.XLSX) {
    $("rosterCount").textContent =
      "Spreadsheet library not loaded — reload this page, then retry.";
    return;
  }
  try {
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
  } catch (e) {
    $("rosterCount").textContent = `Roster load failed: ${(e && e.message) || e}`;
  }
}

function initRoster() {
  $("rosterFiles").addEventListener("change", (e) => handleRosterFiles([...e.target.files]).catch((err) => {
    $("rosterCount").textContent = `Roster load failed: ${(err && err.message) || err}`;
  }));
  $("rosterDrop").addEventListener("dragover", (e) => e.preventDefault());
  $("rosterDrop").addEventListener("drop", (e) => {
    e.preventDefault();
    handleRosterFiles([...e.dataTransfer.files]).catch((err) => {
      $("rosterCount").textContent = `Roster load failed: ${(err && err.message) || err}`;
    });
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
  const keyFile = $("keyFile").files[0];
  if (!keyFile) {
    $("quarantine").textContent = "Upload the -key.json file first.";
    return false;
  }
  const keyJson = JSON.parse(await readFileText(keyFile));
  let pem = null;
  try {
    pem = pemFromKeyJson(keyJson);
  } catch {
     $("quarantine").textContent =
       "This -key.json has no embedded teacher key — rebuild the notebook to get the single-file key.";
    return false;
  }
  const tag = tagFromOutput(keyJson.output, keyFile.name);
  const keyItems = keyJson.items || [];
  const isDag = keyJson.mode === "dag";
  const dagKey = isDag ? keyJson.dag : null;

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
  const saNs = isDag ? [] : keyItems.filter((k) => k.type === "sa").map((k) => k.n);
  const assignment = {
    tag, keyItems, saNs, matched, unmatched: unmatched.map((s) => s.file || "unknown"),
    unmatchedSubs: unmatched,
    missing, quarantine, scored: new Map(), unmatchedScored: new Map(), reviews: [], saDone: false,
    tokens: { input: 0, output: 0, total: 0 },
    mode: isDag ? "dag" : "flat", dagKey,
  };
  const win = keyJson.window && typeof keyJson.window === "object" ? keyJson.window : {};
  const windowDay = win.day || "wednesday";
  const windowTz = win.tz || "Asia/Manila";
  const flagOutOfWindow = (ref, sub) => {
    const dow = weekdayInTz(sub && sub.submitted_at, windowTz);
    if (dow && dow !== windowDay) {
      assignment.reviews.push({ saN: "time", ref, ai: "",
        reason: `submitted outside window (getting ${dow})`, final: "" });
    }
  };
  for (const { roster, sub } of matched) {
    const key = studentKey(roster);
    flagOutOfWindow(key, sub);
    if (isDag) {
      const r = scoreDag(dagKey, sub.path);
      assignment.scored.set(key, { name: roster.name, id: roster.id, dag: r, submittedAt: sub.submitted_at || "" });
      continue;
    }
    const r = scoreNonAI(keyItems, sub.answers);
    const sa = new Map();
    for (const item of r.saItems) sa.set(item.n, { ai: null, reason: "", final: null });
    assignment.scored.set(key, {
      name: roster.name, id: roster.id, mc: r.mc, tf: r.tf, idScore: r.id,
      totalNonAI: r.totalNonAI, sa, submittedAt: sub.submitted_at || "",
    });
  }
  // Unmatched submissions are still fully checked (non-AI + SA) and shown
  // in the unmatched section — they just aren't linked to a roster row.
  for (const sub of unmatched) {
    const st = (sub && sub.student) || {};
    const stName = st.name || [st.last, st.first].filter(Boolean).join(", ");
    const claimed = [stName, st.id].filter(Boolean).join(" / ") || sub.file || "unknown";
    const key = `~unmatched:${sub.file || claimed}`;
    flagOutOfWindow(key, sub);
    if (isDag) {
      const r = scoreDag(dagKey, sub.path);
      assignment.unmatchedScored.set(key, {
        file: sub.file || "unknown", claimed,
        name: stName || claimed, id: st.id || "",
        dag: r, answers: sub.answers, submittedAt: sub.submitted_at || "",
      });
      continue;
    }
    const r = scoreNonAI(keyItems, sub.answers);
    const sa = new Map();
    for (const item of r.saItems) sa.set(item.n, { ai: null, reason: "", final: null });
    assignment.unmatchedScored.set(key, {
      file: sub.file || "unknown", claimed,
      name: st.name || claimed, id: st.id || "",
      mc: r.mc, tf: r.tf, idScore: r.id,
      totalNonAI: r.totalNonAI, sa, answers: sub.answers,
      submittedAt: sub.submitted_at || "",
    });
  }
  pendingSubFiles = [];
  $("subFiles").value = "";
  state.assignments.push(assignment);
  state.unmatchedAll = state.assignments.flatMap((a) => a.unmatched.map((f) => ({ tag: a.tag, file: f })));
  state.missingAll = state.assignments.flatMap((a) => a.missing);
  $("quarantine").textContent = quarantine.length
    ? `Quarantined (decrypt failed, skipped): ${quarantine.join(", ")}`
    : `${subs.length} submissions decrypted, 0 quarantined.`;
  renderResults();
  renderSidebar();
  // Add-after-SA gate: next assignment unlocks only after this one's SA run finishes.
  $("addAssignment").disabled = true;
  updateSAGate();
  return true;
}

function anchorId(tag) {
  return `assign-${String(tag).replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function fmtTokens(n) {
  const v = Number(n) || 0;
  if (v < 1000) return `${v}`;
  if (v < 1_000_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(v / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
}

function tokenLine(a) {
  const t = (a && a.tokens) || { input: 0, output: 0, total: 0 };
  if (!t.total) return "tokens: —";
  return `tokens: ${fmtTokens(t.total)} (in ${fmtTokens(t.input)} · out ${fmtTokens(t.output)})`;
}

function renderSidebar() {
  const ul = $("assignList");
  if (!ul) return;
  if (state.assignments.length === 0) {
    ul.innerHTML = `<li class="note">No assignments yet.</li>`;
    return;
  }
  ul.innerHTML = state.assignments.map((a) => {
    const matchedN = a.scored ? a.scored.size : 0;
    const unmatchedN = a.unmatchedScored ? a.unmatchedScored.size : 0;
    const status = a.saDone ? "SA done" : (state.saRunning ? "SA grading…" : "Non-AI done");
    const pill = a.saDone ? "pass" : (state.saRunning ? "pend" : "pend");
    return `<li><a href="#${anchorId(a.tag)}">${escapeHtml(a.tag)}</a> ` +
      `<span class="pill ${pill}">${status}</span>` +
      `<div class="meta">${matchedN} matched · ${unmatchedN} unmatched · ` +
      `${(a.missing || []).length} missing · SA Qs: ${a.saNs.length ? a.saNs.join(", ") : "—"}</div>` +
      `<div class="meta">${escapeHtml(tokenLine(a))}</div></li>`;
  }).join("");
}

function dagStepLines(d) {
  return ((d && d.steps) || []).map((st) =>
    `${st.node} — ${st.label}: ${st.text} (+${st.points})`);
}

function dagPathTitle(d) {
  const lines = dagStepLines(d);
  return lines.length ? ` title="${escapeHtml(lines.join("\n"))}"` : "";
}

function dagDetailRow(d) {
  const lines = dagStepLines(d);
  if (!lines.length) return "";
  const items = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("");
  return `<tr class="dag-detail"><td colspan="6">` +
    `<details><summary>Path detail</summary><ol>${items}</ol></details></td></tr>`;
}

function renderResults() {
  const el = $("resultsTable");
  if (state.assignments.length === 0) {
    el.innerHTML = "<p class='note'>No results yet.</p>";
    return;
  }
  let html = "";
  for (const a of state.assignments) {
    if (a.mode === "dag") {
      html += `<h3 id="${anchorId(a.tag)}">${escapeHtml(a.tag)}</h3><table><tr><th>Name</th><th>Path</th><th>Score</th><th>Max</th><th>%</th><th>Match</th></tr>`;
      for (const [, s] of a.scored) {
        const d = s.dag;
        if (d.mismatch) {
          html += `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(d.ribbon || "")}</td>` +
            `<td colspan="3">path/key mismatch: ${escapeHtml(d.mismatch)}</td><td>ERR</td></tr>`;
        } else {
          html += `<tr><td>${escapeHtml(s.name)}</td><td${dagPathTitle(d)}>${escapeHtml(d.ribbon)}</td>` +
            `<td>${d.score}</td><td>${d.maxScore}</td>` +
            `<td>${Math.round(d.pct * 100)}%</td>` +
            `<td>${d.pathMatch ? "gold" : `off@${d.divergeAt}`}</td></tr>`;
        }
        html += dagDetailRow(d);
      }
      html += "</table>";
      if (a.unmatchedScored && a.unmatchedScored.size) {
        html += `<h3>${escapeHtml(a.tag)} · Unmatched</h3><table><tr><th>File</th><th>Path</th><th>Score</th><th>Max</th><th>%</th><th>Match</th></tr>`;
        for (const [, s] of a.unmatchedScored) {
          const d = s.dag;
          html += `<tr><td>${escapeHtml(s.file)}</td><td${dagPathTitle(d)}>${escapeHtml(d.ribbon)}</td>` +
            (d.mismatch ? `<td colspan="3">ERR ${escapeHtml(d.mismatch)}</td><td>ERR</td>`
              : `<td>${d.score}</td><td>${d.maxScore}</td><td>${Math.round(d.pct * 100)}%</td><td>${d.pathMatch ? "gold" : `off@${d.divergeAt}`}</td>`) +
            `</tr>`;
          html += dagDetailRow(d);
        }
        html += "</table>";
      }
      if (a.missing.length) html += `<p class='note'>Missing: ${a.missing.map((m) => escapeHtml(m.name)).join(", ")}</p>`;
      continue;
    }
    html += `<h3 id="${anchorId(a.tag)}">${escapeHtml(a.tag)}</h3><table><tr><th>Name</th><th>MC</th><th>TF</th><th>ID</th><th>Total (non-AI)</th></tr>`;
    for (const [, s] of a.scored) {
      html += `<tr><td>${escapeHtml(s.name)}</td><td>${s.mc}</td><td>${s.tf}</td><td>${s.idScore}</td><td>${s.totalNonAI}</td></tr>`;
    }
    html += "</table>";
    if (a.unmatchedScored && a.unmatchedScored.size) {
      html += `<h3>${escapeHtml(a.tag)} · Unmatched — checked, not linked to roster</h3><table><tr><th>File / claimed identity</th><th>MC</th><th>TF</th><th>ID</th><th>Total (non-AI)</th></tr>`;
      for (const [, s] of a.unmatchedScored) {
        html += `<tr><td>${escapeHtml(s.file)}${s.claimed && s.claimed !== s.file ? ` (${escapeHtml(s.claimed)})` : ""}</td><td>${s.mc}</td><td>${s.tf}</td><td>${s.idScore}</td><td>${s.totalNonAI}</td></tr>`;
      }
      html += "</table>";
    } else if (a.unmatched.length) {
      html += `<p class='note'>Unmatched: ${a.unmatched.map(escapeHtml).join(", ")}</p>`;
    }
    if (a.missing.length) html += `<p class='note'>Missing: ${a.missing.map((m) => escapeHtml(m.name)).join(", ")}</p>`;
  }
  el.innerHTML = html;
  renderSidebar();
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
  $("rosterNext").addEventListener("click", () => stepCtl.unlock(2));
  $("resultsNext").addEventListener("click", () => {
    const hasSA = state.assignments.some((a) => a.saNs.length > 0);
    stepCtl.unlock(hasSA ? 4 : 5);
  });
  $("backTo2").addEventListener("click", () => stepCtl.goto(2));
  $("backTo3").addEventListener("click", () => stepCtl.goto(3));
  $("backTo4").addEventListener("click", () => stepCtl.goto(4));
  $("saNext").addEventListener("click", () => stepCtl.unlock(5));
  $("runNonAI").addEventListener("click", () => runAssignment().then((ok) => {
    if (ok) stepCtl.unlock(3);
  }));
  $("addAssignment").addEventListener("click", () => {
    $("keyFile").value = "";
    $("subFiles").value = "";
    pendingSubFiles = [];
    $("quarantine").textContent = "";
    stepCtl.goto(2);
  });
}

/* ---- 5. SA (manual, parallel) ---- */

state.saRunning = false;

// Per-assignment readiness: graded rows exist (matched or unmatched).
// Old global gate waited for EVERY assignment with matched rows only,
// so one pending/fully-unmatched assignment blocked all SA.
function assignmentReady(a) {
  const m = a.scored ? a.scored.size : 0;
  const u = a.unmatchedScored ? a.unmatchedScored.size : 0;
  return (m + u) > 0;
}

function pendingSA() {
  return state.assignments.filter((a) => !a.saDone && assignmentReady(a) && a.saNs.length > 0);
}

function setSAButtons() {
  const runBtn = $("runSA");
  const addBtn = $("addAssignment");
  const dlBtn = $("downloadXlsx");
  if (runBtn) runBtn.disabled = state.saRunning || pendingSA().length === 0;
  // Add-after-SA gate: while grading runs, continue stays disabled;
  // after a clean run with no pending SA left, adding unlocks.
  if (addBtn) addBtn.disabled = state.saRunning || (state.assignments.length > 0 && pendingSA().length > 0);
  if (dlBtn) dlBtn.disabled = state.saRunning;
}

function updateSAGate() {
  setSAButtons();
  const q = $("saQueue");
  if (!q) return;
  if (state.saRunning) return; // progress text owns the label during a run
  const p = pendingSA();
  if (state.assignments.length === 0) q.textContent = "No SA yet — run a non-AI check first.";
  else if (p.length > 0) q.textContent = `Non-AI complete — press Run SA check (${p.length} assignment${p.length > 1 ? "s" : ""} ready).`;
  else if (state.assignments.every((a) => a.saDone)) q.textContent = "SA complete — review scores, or add another assignment.";
  else q.textContent = "Nothing ready for SA (no matched or unmatched rows yet).";
}

function setProgress(done, total) {
  const bar = $("saProgress");
  if (!bar) return;
  if (!total || total <= 0) {
    bar.style.display = "none";
    bar.value = 0;
    return;
  }
  bar.style.display = "block";
  bar.max = total;
  bar.value = done;
}

function answersFor(a, n) {
  const out = [];
  for (const { roster, sub } of a.matched) {
    const ans = (sub.answers || []).find((x) => x.q === n);
    out.push({
      ref: `${a.tag}:Q${n}:${studentKey(roster)}`,
      text: (ans && typeof ans.answer === "string") ? ans.answer : "",
    });
  }
  if (a.unmatchedScored) {
    for (const [ukey, urow] of a.unmatchedScored) {
      const ans = (urow.answers || []).find((x) => x.q === n);
      out.push({
        ref: `${a.tag}:Q${n}:${ukey}`,
        text: (ans && typeof ans.answer === "string") ? ans.answer : "",
      });
    }
  }
  return out;
}

function applySAGrades(a, n, out) {
  for (const [ref, { score, reason }] of out) {
    const skey = ref.split(":").pop();
    const row = a.scored.get(skey);
    if (row && row.sa.has(n)) {
      row.sa.set(n, { ai: score, reason, final: score });
    } else if (a.unmatchedScored) {
      // skey for unmatched is the full "~unmatched:file" key, but ref
      // splitting on ":" breaks filenames containing ":". Recover by
      // matching the ref suffix against known unmatched keys.
      const ukey = [...a.unmatchedScored.keys()].find((k) => ref.endsWith(`:${k}`)) || skey;
      const urow = a.unmatchedScored.get(ukey);
      if (urow && urow.sa.has(n)) urow.sa.set(n, { ai: score, reason, final: score });
    }
    a.reviews.push({ saN: n, ref, ai: score, reason, final: score });
  }
}

async function runSA() {
  if (state.saRunning) return;
  const tasks = [];
  for (const a of pendingSA()) {
    for (const n of a.saNs) tasks.push({ a, n });
  }
  if (tasks.length === 0) {
    updateSAGate();
    return;
  }
  const { workerUrl, apiKey, model } = state.setup;
  state.saRunning = true;
  setSAButtons();
  renderSidebar();
  // Aggregate progress across all parallel SA questions.
  const totals = new Map();
  for (const t of tasks) {
    totals.set(`${t.a.tag}:Q${t.n}`, { done: 0, total: answersFor(t.a, t.n).length });
  }
  const repaint = (label) => {
    let done = 0;
    let total = 0;
    for (const { done: d, total: tt } of totals.values()) {
      done += d;
      total += tt;
    }
    setProgress(done, total);
    if (label) $("saQueue").textContent = `${label} — ${done}/${total} graded…`;
  };
  repaint(`Grading ${tasks.length} SA question${tasks.length > 1 ? "s" : ""} in parallel`);
  try {
    await Promise.all(tasks.map(async ({ a, n }) => {
      const keyItem = a.keyItems.find((k) => k.n === n) || {};
      const answersByStudent = answersFor(a, n);
      // Key file snake_case max_points maps to Worker camelCase maxPoints at this boundary.
      const saMeta = {
        question: keyItem.prompt || "",
        rubric: keyItem.rubric || "",
        maxPoints: keyItem.max_points,
      };
      const key = `${a.tag}:Q${n}`;
      const onProgress = (done, total) => {
        totals.set(key, { done, total });
        repaint(`${a.tag} Q${n}`);
      };
      const { grades, usage } = await gradeAll(workerUrl, apiKey, model, saMeta, answersByStudent, onProgress);
      applySAGrades(a, n, grades);
      a.tokens.input += usage.input || 0;
      a.tokens.output += usage.output || 0;
      a.tokens.total += usage.total || 0;
      renderSidebar();
      const cur = totals.get(key) || { done: 0, total: answersByStudent.length };
      totals.set(key, { done: cur.total, total: cur.total });
      repaint(`${a.tag} Q${n}`);
    }));
    for (const a of state.assignments) {
      if (!a.saDone && assignmentReady(a)) a.saDone = true;
    }
    $("saQueue").textContent = "SA grading complete — review scores, or add another assignment.";
    renderSA();
    renderSidebar();
  } catch (e) {
    $("saQueue").textContent =
      `SA grading failed: ${(e && e.message) || e}. Check key/Worker/network, then re-run.`;
  } finally {
    state.saRunning = false;
    setSAButtons();
    updateSAGate();
    renderSidebar();
    if (pendingSA().length === 0) setProgress(0, 0);
  }
}

function renderSA() {
  const el = $("saTable");
  let html = "";
  for (const a of state.assignments) {
    for (const n of a.saNs) {
      html += `<h3>${escapeHtml(a.tag)} · SA Q${n}</h3><table><tr><th>Student</th><th>AI score</th><th>Reason</th><th>Your score</th></tr>`;
      for (const r of a.reviews.filter((x) => x.saN === n && x.ref.startsWith(`${a.tag}:Q${n}:`))) {
        const ukey = a.unmatchedScored
          ? [...a.unmatchedScored.keys()].find((k) => r.ref.endsWith(`:${k}`))
          : null;
        const skey = ukey || r.ref.split(":").pop();
        const row = a.scored.get(skey) || (ukey && a.unmatchedScored.get(ukey));
        const name = row ? (row.file ? `${row.file} (${row.claimed})` : row.name) : skey;
        html += `<tr><td>${escapeHtml(name)}</td><td>${r.ai}</td><td>${escapeHtml(r.reason)}</td>` +
          `<td><input type="number" data-tag="${escapeHtml(a.tag)}" data-san="${n}" data-ref="${escapeHtml(r.ref)}" value="${r.final ?? ""}"></td></tr>`;
      }
      html += "</table>";
    }
  }
  el.innerHTML = html || "<p class='note'>No SA results yet.</p>";
  el.querySelectorAll("input[type=number]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const a = state.assignments.find((x) => x.tag === inp.dataset.tag);
      if (!a) return;
      const rev = a.reviews.find((x) => x.ref === inp.dataset.ref);
      if (!rev) return;
      rev.final = inp.value === "" ? null : Number(inp.value);
      const ukey = a.unmatchedScored
        ? [...a.unmatchedScored.keys()].find((k) => rev.ref.endsWith(`:${k}`))
        : null;
      const skey = ukey || rev.ref.split(":").pop();
      const row = a.scored.get(skey) || (ukey && a.unmatchedScored.get(ukey));
      if (row) row.sa.get(Number(inp.dataset.san)).final = rev.final;
    });
  });
  renderSidebar();
}

function initSA() {
  $("runSA").addEventListener("click", () => {
    runSA();
  });
}

/* ---- 6. Export ---- */

function initExport() {
  $("downloadXlsx").addEventListener("click", () => {
    if (!globalThis.XLSX) {
      alert("Spreadsheet library not loaded — reload this page, then retry.");
      return;
    }
    try {
      const assignments = state.assignments.map((a) => {
        const results = new Map();
        const unmatchedResults = new Map();
        if (a.mode === "dag") {
          for (const [key, s] of a.scored) {
            const d = s.dag;
            results.set(key, {
              name: s.name, id: s.id,
              dagScore: d.mismatch ? "" : d.score,
              dagMax: d.maxScore,
              dagPct: d.mismatch ? "" : d.pct,
              total: d.mismatch ? "" : d.score,
              submittedAt: s.submittedAt || "",
            });
          }
          if (a.unmatchedScored) {
            for (const [key, s] of a.unmatchedScored) {
              const d = s.dag;
              unmatchedResults.set(key, {
                name: `${s.file} (${s.claimed})`, id: s.id || "",
                dagScore: d.mismatch ? "" : d.score,
                dagMax: d.maxScore,
                dagPct: d.mismatch ? "" : d.pct,
                total: d.mismatch ? "" : d.score,
                submittedAt: s.submittedAt || "",
              });
            }
          }
          const reviews = [...(a.reviews || [])];
          for (const [key, s] of a.scored) {
            if (s.dag && !s.dag.mismatch && !s.dag.pathMatch) {
              reviews.push({ saN: "path", ref: key, ai: "",
                reason: `diverged at step ${s.dag.divergeAt}`, final: "" });
            }
          }
          return { tag: a.tag, mode: "dag", saNs: [], results, unmatchedResults,
            unmatched: a.unmatched, missing: a.missing, reviews };
        }
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
            submittedAt: s.submittedAt || "",
          });
        }
        const unmatchedResults2 = unmatchedResults;
        if (a.unmatchedScored) {
          for (const [key, s] of a.unmatchedScored) {
            const saScores = new Map();
            let total = s.totalNonAI;
            for (const n of a.saNs) {
              const fin = s.sa.get(n) ? s.sa.get(n).final : null;
              saScores.set(n, fin == null ? "" : fin);
              if (fin != null && fin !== "") total += Number(fin);
            }
            unmatchedResults2.set(key, {
              name: `${s.file} (${s.claimed})`, id: s.id,
              mc: s.mc, tf: s.tf, idScore: s.idScore, saScores, total,
              submittedAt: s.submittedAt || "",
            });
          }
        }
        return { tag: a.tag, mode: a.mode || "flat", saNs: a.saNs, results, unmatchedResults: unmatchedResults2, unmatched: a.unmatched, missing: a.missing, reviews: a.reviews };
      });
      const data = buildWorkbookData({ roster: state.roster, assignments });
      downloadWorkbook(globalThis.XLSX, data, "grades.xlsx");
    } catch (e) {
      alert(`Export failed: ${(e && e.message) || e}`);
    }
  });
}

initSetup();
initRoster();
initAssignment();
initSA();
initExport();
initStepper();
