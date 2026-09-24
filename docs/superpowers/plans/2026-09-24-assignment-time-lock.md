# Assignment Time Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the lesson notebook's assignment to a configurable weekday window (default Wednesday, `Asia/Manila`) using a trusted internet clock, stamp the encrypted submission with that trusted time, and surface the timestamp as a `Time Submitted` column in the checker's export.

**Architecture:** A new optional `window` key in `build.json` is validated by `build.py` and baked into the student HTML as `ln:window-day` / `ln:window-tz` meta tags. The assignment component fetches trusted time from `worldtimeapi.org` and (a) locks the Begin card outside the window, re-checking every 60 s and at click time, failing closed if the API is unreachable, and (b) stamps the trusted time into the encrypted submit payload. The checker carries that timestamp through to a new export column, blank when absent.

**Tech Stack:** Python 3 stdlib (`v2/build.py`), vanilla JS (assignment component, no frameworks), Node's built-in `node:test` + `assert` for the checker units, `node` for the smoke harness, Python `pytest` for build tests.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-09-24-assignment-time-lock-design.md` — every requirement below traces to it.
- **No tamper-proofing:** the HTML gate is a deterrent only; do not attempt obfuscation or encrypted pages (spec §1.1).
- **Fail closed:** any failure to obtain trusted time locks the assignment / blocks the submit. **Never** fall back to `Date.now()` for a gate or timestamp decision (spec §4, §5).
- **Trusted source:** `https://worldtimeapi.org/api/timezone/<tz>` only (spec §4).
- **Default window:** `day = "wednesday"`, `tz = "Asia/Manila"` when `window` is absent (spec §3).
- **Scope:** assignment only; lesson body untouched; crypto envelope, `decrypt.py`, `make_keys.py`, and the Worker are unchanged (spec §4–§8).
- **Component JS is not scanned for external URLs:** `build.py` runs `EXTERNAL_RE` on component **CSS** only (`build.py:1379`); `check_js` (`build.py:374`) only rejects literal closing tags. The API URL in `component.js` is therefore legal. Do not add the URL to `component.css`.
- **Timestamps:** ISO-8601 UTC string; the payload adds `submitted_time_source: "worldtimeapi.org"` (spec §6).
- **Blank, never guessed:** a submission without `submitted_at` exports an empty `Time Submitted` cell (spec §7).
- **Run tests from repo root** (`D:\Python\lesson-notebook-pipeline`): `python -m pytest tests -q`, `node v2/tools/assignment_smoke.js`, and `node --test checker/app/test/`.
- **Comments:** do not add code comments unless a nearby existing comment establishes the convention (repo convention: sparse comments that explain invariants only).

---

### Task 1: `build.py` — `window` config validation + meta injection

**Files:**
- Modify: `v2/build.py` (`validate_window_cfg` new; allowed-keys set at `build.py:1252-1254`; meta assembly at `build.py:1415-1422`)
- Test: `tests/test_assignment_window.py` (NEW)

**Interfaces:**
- Consumes: existing `Err(rule, file, line, msg, hint)` (`build.py:75`) and `cfg` from `assemble`.
- Produces: `validate_window_cfg(cfg, errors)` → appends `Err`s; `WINDOW_DEFAULT = {"day": "wednesday", "tz": "Asia/Manila"}`; `WINDOW_DAYS` tuple. The assembled HTML carries `<meta name="ln:window-day" content="…">` and `<meta name="ln:window-tz" content="…">` whenever the `assignment` component is mounted (default when `window` is absent).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_assignment_window.py`:

```python
import io
import json
import contextlib
import build
from test_build import make_skel


def build_run(skel, work, cwd, monkeypatch):
    monkeypatch.chdir(cwd)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(work)])
    return rc, buf.getvalue()


