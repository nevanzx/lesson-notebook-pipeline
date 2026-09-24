import { parseRosterFile, downloadWorkbook } from "./lib/sheets-io.js";
import { parseRosterSheet, mergeRosters, joinSubmissions } from "./lib/roster.js";
import { decryptSubmission, pemFromKeyJson } from "./lib/decrypt.js";
import { scoreNonAI, scoreDag } from "./lib/score.js";
import { gradeAll } from "./lib/sa.js";
import { buildWorkbookData } from "./lib/export-book.js";

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
    if (n < 1 || n > 6) return;
    this.current = n;
    for (let i = 1; i <= 6; i++) {
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
    stepCtl.unlock(2);
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
  if (!globalThis.XLSX) {
    $("rosterCount").textContent =
      "Spreadsheet library (SheetJS) not loaded — check network/ad-blocker and reload this page, then retry.";
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
    tag, keyItems, saNs, mode: isDag ? "dag" : "flat", dagKey,
    matched, unmatched: unmatched.map((s) => s.file || "unknown"),
    unmatchedSubs: unmatched,
    missing, quarantine, scored: new Map(), unmatchedScored: new Map(), reviews: [], saDone: false, locked: false,
  };
  for (const { roster, sub } of matched) {
    const key = studentKey(roster);
    if (isDag) {
      const r = scoreDag(dagKey, sub.path);
      assignment.scored.set(key, {
        name: roster.name, id: roster.id, dag: r,
      });
      continue;
    }
    const r = scoreNonAI(keyItems, sub.answers);
    const sa = new Map();
    for (const item of r.saItems) sa.set(item.n, { ai: null, reason: "", final: null });
    assignment.scored.set(key, {
      name: roster.name, id: roster.id, mc: r.mc, tf: r.tf, idScore: r.id,
      totalNonAI: r.totalNonAI, sa,
    });
  }
  // Unmatched submissions are still fully checked (non-AI + SA) and shown
  // in the unmatched section — they just aren't linked to a roster row.
  for (const sub of unmatched) {
    const st = (sub && sub.student) || {};
    const claimed = [st.name, st.id].filter(Boolean).join(" / ") || sub.file || "unknown";
    const key = `~unmatched:${sub.file || claimed}`;
    if (isDag) {
      const r = scoreDag(dagKey, sub.path);
      assignment.unmatchedScored.set(key, {
        file: sub.file || "unknown", claimed,
        name: st.name || claimed, id: st.id || "",
        dag: r,
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
  $("addAssignment").disabled = false;
  maybeUnlockSA();
  return true;
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
      html += `<h3>${escapeHtml(a.tag)}</h3><table><tr><th>Name</th><th>Path</th><th>Score</th><th>Max</th><th>%</th><th>Match</th></tr>`;
      for (const [, s] of a.scored) {
        const d = s.dag;
        if (d.mismatch) {
          html += `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(d.ribbon || "")}</td>` +
            `<td colspan="4">path/key mismatch: ${escapeHtml(d.mismatch)}</td><td>ERR</td></tr>`;
        } else {
          html += `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(d.ribbon)}</td>` +
            `<td>${d.score}</td><td>${d.maxScore}</td>` +
            `<td>${Math.round(d.pct * 100)}%</td>` +
            `<td>${d.pathMatch ? "gold" : `off@${d.divergeAt}`}</td></tr>`;
        }
      }
      html += "</table>";
      if (a.unmatchedScored && a.unmatchedScored.size) {
        html += `<h3>${escapeHtml(a.tag)} · Unmatched</h3><table><tr><th>File</th><th>Path</th><th>Score</th><th>Max</th><th>%</th><th>Match</th></tr>`;
        for (const [, s] of a.unmatchedScored) {
          const d = s.dag;
          html += `<tr><td>${escapeHtml(s.file)}</td><td>${escapeHtml(d.ribbon)}</td>` +
            (d.mismatch ? `<td colspan="4">ERR ${escapeHtml(d.mismatch)}</td><td>ERR</td>`
              : `<td>${d.score}</td><td>${d.maxScore}</td><td>${Math.round(d.pct * 100)}%</td><td>${d.pathMatch ? "gold" : `off@${d.divergeAt}`}</td>`) +
            `</tr>`;
        }
        html += "</table>";
      }
      if (a.missing.length) html += `<p class='note'>Missing: ${a.missing.map((m) => escapeHtml(m.name)).join(", ")}</p>`;
      continue; // skip flat table markup below
    }
    html += `<h3>${escapeHtml(a.tag)}</h3><table><tr><th>Name</th><th>MC</th><th>TF</th><th>ID</th><th>Total (non-AI)</th></tr>`;
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
  $("rosterNext").addEventListener("click", () => stepCtl.unlock(3));
  $("resultsNext").addEventListener("click", () => {
    const hasSA = state.assignments.some((a) => a.saNs.length > 0);
    stepCtl.unlock(hasSA ? 5 : 6);
  });
  $("backTo3").addEventListener("click", () => stepCtl.goto(3));
  $("backTo4").addEventListener("click", () => stepCtl.goto(4));
  $("backTo5").addEventListener("click", () => stepCtl.goto(5));
  $("saNext").addEventListener("click", () => stepCtl.unlock(6));
  $("runNonAI").addEventListener("click", () => runAssignment().then((ok) => {
    if (ok) stepCtl.unlock(4);
  }));
  $("addAssignment").addEventListener("click", () => {
    $("keyFile").value = "";
    $("subFiles").value = "";
    pendingSubFiles = [];
    $("quarantine").textContent = "";
    stepCtl.goto(3);
  });
}

/* ---- 5. SA ---- */

function allScored() {
  return state.assignments.length > 0 && state.assignments.every((a) => a.scored && a.scored.size > 0);
}

function maybeUnlockSA() {
  if (!allScored()) return;
  const anySA = state.assignments.some((a) => a.saNs.length > 0);
  if (!anySA) {
    $("saQueue").textContent = "No SA items in these assignments — continue to Export.";
    $("lockSA").disabled = false;
    return;
  }
  $("saQueue").textContent = "Non-AI complete — grading SA…";
  $("lockSA").disabled = false;
  runSA().catch((e) => {
    $("saQueue").textContent = `SA grading failed: ${(e && e.message) || e}.`;
  });
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
      if (a.unmatchedScored) {
        for (const [ukey, urow] of a.unmatchedScored) {
          const ans = (urow.answers || []).find((x) => x.q === n);
          answersByStudent.push({
            ref: `${a.tag}:Q${n}:${ukey}`,
            text: (ans && typeof ans.answer === "string") ? ans.answer : "",
          });
        }
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
      let out;
      try {
        out = await gradeAll(workerUrl, apiKey, model, saMeta, answersByStudent, onProgress);
      } catch (e) {
        $("saQueue").textContent =
          `${a.tag} Q${n} failed: ${(e && e.message) || e}. Check key/Worker/network, then re-run.`;
        return;
      }
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
    const own = state.assignments.find((x) => x.tag === inp.dataset.tag);
    inp.disabled = !!(own && own.locked);
    inp.addEventListener("change", () => {
      const a = state.assignments.find((x) => x.tag === inp.dataset.tag);
      if (!a || a.locked) return;
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
}

function initSA() {
  $("lockSA").addEventListener("click", () => {
    for (const a of state.assignments) if (a.saDone) a.locked = true;
    $("saQueue").textContent = "SA locked.";
    renderSA();
  });
}

/* ---- 6. Export ---- */

function initExport() {
  $("downloadXlsx").addEventListener("click", () => {
    if (!globalThis.XLSX) {
      alert("Spreadsheet library (SheetJS) not loaded — check network/ad-blocker and reload this page, then retry.");
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
          });
        }
        if (a.unmatchedScored) {
          for (const [key, s] of a.unmatchedScored) {
            const saScores = new Map();
            let total = s.totalNonAI;
            for (const n of a.saNs) {
              const fin = s.sa.get(n) ? s.sa.get(n).final : null;
              saScores.set(n, fin == null ? "" : fin);
              if (fin != null && fin !== "") total += Number(fin);
            }
            unmatchedResults.set(key, {
              name: `${s.file} (${s.claimed})`, id: s.id,
              mc: s.mc, tf: s.tf, idScore: s.idScore, saScores, total,
            });
          }
        }
        return { tag: a.tag, mode: a.mode || "flat", saNs: a.saNs, results, unmatchedResults,
          unmatched: a.unmatched, missing: a.missing, reviews: a.reviews };
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
