### Task 3: Assignment data contract — extract, validate 10/4/4/2, write key file

**Files:**
- Modify: `v2/build.py` (functions after Task 2's; wiring in `assemble()` after `check_mounts` + after component-JS substitution + return-tuple change; wiring in `main()` after the HTML write)
- Create: `tests/test_assignment_contract.py`

**Interfaces:**
- Consumes: Task 2's functions.
- Produces:
  - `build.extract_assignment(sections_text, data_text, errors) -> (key_name|None, data|None)`; errors carry rule `"assign"`.
  - `build.validate_assignment(data, errors)` — rule `"assign"`: exactly 20 items; mix `mc==10, tf==4, id==4, sa==2`; mc: exactly 4 non-empty `choices` + `ans` int 0..3; tf: boolean `ans`; id: non-empty string-list `aliases`; sa: non-empty string-list `key_points`; every prompt non-empty.
  - `build.write_key_file(run_dir, cfg, data, keys) -> Path` — `<run_dir>/build/key/<output stem>-key.json` with `{lesson, output, week, subject, key_id, public_key_b64, decrypt, items:[{n,type,prompt,choices?,ans?|aliases?|key_points?}]}`.
  - `assemble()` returns `(out, errors, ctx)` where `ctx = {"assign": data|None, "keys": keys|None}`; when the assignment data exists the component JS markers `__PUBKEY__`/`__KEYID__` get replaced in the assembled output; `main()` writes the key file after the HTML.

- [ ] **Step 1: Write the failing tests** — `tests/test_assignment_contract.py`:

```python
import json
import pytest
import build


def v20():
    items = []
    items += [{"type": "mc", "prompt": "q%d" % i,
               "choices": ["a", "b", "c", "d"], "ans": i % 4} for i in range(10)]
    items += [{"type": "tf", "prompt": "t%d" % i, "ans": i % 2 == 0}
              for i in range(4)]
    items += [{"type": "id", "prompt": "i%d" % j,
               "aliases": ["variable cost"]} for j in range(4)]
    items += [{"type": "sa", "prompt": "s%d" % j,
               "key_points": ["contribution margin"]} for j in range(2)]
    return {"intro": "i", "items": items}


def test_valid_mix_and_key_file(tmp_path):
    run = tmp_path / "run"
    run.mkdir()
    errs = []
    data = v20()
    build.validate_assignment(data, errs)
    assert not errs, [str(e) for e in errs]
    keys = build.ensure_teacher_keys(run / "build" / "key")
    kf = build.write_key_file(run, {"title": "T", "output": "Week4-Notebook.html",
                                    "week": 4, "subject": "Mgmt"}, data, keys)
    assert kf.name == "Week4-Notebook-key.json"
    assert kf.parent.name == "key"
    body = json.loads(kf.read_text(encoding="utf-8"))
    assert body["week"] == 4 and body["key_id"] == keys["id"]
    assert len(body["items"]) == 20
    assert body["items"][0]["ans"] == 0 and body["items"][0]["choices"][3] == "d"
    assert body["items"][10]["ans"] is True
    assert body["items"][14]["aliases"] == ["variable cost"]
    assert body["items"][19]["key_points"] == ["contribution margin"]
    assert "decrypt.py" in body["decrypt"]


def test_bad_mix_named(tmp_path):
    errs = []
    data = v20()
    data["items"][0]["type"] = "sa"
    build.validate_assignment(data, errs)
    assert errs and errs[-1].rule == "assign" and "expected 10" in errs[-1].msg


def test_field_checks(tmp_path):
    data = v20()
    data["items"][0]["choices"] = ["a", "b", "c"]
    errs = []
    build.validate_assignment(data, errs)
    assert any("choices" in e.msg for e in errs)
    data = v20(); data["items"][0]["ans"] = 7
    errs = []
    build.validate_assignment(data, errs)
    assert any("ans" in e.msg for e in errs)
    data = v20(); del data["items"][18]["key_points"]
    errs = []
    build.validate_assignment(data, errs)
    assert any("key_points" in e.msg for e in errs)
    data = v20(); del data["items"][10]["ans"]
    errs = []
    build.validate_assignment(data, errs)
    assert any("ans" in e.msg for e in errs)
    data = v20(); data["items"][5]["prompt"] = " "
    errs = []
    build.validate_assignment(data, errs)
    assert any("prompt" in e.msg for e in errs)


def test_extract_from_mount(tmp_path):
    sec = '<div data-component="assignment" data-key="assign7"></div>'
    dat = "LN.data.assign7 = " + json.dumps(v20()) + ";\nLN.data.other = 1;"
    errs = []
    ka, dd = build.extract_assignment(sec, dat, errs)
    assert ka == "assign7" and dd and len(dd["items"]) == 20 and not errs


def test_extract_missing_object():
    errs = []
    ka, dd = build.extract_assignment(
        '<div data-component="assignment" data-key="zz9"></div>',
        "LN.data.other = 1;", errs)
    assert ka == "zz9" and dd is None and errs


def test_extract_unparsable_object():
    errs = []
    ka, dd = build.extract_assignment(
        '<div data-component="assignment" data-key="zz9"></div>',
        'LN.data.zz9 = {items: [,]};', errs)   # trailing comma → JSONDecodeError
    assert dd is None and errs
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_contract.py -q`
Expected: FAIL — attribute errors.

- [ ] **Step 3: Implement** (build.py, after Task 2's functions; plus wiring)

```python
ASSIGN_SIZE = 20
ASSIGN_MIX_ORDER = {"mc": 10, "tf": 4, "id": 4, "sa": 2}


def extract_assignment(sections_text, data_text, errors):
    """Find the assignment mount + its LN.data object (balanced JSON)."""
    mm = re.search(r'<div[^>]*data-component="assignment"[^>]*>', sections_text)
    if not mm:
        return None, None
    km = re.search(r'data-key="([^"]*)"', mm.group(0))
    if not km:
        errors.append(Err("assign", "sections.html",
                          sections_text.count("\n", 0, mm.start()) + 1,
                          "assignment mount has no data-key",
                          "add data-key=... to the assignment mount"))
        return None, None
    key = km.group(1)
    m = re.search(r"LN\.data\." + re.escape(key) + r"\s*=\s*", data_text)
    if not m:
        errors.append(Err("assign", "data.js", None,
                          "LN.data.%s missing for the assignment mount" % key,
                          "define LN.data.%s = {...} in data.js" % key))
        return key, None
    i = data_text.index("{", m.end())
    depth, end, instr, esc = 0, -1, False, False
    for k in range(i, len(data_text)):
        c = data_text[k]
        if instr:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                instr = False
        elif c == '"':
            instr = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = k
                break
    if end < 0:
        errors.append(Err("assign", "data.js", None,
                          "unbalanced object for LN.data.%s" % key,
                          "close the braces"))
        return key, None
    try:
        return key, json.loads(data_text[i:end + 1])
    except json.JSONDecodeError as exc:
        errors.append(Err("assign", "data.js", None,
                          "LN.data.%s is not strict JSON: %s" % (key, exc),
                          "write it as pure JSON: double quotes, no trailing commas"))
        return key, None


def validate_assignment(data, errors):
    items = (data or {}).get("items") or []
    if len(items) != ASSIGN_SIZE:
        errors.append(Err("assign", "data.js", None,
                          "assignment needs exactly %d items, found %d"
                          % (ASSIGN_SIZE, len(items)),
                          "author 20 situational items: 10 mc, 4 tf, 4 id, 2 sa"))
        return
    counts = {}
    for n, it in enumerate(items, 1):
        t = it.get("type")
        counts[t] = counts.get(t, 0) + 1
        if not str(it.get("prompt") or "").strip():
            errors.append(Err("assign", "data.js", None,
                              "item %d has an empty prompt" % n, ""))
        if t == "mc":
            ch = it.get("choices") or []
            if len(ch) != 4 or not all(str(c).strip() for c in ch):
                errors.append(Err("assign", "data.js", None,
                                  "mc item %d needs exactly 4 non-empty choices" % n, ""))
            a = it.get("ans")
            if not isinstance(a, int) or not 0 <= a < 4:
                errors.append(Err("assign", "data.js", None,
                                  "mc item %d needs ans 0..3" % n,
                                  "the answer key ships only to build/key/"))
        elif t == "tf":
            if not isinstance(it.get("ans"), bool):
                errors.append(Err("assign", "data.js", None,
                                  "tf item %d needs a boolean ans" % n, ""))
        elif t == "id":
            al = it.get("aliases") or []
            if not al or not all(isinstance(a, str) and a.strip() for a in al):
                errors.append(Err("assign", "data.js", None,
                                  "id item %d needs a non-empty aliases list" % n,
                                  "aliases = accepted answer variants for grading"))
        elif t == "sa":
            kp = it.get("key_points") or []
            if not kp or not all(isinstance(a, str) and a.strip() for a in kp):
                errors.append(Err("assign", "data.js", None,
                                  "sa item %d needs a non-empty key_points list" % n,
                                  "key_points = the objective marks for grading"))
        else:
            errors.append(Err("assign", "data.js", None,
                              "item %d has unknown type %r" % (n, t),
                              "types: mc, tf, id, sa"))
    for t, want in sorted(ASSIGN_MIX_ORDER.items()):
        got = counts.get(t, 0)
        if got != want:
            errors.append(Err("assign", "data.js", None,
                              "type mix has %d %s, expected %d"
                              % (got, t, want),
                              "author 20 situational items: 10 mc, 4 tf, 4 id, 2 sa"))


def write_key_file(run_dir, cfg, data, keys):
    kf = Path(run_dir) / "build" / "key" / (Path(cfg["output"]).stem + "-key.json")
    kf.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for n, it in enumerate(data["items"], 1):
        row = {"n": n, "type": it["type"], "prompt": it["prompt"]}
        if it["type"] == "mc":
            row.update(choices=it["choices"], ans=it["ans"])
        elif it["type"] == "tf":
            row.update(ans=it["ans"])
        elif it["type"] == "id":
            row.update(aliases=it["aliases"])
        else:
            row.update(key_points=it["key_points"])
        rows.append(row)
    kf.write_text(json.dumps({
        "lesson": cfg["title"], "output": cfg["output"],
        "week": cfg["week"], "subject": cfg["subject"],
        "key_id": keys["id"], "public_key_b64": keys["pub_b64"],
        "decrypt": "python v2/tools/decrypt.py --key build/key/keys.pem <submissions…>",
        "items": rows,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    return kf
```

Wiring in `assemble()`:

1. After `check_mounts(parts["sections"], parts["data"], set(cfg["components"]), errors)`:

```python
    assign_data, keys = None, None
    if "assignment" in cfg["components"]:
        ka, assign_data = extract_assignment(parts["sections"], parts["data"], errors)
        if assign_data is not None:
            validate_assignment(assign_data, errors)
        try:
            keys = ensure_teacher_keys(Path.cwd() / "build" / "key")
        except ValueError as exc:
            errors.append(Err("assign", "build/key/keys.pem", None, str(exc),
                              "generate or repair the teacher key file"))
```

2. Component-JS reading loop stays; afterwards (before the substitution chain), when `assign_data and keys`:

```python
    if assign_data and keys:
        for _ix, c in enumerate(cfg["components"]):
            if c == "assignment":
                comp_js[_ix] = (comp_js[_ix]
                                .replace("__PUBKEY__", keys["pub_b64"])
                                .replace("__KEYID__", keys["id"]))
```

3. Change the final `return` of `assemble` to `return out, errors, {"assign": assign_data, "keys": keys}` and in error paths `return None, errors, {}`.
4. `main()` unpacks three; after `out_path.write_text(...)`:

```python
    if ctx["assign"] and ctx["keys"]:
        kf = write_key_file(Path.cwd(), cfg, ctx["assign"], ctx["keys"])
        print("OK - wrote %s" % kf)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_assignment_contract.py tests/test_assignment_meta.py tests/test_build.py -q`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `python -m pytest tests -q` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add v2/build.py tests/
git commit -m "feat(v2.5): assignment contract — mount extraction, 10/4/4/2 validation, per-build teacher key file"
```

---