def workdir(tmp_path, cfg):
    w = tmp_path / "w"
    w.mkdir()
    (w / "build.json").write_text(json.dumps(cfg), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="x"><h2>A B</h2>'
        '<div data-component="assignment" data-key="a1"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text("LN.data.a1 = {};", encoding="utf-8")
    return w


BASE = {"title": "T", "theme": "mini", "components": ["assignment"],
        "output": "out.html", "week": 4, "subject": "S"}


def test_absent_window_defaults_to_wednesday_manila(tmp_path, monkeypatch):
    skel = make_skel(tmp_path, components=("assignment",))
    w = workdir(tmp_path, BASE)
    rc, out = build_run(skel, w, tmp_path, monkeypatch)
    assert rc == 0, out
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    assert '<meta name="ln:window-day" content="wednesday">' in html
    assert '<meta name="ln:window-tz" content="Asia/Manila">' in html


def test_custom_window_baked(tmp_path, monkeypatch):
    skel = make_skel(tmp_path, components=("assignment",))
    cfg = dict(BASE, window={"day": "friday", "tz": "Asia/Tokyo"})
    rc, out = build_run(skel, workdir(tmp_path, cfg), tmp_path, monkeypatch)
    assert rc == 0, out
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    assert '<meta name="ln:window-day" content="friday">' in html
    assert '<meta name="ln:window-tz" content="Asia/Tokyo">' in html


def test_bad_day_fails(tmp_path, monkeypatch):
    skel = make_skel(tmp_path, components=("assignment",))
    cfg = dict(BASE, window={"day": "wednesdey", "tz": "Asia/Manila"})
    rc, out = build_run(skel, workdir(tmp_path, cfg), tmp_path, monkeypatch)
    assert rc == 1
    assert "wednesdey" in out or "day" in out


def test_empty_tz_fails(tmp_path, monkeypatch):
    skel = make_skel(tmp_path, components=("assignment",))
    cfg = dict(BASE, window={"day": "wednesday", "tz": ""})
    rc, out = build_run(skel, workdir(tmp_path, cfg), tmp_path, monkeypatch)
    assert rc == 1
    assert "tz" in out


def test_unknown_window_key_fails(tmp_path, monkeypatch):
    skel = make_skel(tmp_path, components=("assignment",))
    cfg = dict(BASE, window={"day": "wednesday", "tz": "Asia/Manila", "x": 1})
    rc, out = build_run(skel, workdir(tmp_path, cfg), tmp_path, monkeypatch)
    assert rc == 1
    assert "x" in out


def test_window_without_assignment_fails(tmp_path, monkeypatch):
    skel = make_skel(tmp_path, components=("demo",))
    cfg = {"title": "T", "theme": "mini", "components": ["demo"],
           "output": "out.html", "window": {"day": "wednesday", "tz": "Asia/Manila"}}
    w = tmp_path / "w"
    w.mkdir()
    (w / "build.json").write_text(json.dumps(cfg), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="x"><h2>A B</h2>'
        '<div data-component="demo" data-key="d1"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text("LN.data.d1 = {};", encoding="utf-8")
    rc, out = build_run(skel, w, tmp_path, monkeypatch)
    assert rc == 1
    assert "window" in out and "assignment" in out
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_window.py -q`
Expected: FAIL — `window` is an unknown build.json key today, so the "absent window" and "custom window" tests fail (no meta tags), and the bad-config tests fail differently (unknown-key error text, not the specific messages).

- [ ] **Step 3: Add the validator and constants**

In `v2/build.py`, below `ASSIGN_FIXED` / `ASSIGN_SA_MIN` (`build.py:608-609`), add:

```python
WINDOW_DEFAULT = {"day": "wednesday", "tz": "Asia/Manila"}
WINDOW_DAYS = ("monday", "tuesday", "wednesday", "thursday",
               "friday", "saturday", "sunday")


def validate_window_cfg(cfg, errors):
    """Validate the optional build.json window key (assignment week gate)."""
    if not isinstance(cfg, dict) or "window" not in cfg:
        return
    comps = cfg.get("components") if isinstance(cfg.get("components"), list) else []
    if "assignment" not in comps:
        errors.append(Err("build.json", "build.json", None,
                          "window is set but the assignment component is not mounted",
                          "drop the window key, or add \"assignment\" to components"))
        return
    win = cfg.get("window")
    if not isinstance(win, dict):
        errors.append(Err("build.json", "build.json", None,
                          "window must be an object with day + tz",
                          "e.g. {\"day\": \"wednesday\", \"tz\": \"Asia/Manila\"}"))
        return
    extra = set(win) - {"day", "tz"}
    if extra:
        errors.append(Err("build.json", "build.json", None,
                          "unknown window keys: %s" % ", ".join(sorted(extra)),
                          "allowed: day, tz"))
    day = win.get("day")
    if day not in WINDOW_DAYS:
        errors.append(Err("build.json", "build.json", None,
                          "window.day must be a lowercase weekday name, got %r" % (day,),
                          "one of: " + ", ".join(WINDOW_DAYS)))
    tz = win.get("tz")
    if not isinstance(tz, str) or not tz.strip():
        errors.append(Err("build.json", "build.json", None,
                          "window.tz must be a non-empty timezone string, got %r" % (tz,),
                          "an IANA zone, e.g. \"Asia/Manila\""))
```

- [ ] **Step 4: Wire the validator into `assemble`**

At `build.py:1252-1254`, add `"window"` to the allowed set:

```python
        unknown = set(cfg) - {"title", "theme", "components", "output",
                              "extra_css", "extra_js", "week", "subject",
                              "assignment", "dag", "window"}
```

Update the allowed-keys hint string on the next line to append `, window` after `dag`. Then, beside the existing `validate_assign_cfg` call at `build.py:1260-1261`, add:

```python
        validate_window_cfg(cfg, errors)
```

- [ ] **Step 5: Inject the meta tags**

Replace the meta block at `build.py:1415-1422` with:

```python
    title = html.escape(str(cfg["title"]), quote=True)
    out = shell.replace("__TITLE__", title)
    meta_bits = []
    if "week" in cfg or "subject" in cfg:
        meta_bits.append('<meta name="ln:week" content="%s">'
                         % html.escape(str(cfg.get("week", "?")), quote=True))
        meta_bits.append('<meta name="ln:subject" content="%s">'
                         % html.escape(str(cfg.get("subject", "")), quote=True))
    if "assignment" in cfg.get("components", []):
        win = cfg.get("window") if isinstance(cfg.get("window"), dict) else {}
        day = win.get("day") if win.get("day") in WINDOW_DAYS else WINDOW_DEFAULT["day"]
        tz = win.get("tz") if isinstance(win.get("tz"), str) and win.get("tz").strip() \
            else WINDOW_DEFAULT["tz"]
        meta_bits.append('<meta name="ln:window-day" content="%s">'
                         % html.escape(day, quote=True))
        meta_bits.append('<meta name="ln:window-tz" content="%s">'
                         % html.escape(tz, quote=True))
    meta = ("\n".join(meta_bits) + "\n") if meta_bits else ""
    out = out.replace("__META__", meta)
```

Note the original code defined `title`/`out` before the meta block; keep those two lines once, immediately above the new block, and delete the old `title = ...` / `out = shell.replace(...)` that followed it.

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_assignment_window.py -q`
Expected: PASS (6 passed).

- [ ] **Step 7: Run the full build test suite**

Run: `python -m pytest tests -q`
Expected: all existing tests still pass (the meta change must not perturb `tests/test_assignment_meta.py`).

- [ ] **Step 8: Commit**

```bash
git add v2/build.py tests/test_assignment_window.py
git commit -m "feat(build): window config validation + ln:window meta injection"
```

---

### Task 2: Assignment component — trusted clock module

**Files:**
- Modify: `v2/skeleton/components/assignment/component.js` (new `fetchTrustedNow` + `metaOf` default handling near `metaOf` at `component.js:6-9`)
- Test: `v2/tools/assignment_smoke.js` (extend, step 5 below)

**Interfaces:**
- Consumes: `fetch` and `AbortController` from the page global.
- Produces: `fetchTrustedNow(tz, cb)` → calls `cb({ok:true, iso, dow, unixtime})` or `cb({ok:false, reason})`; `dow` is a lowercase English weekday name; `iso` is the API's `datetime`. Also `windowMeta()` → `{day, tz}` reading `ln:window-day` / `ln:window-tz`, defaulting to `wednesday` / `Asia/Manila`.

- [ ] **Step 1: Write the failing smoke checks**

In `v2/tools/assignment_smoke.js`, the sandbox currently has no `fetch`. Replace the `sandbox` literal at `assignment_smoke.js:91-97` with a version that takes a controllable response, and add a helper after the component is loaded (`assignment_smoke.js:100`):

```javascript
let clockReply = { ok: true, day: "Wednesday" };
const sandboxFetch = function () {
  return new Promise(function (resolve, reject) {
    if (clockReply.ok) {
      resolve({ ok: true, json: function () {
        return Promise.resolve({
          datetime: "2026-09-23T10:00:00+08:00",
          day_of_week: clockReply.day, unixtime: 1758602400
        });
      } });
    } else {
      reject(new Error("offline"));
    }
  });
};
```

Add `fetch: sandboxFetch` to the `sandbox` object and set `sandbox.AbortController = function () {
  this.signal = null; this.abort = function () {};
};`. (The component checks for `typeof AbortController`; the stub keeps the smoke harness DOM-free.)

- [ ] **Step 2: Run the smoke to verify it currently passes**

Run: `node v2/tools/assignment_smoke.js`
Expected: `SMOKE OK — flat deck + dag walk both let the student advance.` (Baseline is green before the gate exists; this confirms the harness still loads with `fetch` added — the component ignores it for now.)

- [ ] **Step 3: Add the clock module to `component.js`**

In `v2/skeleton/components/assignment/component.js`, inside the IIFE just below `nameOf` (`component.js:25-28`), add:

```javascript
  var TIME_API = "https://worldtimeapi.org/api/timezone/";
  var DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday",
             "friday", "saturday"];
  function fetchTrustedNow(tz, cb) {
    function attempt(triesLeft) {
      var done = false;
      var ac = (typeof AbortController !== "undefined") ? new AbortController() : null;
      if (ac) setTimeout(function () { try { ac.abort(); } catch (e) {} }, 8000);
      fetch(TIME_API + encodeURIComponent(tz), ac ? { signal: ac.signal } : {})
        .then(function (r) {
          if (!r.ok) throw new Error("http " + r.status);
          return r.json();
        })
        .then(function (j) {
          if (done) return;
          done = true;
          var dw = String(j.day_of_week || "").toLowerCase();
          if (!j.datetime || DOW.indexOf(dw) < 0) {
            cb({ ok: false, reason: "malformed-time" });
            return;
          }
          cb({ ok: true, iso: j.datetime, dow: dw,
               unixtime: j.unixtime });
        })
        .catch(function (e) {
          if (done) return;
          done = true;
          if (triesLeft > 0) attempt(triesLeft - 1);
          else cb({ ok: false, reason: (e && e.message) || "network" });
        });
    }
    attempt(1);
  }
  function windowMeta() {
    var day = metaOf("ln:window-day").toLowerCase();
    if (DOW.indexOf(day) < 0) day = "wednesday";
    var tz = metaOf("ln:window-tz") || "Asia/Manila";
    return { day: day, tz: tz };
  }
```

- [ ] **Step 4: Run the smoke to verify it still passes**

Run: `node v2/tools/assignment_smoke.js`
Expected: `SMOKE OK …` (unchanged; the module is defined but not yet called).

- [ ] **Step 5: Add a direct unit check of the clock module to the smoke**

After the existing flat walk's final `SMOKE OK` line is *not* where this goes — add this block immediately after the component is loaded at `assignment_smoke.js:100`, before the flat `data` object, so it fails fast:

```javascript
/* ---------- clock module ---------- */
clockReply = { ok: true, day: "Wednesday" };
sandboxLN.components["assignment"].__clockProbe = null;
(function () {
  const mod = fs_smoke_probe();
  function fs_smoke_probe() { return null; }
})();
```

This inline probe is awkward because `fetchTrustedNow` is private. Instead export it for testing by adding to the returned `api` object in `component.js` (next to `_export` at `component.js:471`):

```javascript
    _trustedNow: fetchTrustedNow,
    _windowMeta: windowMeta,
```

Then in the smoke, after the component load, add:

```javascript
/* ---------- clock module ---------- */
let clockResult = null;
sandboxLN.components["assignment"]._trustedNow("Asia/Manila", function (r) {
  clockResult = r;
});
setTimeout(function () {
  check("clock: api reply parses to lowercase weekday",
    clockResult && clockResult.ok === true && clockResult.dow === "wednesday",
    JSON.stringify(clockResult));
  check("clock: meta defaults to wednesday/Asia/Manila when absent",
    JSON.stringify(sandboxLN.components["assignment"]._windowMeta()) ===
      JSON.stringify({ day: "wednesday", tz: "Asia/Manila" }),
    JSON.stringify(sandboxLN.components["assignment"]._windowMeta()));
  clockReply = { ok: false };
  sandboxLN.components["assignment"]._trustedNow("Asia/Manila", function (r) {
    check("clock: network failure reports ok:false (fail closed)",
      r && r.ok === false, JSON.stringify(r));
  });
}, 0);
```

Because the smoke is synchronous top-to-bottom and exits at the end with `process.exit`, move the final `SMOKE OK` print into the `setTimeout` above. The simplest restructure: wrap everything from `if (failures)` (line 231) to the end in the timeout callback so the async probe resolves first.

- [ ] **Step 6: Run the smoke to verify it passes**

Run: `node v2/tools/assignment_smoke.js`
Expected: `SMOKE OK …` plus the three `clock:` checks reporting `ok`.

- [ ] **Step 7: Commit**

```bash
git add v2/skeleton/components/assignment/component.js v2/tools/assignment_smoke.js
git commit -m "feat(assignment): trusted clock module (worldtimeapi, fail-closed)"
```

---

### Task 3: Assignment component — the Wednesday gate on the Begin card

**Files:**
- Modify: `v2/skeleton/components/assignment/component.js` (`init` Begin card at `component.js:65-78`; Begin click handler at `component.js:316-325`)
- Modify: `v2/skeleton/components/assignment/component.css` (`.lna-lock*` styles after `.lna-entry` at `component.css:4-6`)
- Test: `v2/tools/assignment_smoke.js`

**Interfaces:**
- Consumes: `fetchTrustedNow`, `windowMeta` from Task 2.
- Produces: `inWindow(now)` helper; the Begin card renders a status line (`lna-lock-open` / `lna-lock-shut`); a `gateTimer` re-check every 60 s; `openDeck()` only reachable when the last trusted check was in-window.

- [ ] **Step 1: Write the failing smoke checks**

In `assignment_smoke.js`, before calling `begin.click()` at line 127, add a gate check. With `clockReply = { ok: true, day: "Wednesday" }` still set from the clock probe, the Begin card must be open. Add:

```javascript
const gateNote = walk(root, function (e) {
  return (e.className || "").indexOf("lna-lock-open") >= 0;
})[0];
check("gate: in-window card shows the open status", !!gateNote);
```

Then, in the DAG section after `root2` is built, add an out-of-window walk:

```javascript
clockReply = { ok: true, day: "Tuesday" };
const root3 = new El("div");
sandboxLN.components["assignment"].init(root3, data);
const begin3 = walk(root3, function (e) {
  return e.tag === "button" && (e.className || "").indexOf("lna-begin") >= 0;
})[0];
setTimeout(function () {
  check("gate: out-of-window Begin stays disabled", begin3.disabled === true,
    "disabled=" + begin3.disabled);
  const shut = walk(root3, function (e) {
    return (e.className || "").indexOf("lna-lock-shut") >= 0;
  })[0];
  check("gate: out-of-window card shows the window notice", !!shut);
}, 0);
```

- [ ] **Step 2: Run the smoke to verify it fails**

Run: `node v2/tools/assignment_smoke.js`
Expected: FAIL — no `lna-lock-open` element and `begin3.disabled` is `false` (the gate does not exist yet).

- [ ] **Step 3: Add gate state and the status line to `init`**

In `component.js`, after `var begin = LN.h("button", …)` at line 75-76 and before `card.appendChild(begin)` at line 77, insert a status node and gate state:

```javascript
      var gateNote = LN.h("p", { class: "lna-gate" });
      card.appendChild(gateNote);
      var meta = windowMeta();
      var gateState = { checked: false, inWindow: false, iso: "", dow: "" };
```

Replace `card.appendChild(begin);` with `card.appendChild(gateNote); card.appendChild(begin);` (moving the append of `begin` after the note).

- [ ] **Step 4: Add the gate check + open guard**

In `component.js`, near `lockFullscreen` / the Begin handler at lines 307-325, add:

```javascript
      function renderGate() {
        if (!gateState.checked) {
          gateNote.className = "lna-gate";
          gateNote.textContent = "Checking the trusted time…";
          begin.disabled = true;
          return;
        }
        if (gateState.inWindow) {
          gateNote.className = "lna-gate lna-lock-open";
          gateNote.textContent = "Open today \u2713 — this assignment closes at " +
            "11:59 PM (" + meta.tz + ").";
          begin.disabled = false;
          return;
        }
        if (gateState.dow === "") {
          gateNote.className = "lna-gate lna-lock-shut";
          gateNote.textContent = "Cannot verify the time — connect to the internet, " +
            "then reload this page.";
        } else {
          gateNote.className = "lna-gate lna-lock-shut";
          gateNote.textContent = "This assignment opens " +
            meta.day.charAt(0).toUpperCase() + meta.day.slice(1) +
            ", 12:00 AM – 11:59 PM (" + meta.tz + "). Today is " +
            gateState.iso + " — come back then.";
        }
        begin.disabled = true;
      }
      function checkGate() {
        fetchTrustedNow(meta.tz, function (r) {
          if (r.ok) {
            gateState.checked = true;
            gateState.iso = r.iso;
            gateState.dow = r.dow;
            gateState.inWindow = (r.dow === meta.day);
          } else {
            gateState.checked = true;
            gateState.inWindow = false;
            gateState.dow = "";
          }
          renderGate();
        });
      }
      renderGate();
      checkGate();
      setInterval(checkGate, 60000);
```

Guard the Begin handler at line 316 — change `begin.addEventListener("click", function () {` to re-verify first:

```javascript
      begin.addEventListener("click", function () {
        if (!gateState.inWindow) {
          err(ui_or_gateNote(), "The assignment is not open right now.");
          checkGate();
          return;
        }
```

Because `ui` is not in scope at this point, replace that body's error path with a direct note update instead:

```javascript
      begin.addEventListener("click", function () {
        if (!gateState.inWindow) {
          checkGate();
          return;
        }
```

(Keeping Begin `disabled` outside the window already prevents the click; this re-check covers the stale-tab case.)

- [ ] **Step 5: Add the CSS**

In `component.css`, after `.lna-entry p{…}` at line 6, add:

```css
.lna-gate{margin:8px 0 2px;font-size:13.5px;color:var(--ink-soft)}
.lna-lock-open{color:var(--green)}
.lna-lock-shut{background:var(--note-yellow);border:1px solid var(--grid-strong);
  border-radius:8px;padding:9px 12px;color:var(--ink)}
```

- [ ] **Step 6: Run the smoke to verify it passes**

Run: `node v2/tools/assignment_smoke.js`
Expected: `SMOKE OK …` with the new `gate:` checks reporting `ok`.

- [ ] **Step 7: Commit**

```bash
git add v2/skeleton/components/assignment/component.js v2/skeleton/components/assignment/component.css v2/tools/assignment_smoke.js
git commit -m "feat(assignment): Wednesday-window gate on the Begin card"
```

---

### Task 4: Assignment component — watchdog + trusted submit timestamp

**Files:**
- Modify: `v2/skeleton/components/assignment/component.js` (submit handlers at `component.js:391-449`; `fullscreenchange`/Close at `component.js:339-356`)
- Test: `v2/tools/assignment_smoke.js`

**Interfaces:**
- Consumes: `fetchTrustedNow`, `windowMeta`, `gateState`.
- Produces: submit bodies carry `submitted_at` (trusted ISO) + `submitted_time_source: "worldtimeapi.org"`; a 60 s watchdog closes an open deck when the window ends; a failed trusted fetch at submit blocks the submit.

- [ ] **Step 1: Write the failing smoke checks**

In the DAG walk, `submit2.click()` currently calls the stubbed `_export` (line 331-335). Change the stub to capture the body and assert the timestamp fields:

```javascript
sandboxLN.components["assignment"]._export = function (body, ui) {
  submittedBody = body;
  if (ui && typeof ui.onDone === "function") ui.onDone();
};
```

The existing `submittedBody` capture is enough; add after the `dag: submit student name+id present` check (line 346-348):

```javascript
  check("submit: trusted timestamp present",
    typeof submittedBody.submitted_at === "string" &&
    submittedBody.submitted_at.length > 0,
    "submitted_at=" + submittedBody.submitted_at);
  check("submit: timestamp source is worldtimeapi.org",
    submittedBody.submitted_time_source === "worldtimeapi.org",
    "source=" + submittedBody.submitted_time_source);
```

- [ ] **Step 2: Run the smoke to verify it fails**

Run: `node v2/tools/assignment_smoke.js`
Expected: FAIL — `submittedBody.submitted_at` is the device ISO from `new Date().toISOString()` (no `submitted_time_source` key at all).

- [ ] **Step 3: Add a trusted-time submit wrapper**

In `component.js`, near `_export` at line 471, add a helper that fetches trusted time then calls a callback, and blocks on failure:

```javascript
    withTrustedTime: function (ui, cb) {
      var meta = windowMeta();
      fetchTrustedNow(meta.tz, function (r) {
        if (!r.ok) {
          err(ui, "Cannot verify the time — connect to the internet, then try again.");
          return;
        }
        cb({ iso: r.iso, source: "worldtimeapi.org" });
      });
    },
```

- [ ] **Step 4: Use it in both submit handlers**

Flat submit at line 439-448 — replace `submitted_at: new Date().toISOString(),` with a trusted fetch. Change the handler to:

```javascript
        api.withTrustedTime({ errB: errB }, function (stamp) {
          api._export({
            title: document.title, subject: subj, week: Number(week),
            student: { name: name, id: id },
            submitted_at: stamp.iso,
            submitted_time_source: stamp.source,
            answers: ans
          }, { errB: errB, cover: cover, submit: submit,
            onDone: function () {
              state.submitted = true;
              navC.hidden = false;
            } });
        });
```

DAG submit at line 405-416 — the same change, wrapping the existing `api._export({…})` call and replacing `submitted_at: new Date().toISOString(),` with `submitted_at: stamp.iso, submitted_time_source: stamp.source,`.

- [ ] **Step 5: Add the watchdog**

In `checkGate`'s timer body (Task 3, step 4), extend the callback so an ended window closes an open deck:

```javascript
          if (gateState.checked && !gateState.inWindow && opened) {
            exiting = true;
            if (document.exitFullscreen && document.fullscreenElement)
              document.exitFullscreen();
            document.documentElement.style.overflow = "";
            deck.className = "lna-deck";
            opened = false;
          }
```

Place this inside the `fetchTrustedNow` callback after `renderGate();`.

- [ ] **Step 6: Run the smoke to verify it passes**

Run: `node v2/tools/assignment_smoke.js`
Expected: `SMOKE OK …` with the `submit:` timestamp checks reporting `ok`.

- [ ] **Step 7: Commit**

```bash
git add v2/skeleton/components/assignment/component.js v2/tools/assignment_smoke.js
git commit -m "feat(assignment): trusted submit timestamp + window watchdog"
```

---

### Task 5: Checker — `Time Submitted` column

**Files:**
- Modify: `checker/app/lib/export-book.js` (`head` build at `export-book.js:6-17`; matched cell loop at `export-book.js:24-49`; unmatched loop at `export-book.js:53-80`)
- Modify: `checker/app/app.js` (carry the timestamp onto rows at `app.js:240-279`; export mapping at `app.js:658-724`)
- Test: `checker/app/test/export-book.test.js`

**Interfaces:**
- Consumes: `sub.submitted_at` (from the decrypted payload, Task 4).
- Produces: Grades sheet gains a `Time Submitted` header after the per-assignment groups and before `GrandTotal`/`Status`; each row carries its own assignment's timestamp (blank if absent). The header list stays `[..., "Time Submitted", "GrandTotal", "Status"]`.

- [ ] **Step 1: Write the failing test**

In `checker/app/test/export-book.test.js`, update the existing header assertions to include the new column and add a blank case. Change the first test's expected header and row:

```javascript
test("grades sheet has dynamic SA columns + grand total", () => {
  const wb = buildWorkbookData(sample());
  const grades = wb.sheets.find((s) => s.name === "Grades");
  assert.deepEqual(grades.rows[0],
    ["Name", "ID", "W4 MC", "W4 TF", "W4 ID", "W4 SA19", "W4 SA20", "W4 Total",
     "Time Submitted", "GrandTotal", "Status"]);
  assert.deepEqual(grades.rows[1], ["N1", "1", 9, 4, 3, 2, 1, 19, "", 19, "matched"]);
});
```

Add a new test:

```javascript
test("Time Submitted shows the timestamp when present", () => {
  const input = sample();
  input.assignments[0].results.get("1").submittedAt = "2026-09-23T02:00:00Z";
  const grades = buildWorkbookData(input).sheets.find((s) => s.name === "Grades");
  assert.equal(grades.rows[1][8], "2026-09-23T02:00:00Z");
});

test("Time Submitted is blank when the submission has none", () => {
  const grades = buildWorkbookData(sample()).sheets.find((s) => s.name === "Grades");
  assert.equal(grades.rows[1][8], "");
});
```

- [ ] **Step 2: Run the checker tests to verify they fail**

Run: `node --test checker/app/test/`
Expected: FAIL on the header/row assertions (no `Time Submitted` column).

- [ ] **Step 3: Add the column to `export-book.js`**

Change the `head` build at `export-book.js:6-16` to append the column after the per-assignment loop:

```javascript
  const head = ["Name", "ID"];
  for (const p of perAssign) {
    if (p.mode === "dag") {
      head.push(`${p.tag} DAG Score`, `${p.tag} DAG Max`, `${p.tag} DAG %`);
    } else {
      head.push(`${p.tag} MC`, `${p.tag} TF`, `${p.tag} ID`);
      for (const n of p.saNs) head.push(`${p.tag} SA${n}`);
    }
    head.push(`${p.tag} Total`);
  }
  head.push("Time Submitted", "GrandTotal", "Status");
```

In the matched-row loop (`export-book.js:24-49`), before `grades.push([name, id, ...cells, grand, "matched"]);`, compute the row's first non-empty timestamp across assignments and insert it:

```javascript
    let submittedAt = "";
    for (const a of assignments) {
      const r = a.results.get(k);
      if (r && r.submittedAt) { submittedAt = r.submittedAt; break; }
    }
    grades.push([name, id, ...cells, submittedAt, grand, "matched"]);
```

Do the same in the unmatched loop (`export-book.js:53-80`): `const submittedAt = r.submittedAt || "";` and `grades.push([r.name, r.id, ...cells, submittedAt, grand, "unmatched"]);`.

- [ ] **Step 4: Carry the timestamp in `app.js`**

Matched flat rows at `app.js:250-253` — add `submittedAt: sub.submitted_at || ""` to the object passed to `assignment.scored.set`. Matched DAG rows at `app.js:244` — add the same field. Unmatched DAG at `app.js:263-267` and unmatched flat at `app.js:273-278` — add `submittedAt: sub.submitted_at || ""`.

In the export mapping (`app.js:661-723`), thread the field through: add `submittedAt: s.submittedAt || ""` to each `results.set(...)` / `unmatchedResults.set(...)` object. For the DAG branch at `app.js:664-670` and flat branch at `app.js:703-705`, include it.

- [ ] **Step 5: Run the checker tests to verify they pass**

Run: `node --test checker/app/test/`
Expected: PASS.

- [ ] **Step 6: Run the checker's full lib suite**

Run: `node --test checker/app/test/*.test.js`
Expected: PASS (no other test asserts the Grades header shape).

- [ ] **Step 7: Commit**

```bash
git add checker/app/lib/export-book.js checker/app/app.js checker/app/test/export-book.test.js
git commit -m "feat(checker): Time Submitted column in Grades export"
```

---

### Task 6: Docs sweep

**Files:**
- Modify: `v2/SKILL.md` (version note near line 82; inputs table near line 103)
- Modify: `v2/skeleton/components/assignment/README.md` (add a "Time lock" section)
- Modify: `v2/skeleton/components/registry.md` (assignment row at line 22)
- Modify: `README.md` (version note near line 48)

**Interfaces:** documentation only; no code.

- [ ] **Step 1: Update `v2/SKILL.md`**

After the v2.7 paragraph (ends line 89), add:

```markdown
What v2.8 adds: **the assignment time lock** — when `build.json` mounts the
assignment, the Begin card is gated to a weekday window fetched from
`worldtimeapi.org` (trusted time, never the device clock), defaulting to
Wednesday `Asia/Manila` and settable via `"window": {"day": …, "tz": …}`. The
gate fails closed; the trusted time is stamped into the encrypted submission as
`submitted_at` + `submitted_time_source`, and the checker exports a
`Time Submitted` column. The lock deters casual clock tampering only — the
client HTML is never tamper-proof (see the design spec §1.1).
```

In the inputs table row "Assessment" (line 103), append: `Time-locked to a weekday window (default Wednesday Asia/Manila; "window" in build.json).`

- [ ] **Step 2: Update the component README**

Append to `v2/skeleton/components/assignment/README.md`:

```markdown
## Time lock (v2.8)

The Begin card fetches trusted time from `worldtimeapi.org/api/timezone/<tz>`
(meta `ln:window-tz`, default `Asia/Manila`; day `ln:window-day`, default
`wednesday`). Outside the window Begin is disabled and the card shows the
window + a live status; a 60 s watchdog closes an open deck when the window
ends. Every failure to reach the API fails closed (locked). Submit re-fetches
trusted time and records it as `submitted_at` with
`submitted_time_source:"worldtimeapi.org"` — no device-clock fallback. The gate
is a deterrent, not tamper-proof.
```

- [ ] **Step 3: Update the registry row**

In `v2/skeleton/components/registry.md` line 22, append to the assignment row description: `Optional `window` config (build.json) gates Begin to `{day, tz}` (default wednesday/Asia/Manila) via trusted time; submit carries `submitted_at` + `submitted_time_source`.`

- [ ] **Step 4: Update the root README**

In `README.md`, after the v2.4 paragraph (line 48), add a sentence: `v2.8 gates the assignment to a configurable weekday window (default Wednesday Asia/Manila) using trusted internet time, stamps the encrypted submission with that time, and adds a Time Submitted column to the checker export.`

- [ ] **Step 5: Verify no build regressions**

Run: `python -m pytest tests -q` and `node v2/tools/assignment_smoke.js`
Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add v2/SKILL.md v2/skeleton/components/assignment/README.md v2/skeleton/components/registry.md README.md
git commit -m "docs: assignment time lock (v2.8) across SKILL, README, registry"
```

---

## Self-Review

**1. Spec coverage:**
- §3 config → Task 1.
- §4 trusted time module → Task 2.
- §5 gate (Begin, status, watchdog, click re-verify, fail closed) → Task 3 + Task 4 step 5.
- §6 submit timestamp → Task 4.
- §7 checker column + blank → Task 5.
- §1.1 / §8 / §9 / §10 docs + tests → Task 6 and each task's test steps.
- §2 non-goals: no task touches the crypto envelope, Worker, `decrypt.py`, or lesson body.

**2. Placeholder scan:** no "TBD"/"handle edge cases"/"similar to Task N"; every code step shows the code.

**3. Type consistency:** `fetchTrustedNow(tz, cb)` and `windowMeta()` are defined in Task 2 and consumed unchanged in Tasks 3–4; the payload field names `submitted_at` / `submitted_time_source` are identical in Task 4, Task 5, and the README; the checker row field is `submittedAt` consistently in `app.js` and `export-book.js`.

**Known wrinkles to resolve during execution (call out, do not silently skip):**
- Task 2 step 5's smoke restructure (wrapping the final `if (failures)` block in the async probe's `setTimeout`) is described but mechanical; if the asynchronous ordering fights the harness, prefer making `_trustedNow` checks synchronous by exporting a `_parseNow(json)` pure function and testing that instead of round-tripping through the fetch stub.
- Task 4's `withTrustedTime` lives on the returned `api` object; the submit handlers inside `init` are defined before the object literal returns, so call it as `API.withTrustedTime` only if hoisted via a forward-declared `var API;` assigned at the end — otherwise keep `withTrustedTime` as a local function inside the IIFE next to `fetchTrustedNow`.
