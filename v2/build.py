#!/usr/bin/env python3
"""Interactive Lesson Notebook v2.1 - parts assembler + mechanical validator.

Usage:
    python build.py <workdir> [--skeleton DIR] [--lint SHARD_ID]

Reads <workdir>/{build.json, tune.css, sections.html, data.js[, extra.css,
extra.js]} and injects them into the shell at skeleton/shell.html. Exit 0 and
the output file are produced only when every mechanical QA rule passes;
otherwise an itemized FAIL report prints (rule, file, line, message, fix hint)
and exit is 1, with no partial output. With --lint SHARD_ID, runs the
per-shard writer self-check instead: validates that shard against the
shard-local rules only, prints LINT OK or an itemized FAIL, and never reads
the skeleton or writes any file. Python 3 stdlib only.
"""
import colorsys
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input",
             "link", "meta", "param", "source", "track", "wbr"}

MARKERS = [
    "__TITLE__", "/*__THEME__*/", "/*__TUNE__*/", "/*__COMPONENT_CSS__*/",
    "<!--__SECTIONS__-->", "/*__DATA__*/", "/*__COMPONENT_JS__*/",
]
GLUE_JS = "\nLN.boot();\n"

REQUIRED_TOKENS = [
    "bg", "surface", "surface-2", "grid", "grid-strong", "edge-line", "decor",
    "ink", "ink-soft", "ink-faint",
    "accent", "accent-deep", "accent-2", "highlight",
    "green", "green-bg", "amber", "amber-bg", "red", "red-bg",
    "note-yellow", "note-green", "note-blue", "note-pink",
    "sec-1", "sec-2", "sec-3", "sec-4", "sec-5",
    "chart-rev", "chart-cost", "chart-profit", "chart-loss",
    "chart-axis", "chart-grid", "chart-label",
    "radius", "shadow-sm", "shadow", "shadow-lg",
    "hand", "sans", "mono", "serif",
    "display", "display-tracking", "display-transform",
]
COLOR_TOKENS = ["ink", "surface", "surface-2", "grid", "ink-faint",
                "green", "amber", "red"] + ["sec-%d" % i for i in range(1, 6)]

HUE_FAMILY = {"green": (70, 175), "amber": (25, 70), "red": (325, 25)}  # degrees, wraps at 360

HEX_RE = re.compile(r"#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b")
EXTERNAL_RE = re.compile(
    r"https?://(?!www\.w3\.org/2000/svg)"
    r"|@import"
    r"|url\(\s*(?!['\"]?(?:repeating-)?(?:linear|radial|conic)-gradient)")
JS_TAG_RE = re.compile(r"</[A-Za-z]")
LEFTOVER_RE = re.compile(r"/\*__|<!--__|__[A-Z][A-Z0-9_]*__")
ROOT_RE = re.compile(r":root\s*\{(.*?)\}", re.S)
DECL_RE = re.compile(r"--([A-Za-z0-9-]+)\s*:\s*([^;]+)")
ID_RE = re.compile(r'\bid="([^"]+)"')
KEY_RE = re.compile(r"LN\.data\.([A-Za-z_$][\w$]*)\s*=|LN\.data\[\s*['\"]([^'\"]+)['\"]\s*\]\s*=")
NAME_RE = re.compile(r"^[a-z][a-z0-9-]*$")


class Err:
    def __init__(self, rule, file, line, msg, hint=""):
        self.rule, self.file, self.line = rule, file, line
        self.msg, self.hint = msg, hint

    def __str__(self):
        loc = "%s:%s" % (self.file, self.line if self.line else "-")
        hint = ("  -> " + self.hint) if self.hint else ""
        return "FAIL\t%-11s %-46s %s%s" % (self.rule, loc, self.msg, hint)


def strip_comments(text):
    return re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"),
                  text, flags=re.S)


class Parts:
    """Concatenated part files with offset -> (file, line) mapping.
    spans: list of (relative_name, text), joined by single newlines."""

    def __init__(self, spans):
        self.spans = spans
        self.text = "\n".join(t for _, t in spans)

    def where(self, offset):
        pos = 0
        for name, t in self.spans:
            if offset < pos + len(t):
                return name, t.count("\n", 0, max(0, offset - pos)) + 1
            pos += len(t) + 1
        return self.spans[-1][0], 1

    def where_line(self, line):
        run = 1
        for name, t in self.spans:
            n = t.count("\n") + 1
            if line < run + n:
                return name, line - run + 1
            run += n
        return self.spans[-1][0], 1


def scan(text, regex, rule, src, msg, hint):
    errs = []
    for m in regex.finditer(text):
        if isinstance(src, Parts):
            f, ln = src.where(m.start())
        else:
            f, ln = src, text.count("\n", 0, m.start()) + 1
        errs.append(Err(rule, f, ln, "%s found: %r" % (msg, m.group(0)[:38]), hint))
    return errs


# ---------- colour maths ----------

def parse_color(v):
    v = v.strip()
    m = re.fullmatch(r"#([0-9a-fA-F]{3,8})", v)
    if m and len(m.group(1)) in (3, 4, 6, 8):
        h = m.group(1)
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (a,)
    m = re.fullmatch(r"rgba?\(([^)]+)\)", v)
    if m:
        parts = [p for p in re.split(r"[,\s/]+", m.group(1).strip()) if p]
        if len(parts) in (3, 4):
            try:
                rgb = tuple(_chan(p) for p in parts[:3])
                a = _alpha(parts[3]) if len(parts) == 4 else 1.0
                return rgb + (a,)
            except ValueError:
                return None
        return None
    m = re.fullmatch(r"hsla?\(([^)]+)\)", v)
    if m:
        parts = [p for p in re.split(r"[,\s/]+", m.group(1).strip()) if p]
        if len(parts) in (3, 4):
            try:
                h = float(parts[0].replace("deg", "")) % 360
                s = _pct(parts[1])
                l = _pct(parts[2])
                a = _alpha(parts[3]) if len(parts) == 4 else 1.0
                r, g, b = colorsys.hls_to_rgb(h / 360, l, s)
                return (r, g, b, a)
            except ValueError:
                return None
        return None
    return None


def _chan(p):
    return float(p[:-1]) / 100 if p.endswith("%") else float(p) / 255


def _pct(p):
    return float(p[:-1]) / 100 if p.endswith("%") else float(p)


def _alpha(p):
    return float(p[:-1]) / 100 if p.endswith("%") else float(p)


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _lum(col):
    r, g, b = col[:3]
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def ratio(a, b):
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def over(fg, bg):
    a = fg[3]
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3)) + (1.0,)


def parse_tokens(css):
    out = {}
    for body in ROOT_RE.findall(css):
        for m in DECL_RE.finditer(body):
            out[m.group(1)] = m.group(2).strip()
    return out


def resolve_var(tokens, name, stack=()):
    raw = tokens.get(name)
    if raw is None:
        return None, False
    v = raw.strip()
    m = re.fullmatch(r"var\((--[^) ]+)\)", v)
    if m:
        if m.group(1) in stack:
            return v, True
        return resolve_var(tokens, m.group(1)[2:], stack + (v,))
    return v, False


def check_contrast(theme_css, tune_css, errors):
    tokens = parse_tokens(theme_css)
    tokens.update(parse_tokens(tune_css))
    for t in REQUIRED_TOKENS:
        if t not in tokens:
            errors.append(Err("tokens", "palette", None,
                              "theme/tune does not define --" + t,
                              "every token from the :root block must be present"))
    palette = {}
    for t in COLOR_TOKENS:
        if t not in tokens:
            continue
        v, cycle = resolve_var(tokens, t)
        if cycle or v is None:
            errors.append(Err("contrast", "palette", None,
                              "--%s cannot be resolved" % t, "check var() references"))
            continue
        col = parse_color(v)
        if col is None:
            errors.append(Err("contrast", "palette", None,
                              "--%s is not a parseable colour: %r (gradients/transparent are not allowed here)" % (t, v[:40]),
                              "use #hex, rgb(), or hsl()"))
            continue
        palette[t] = col

    def cmp_(fg, bg, floor, label):
        if fg and bg:
            r = ratio(fg, bg)
            if r < floor:
                errors.append(Err("contrast", "palette", None,
                                  "%s ratio %.2f:1 below %.1f:1" % (label, r, floor),
                                  "adjust the --" + label.split(" vs ")[0].replace(" ", "-") + " token"))

    ink, surf, s2 = palette.get("ink"), palette.get("surface"), palette.get("surface-2")
    cmp_(ink, surf, 4.5, "ink vs surface")
    cmp_(ink, s2, 4.5, "ink vs surface-2")
    cmp_(palette.get("ink-faint"), palette.get("grid"), 3.0, "ink-faint vs grid")
    for i in range(1, 6):
        tint = palette.get("sec-%d" % i)
        if tint and ink and surf:
            comp = over(tint, surf)
            r = ratio(ink, comp)
            if r < 4.5:
                errors.append(Err("contrast", "palette", None,
                                  "ink vs sec-%d composite ratio %.2f:1 below 4.5:1" % (i, r),
                                  "reduce --sec-%d alpha or lighten it" % i))
    for name, (lo, hi) in HUE_FAMILY.items():
        col = palette.get(name)
        if not col:
            continue
        h, l, s = colorsys.rgb_to_hls(*col[:3])
        if s < 0.12:
            errors.append(Err("hue-family", "palette", None,
                              "--%s is desaturated (grey); feedback hue must stay recognisable" % name,
                              "raise saturation"))
            continue
        h *= 360
        ok = lo <= h <= hi if lo <= hi else h >= lo or h <= hi
        if not ok:
            errors.append(Err("hue-family", "palette", None,
                              "--%s hue %.0f outside family %s" % (name, h, (lo, hi)),
                              "semantics are not designable: green/amber/red families are locked"))


def check_tune(text, errors):
    body = strip_comments(text)
    stripped = re.sub(r":root\s*\{[^{}]*\}", "", body)
    leftover = stripped.strip()
    if leftover:
        m = re.search(r"\S", stripped)
        ln = stripped.count("\n", 0, m.start()) + 1 if m else None
        errors.append(Err("tune", "tune.css", ln,
                          "structural CSS in tune.css: %r" % leftover[:60],
                          "tune.css may contain :root{--token:value} overrides only"))
        return
    for body_block in re.findall(r":root\s*\{([^{}]*)\}", body):
        for decl in body_block.split(";"):
            if decl.strip() and not re.fullmatch(r"\s*--[A-Za-z0-9-]+\s*:\s*[^;}]+\s*", decl):
                errors.append(Err("tune", "tune.css", None,
                                  "non-token declaration: %r" % decl.strip()[:60],
                                  "tune.css may override token values only"))


def check_mounts(sections_src, data_text, comp_names, errors, list_label="build.json"):
    defined = set()
    for m in KEY_RE.finditer(data_text):
        defined.add(m.group(1) or m.group(2))
    sections_text = sections_src.text if isinstance(sections_src, Parts) else sections_src
    for m in re.finditer(r"data-component=", sections_text):
        if isinstance(sections_src, Parts):
            f, ln = sections_src.where(m.start())
        else:
            f, ln = "sections.html", sections_text.count("\n", 0, m.start()) + 1
        tag = sections_text[sections_text.rfind("<", 0, m.start()):
                            sections_text.find(">", m.end()) + 1]
        name = re.search(r'data-component="([^"]*)"', tag)
        key = re.search(r'data-key="([^"]*)"', tag)
        name = name.group(1) if name else "?"
        if name not in comp_names:
            errors.append(Err("data", f, ln,
                              "mount %r not in %s components" % (name, list_label),
                              "add the component or remove the mount"))
        if not key:
            errors.append(Err("data", f, ln,
                              "mount %r has no data-key" % name,
                              "add data-key=... and define LN.data.<key> in data.js"))
        elif key.group(1) not in defined:
            errors.append(Err("data", f, ln,
                              "data-key %r is not defined in data.js" % key.group(1),
                              "add LN.data.%s = {...} to data.js" % key.group(1)))


def check_prefix(shards, errors):
    for s in shards:
        for m in re.finditer(r"<section\b[^>]*>", s.html):
            tag = m.group(0)
            if not re.search(r'class="[^"]*\bblock\b[^"]*"', tag):
                continue
            im = re.search(r'\bid="([^"]*)"', tag)
            if im and not im.group(1).startswith(s.key_prefix + "."):
                errors.append(Err("prefix", s.html_rel,
                                  s.html.count("\n", 0, m.start()) + 1,
                                  "section id %r outside prefix %r" % (im.group(1), s.key_prefix + "."),
                                  "plan assigns %s.* ids to this shard" % s.key_prefix))
        for m in KEY_RE.finditer(s.js):
            key = m.group(1) or m.group(2)
            if not key.startswith(s.key_prefix):
                errors.append(Err("prefix", s.js_rel,
                                  s.js.count("\n", 0, m.start()) + 1,
                                  "data key %r outside prefix %r" % (key, s.key_prefix),
                                  "define only %s* keys in this shard" % s.key_prefix))


def check_dupe_keys(data_src, errors):
    seen = set()
    for m in KEY_RE.finditer(data_src.text):
        key = m.group(1) or m.group(2)
        if key in seen:
            f, ln = data_src.where(m.start())
            errors.append(Err("data", f, ln, "duplicate LN.data key %r" % key,
                              "each key must be assigned exactly once"))
        seen.add(key)


def check_shard_mounts(shards, errors):
    for s in shards:
        defined = set()
        for m in KEY_RE.finditer(s.js):
            defined.add(m.group(1) or m.group(2))
        for m in re.finditer(r"data-component=", s.html):
            tag = s.html[s.html.rfind("<", 0, m.start()):
                         s.html.find(">", m.end()) + 1]
            name = re.search(r'data-component="([^"]*)"', tag)
            key = re.search(r'data-key="([^"]*)"', tag)
            name = name.group(1) if name else "?"
            ln = s.html.count("\n", 0, m.start()) + 1
            if name not in s.components:
                errors.append(Err("plan", s.html_rel, ln,
                                  "mount %r not in plan components for shard %s" % (name, s.id),
                                  "shards may only mount components their plan entry lists"))
            if key and key.group(1) not in defined:
                errors.append(Err("data", s.html_rel, ln,
                                  "data-key %r not defined in this shard's data file (%s)"
                                  % (key.group(1), s.js_rel),
                                  "keys are shard-local; move the definition or rename"))


class Balance(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.problems = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID_TAGS:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in VOID_TAGS:
            return
        names = [t for t, _ in self.stack]
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
        elif tag in names:
            while self.stack and self.stack[-1][0] != tag:
                t, pos = self.stack.pop()
                self.problems.append("unclosed <%s> opened at line %d" % (t, pos[0]))
            self.stack.pop()
        else:
            self.problems.append("stray closing </%s> at line %d" % (tag, self.getpos()[0]))

    def finish(self):
        self.close()
        for t, pos in self.stack:
            self.problems.append("unclosed <%s> opened at line %d" % (t, pos[0]))


def check_wellformed(text, src, errors):
    bal = Balance()
    try:
        bal.feed(text)
        bal.finish()
    except Exception as exc:
        fname = src.spans[0][0] if isinstance(src, Parts) else src
        errors.append(Err("wellformed", fname, None, "parse error: %s" % exc, ""))
        return
    for msg in bal.problems:
        m = re.search(r"line (\d+)", msg)
        if isinstance(src, Parts) and m:
            f, ln = src.where_line(int(m.group(1)))
        else:
            f, ln = src, None
        errors.append(Err("wellformed", f, ln, msg, "balance the tags"))


def check_ids(output_text, sections_src, errors):
    seen = {}
    for m in ID_RE.finditer(output_text):
        i = m.group(1)
        ln = output_text.count("\n", 0, m.start()) + 1
        if i in seen:
            errors.append(Err("ids", "(output)", ln,
                              "duplicate id %r (first at line %d)" % (i, seen[i]),
                              "ids must be unique"))
        seen[i] = ln
    sections_text = sections_src.text if isinstance(sections_src, Parts) else sections_src
    for m in re.finditer(r"<section\b[^>]*>", sections_text):
        tag = m.group(0)
        if re.search(r'class="[^"]*\bblock\b[^"]*"', tag):
            if isinstance(sections_src, Parts):
                f, ln = sections_src.where(m.start())
            else:
                f, ln = "sections.html", sections_text.count("\n", 0, m.start()) + 1
            im = re.search(r'\bid="([^"]*)"', tag)
            if not im:
                errors.append(Err("ids", f, ln,
                                  "section.block without id",
                                  "every section needs id= for the TOC"))
            elif im.group(1).lower().startswith("ln"):
                errors.append(Err("ids", f, ln,
                                  "reserved id prefix 'ln': %r" % im.group(1),
                                  "lesson ids must not start with ln"))


def check_js(text, fname):
    return scan(text, JS_TAG_RE, "js", fname, "literal closing tag in script",
                "escape as <\\/ or build nodes with LN.h/LN.s")


SHARD_ID_RE = re.compile(r"^(?:[0-9]{1,2}G?|G)$")
KEY_PREFIX_RE = re.compile(r"^s[0-9A-Z][0-9A-Z-]*$")


def load_plan(workdir, errors):
    p = workdir / "plan.json"
    try:
        plan = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(Err("plan", "plan.json", getattr(exc, "lineno", None),
                          "cannot parse plan.json: %s" % exc, "fix the JSON"))
        return None
    if (not isinstance(plan, dict) or not isinstance(plan.get("shards"), list)
            or not plan["shards"]):
        errors.append(Err("plan", "plan.json", None,
                          "plan.json must be an object with a non-empty 'shards' list",
                          "see spec 2026-09-16 chunked-subagent design 4"))
        return None
    return plan


class Shard:
    def __init__(self, sid, key_prefix, html_rel, js_rel, components):
        self.id, self.key_prefix = sid, key_prefix
        self.html_rel, self.js_rel = html_rel, js_rel
        self.components = list(components or [])
        self.html, self.js = "", ""


def validate_plan(plan, workdir, cfg, errors, scope=None):
    shards, claimed, seen_ids = [], {}, set()
    for ent in plan["shards"]:
        if scope is not None and (not isinstance(ent, dict)
                                  or ent.get("id") != scope):
            continue  # during --lint, siblings may be in any state
        where = "plan.json shard %r" % (ent.get("id") if isinstance(ent, dict) else ent)
        if (not isinstance(ent, dict)
                or not all(k in ent for k in ("id", "files", "key_prefix", "components"))):
            errors.append(Err("plan", "plan.json", None,
                              "shard entry needs id, files, key_prefix, components: %s" % where, ""))
            continue
        sid, kp = ent["id"], ent["key_prefix"]
        if not isinstance(sid, str) or not SHARD_ID_RE.match(sid):
            errors.append(Err("plan", "plan.json", None,
                              "bad shard id %r (must be a string: \"0\", \"1\".., \"G\", \"0G\")" % sid, ""))
            continue
        if sid in seen_ids:
            errors.append(Err("plan", "plan.json", None, "duplicate shard id %r" % sid, ""))
            continue
        seen_ids.add(sid)
        if not isinstance(kp, str) or not KEY_PREFIX_RE.match(kp):
            errors.append(Err("plan", "plan.json", None,
                              "bad key_prefix %r for shard %s (s<UPPER_ALNUM>)" % (kp, sid), ""))
            continue
        files = ent["files"]
        if (not isinstance(files, list) or len(files) != 2
                or not any(str(f).startswith("sections/") and str(f).endswith(".html") for f in files)
                or not any(str(f).startswith("data/") and str(f).endswith(".js") for f in files)):
            errors.append(Err("plan", "plan.json", None,
                              "shard %s files must be [sections/X.html, data/X.js]" % sid, ""))
            continue
        hrel = next(f for f in files if str(f).startswith("sections/"))
        jrel = next(f for f in files if str(f).startswith("data/"))
        if Path(hrel).stem != Path(jrel).stem:
            errors.append(Err("plan", "plan.json", None,
                              "shard %s: file stems differ (%s / %s)" % (sid, hrel, jrel), ""))
            continue
        if hrel in claimed or jrel in claimed:
            errors.append(Err("plan", "plan.json", None, "file claimed twice: %s" % hrel, ""))
            continue
        texts = {}
        ok = True
        for rel in (hrel, jrel):
            f = workdir / rel
            if not f.is_file():
                errors.append(Err("plan", rel, None,
                                  "shard %s file %s missing in workdir" % (sid, rel), ""))
                ok = False
            else:
                texts[rel] = read_text(f, errors)
                if texts[rel] is None:
                    ok = False
        if not ok:
            continue
        for c in ent["components"]:
            if c not in cfg.get("components", []):
                errors.append(Err("plan", "plan.json", None,
                                  "shard %s declares component %r absent from build.json"
                                  % (sid, c), "add it to build.json components"))
        claimed[hrel] = claimed[jrel] = sid
        s = Shard(sid, kp, hrel, jrel, ent["components"])
        s.html, s.js = texts[hrel], texts[jrel]
        shards.append(s)
    if scope is None:  # whole-build sweeps; skipped for --lint per spec 3b
        for d in ("sections", "data"):
            dirp = workdir / d
            if dirp.is_dir():
                suffix = ".html" if d == "sections" else ".js"
                for f in sorted(dirp.glob("*" + suffix)):
                    rel = "%s/%s" % (d, f.name)
                    if rel not in claimed:
                        errors.append(Err("plan", rel, None,
                                          "shard file %s not claimed by any plan.json shard" % rel,
                                          "add a shard entry for it"))
        for k in ("title", "theme"):
            if k in plan and cfg.get(k) is not None and plan[k] != cfg[k]:
                errors.append(Err("plan", "plan.json", None,
                                  "plan.json %s %r != build.json %r" % (k, plan[k], cfg[k]),
                                  "single source of truth: build.json"))
    return shards


def collect_parts(shards):
    return (Parts([(s.html_rel, s.html) for s in sorted(shards, key=lambda x: x.html_rel)]),
            Parts([(s.js_rel, s.js) for s in sorted(shards, key=lambda x: x.js_rel)]))


def read_text(path, errors):
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        errors.append(Err("files", path.name, None, "cannot read %s" % path, ""))
        return None


def assemble(workdir, skeleton):
    errors = []
    cfg_path = workdir / "build.json"
    cfg = None
    if cfg_path.exists():
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(Err("build.json", "build.json", exc.lineno,
                              "invalid JSON: %s" % exc.msg, "fix the syntax"))
    else:
        errors.append(Err("build.json", "build.json", None, "missing",
                          "workdir needs build.json, tune.css, sections.html, data.js"))
    if cfg is not None and not isinstance(cfg, dict):
        errors.append(Err("build.json", "build.json", None, "must be a JSON object", ""))
        cfg = None
    if cfg is not None:
        for k in ("title", "theme", "components", "output"):
            if not cfg.get(k):
                errors.append(Err("build.json", "build.json", None,
                                  "missing/empty required key %r" % k,
                                  "required: title, theme, components, output"))
        unknown = set(cfg) - {"title", "theme", "components", "output", "extra_css", "extra_js"}
        if unknown:
            errors.append(Err("build.json", "build.json", None,
                              "unknown keys: %s" % ", ".join(sorted(unknown)),
                              "allowed: title, theme, components, output, extra_css, extra_js"))
        if not isinstance(cfg.get("components"), list) or not cfg.get("components"):
            errors.append(Err("build.json", "build.json", None,
                              "components must be a non-empty list", ""))
            cfg["components"] = []
    if errors:
        return None, errors

    themes_dir = skeleton / "themes"
    comps_dir = skeleton / "components"
    available = sorted(p.stem for p in themes_dir.glob("*.css"))
    if cfg["theme"] not in available:
        errors.append(Err("theme", "build.json", None,
                          "unknown theme %r; available: %s" % (cfg["theme"], ", ".join(available)),
                          "pick one of the shipped theme packs"))
    comp_names = sorted(d.name for d in comps_dir.iterdir()
                        if d.is_dir() and (d / "component.css").exists()
                        and (d / "component.js").exists())
    for c in cfg["components"]:
        if not isinstance(c, str) or not NAME_RE.match(c):
            errors.append(Err("component", "build.json", None,
                              "bad component name %r" % c,
                              "use lowercase folder names, e.g. break-even-lab"))
        elif c not in comp_names:
            errors.append(Err("component", "build.json", None,
                              "unknown component %r; available: %s" % (c, ", ".join(comp_names) or "(none)"),
                              "see skeleton/components/registry.md"))

    parts = {}
    f = workdir / "tune.css"
    if not f.exists():
        errors.append(Err("files", "tune.css", None, "missing in workdir",
                          "the 4 required files are build.json, tune.css, sections.html, data.js"))
    else:
        parts["tune"] = read_text(f, errors)

    has_shards = (workdir / "sections").is_dir() or (workdir / "data").is_dir()
    shards = []
    plan = load_plan(workdir, errors) if (workdir / "plan.json").exists() else None
    if plan is not None:
        shards = validate_plan(plan, workdir, cfg, errors)
        if not has_shards:
            errors.append(Err("plan", "plan.json", None,
                              "plan.json present but no sections/ or data/ directory", ""))
        for fname in ("sections.html", "data.js"):
            if (workdir / fname).exists():
                errors.append(Err("files", fname, None,
                                  "monolith %s alongside shard layout" % fname,
                                  "delete %s; shards are the source" % fname))
        if not errors:
            parts["sections"], parts["data"] = collect_parts(shards)
    else:
        if has_shards:
            errors.append(Err("plan", "plan.json", None,
                              "shard directories present but no usable plan.json",
                              "fan-out builds need plan.json (spec 2026-09-16 3)"))
        for key, fname in (("sections", "sections.html"), ("data", "data.js")):
            f = workdir / fname
            if not f.exists():
                errors.append(Err("files", fname, None, "missing in workdir",
                                  "monolith build needs sections.html + data.js; "
                                  "fan-out needs plan.json + sections/ + data/"))
            else:
                t = read_text(f, errors)
                if t is not None:
                    parts[key] = Parts([(fname, t)])
    shell = read_text(skeleton / "shell.html", errors)
    if shell is None:
        errors.append(Err("files", "skeleton/shell.html", None, "missing", ""))

    extras = {"extra_css": [], "extra_js": []}
    for cfg_key in ("extra_css", "extra_js"):
        v = cfg.get(cfg_key)
        if v:
            f = workdir / v
            if not f.exists():
                errors.append(Err("files", v, None, "%s declared in build.json but missing" % cfg_key,
                                  "create the file or drop the key"))
            else:
                extras[cfg_key].append((v, read_text(f, errors)))

    if errors or shell is None:
        return None, errors

    for marker in MARKERS:
        n = shell.count(marker)
        if n < 1 or (n != 1 and marker != "__TITLE__"):
            errors.append(Err("markers", "skeleton/shell.html", None,
                              "marker %s occurs %d times" % (marker, n),
                              "every marker exactly once; title may appear in more than one slot"))

    theme_css = read_text(themes_dir / (cfg["theme"] + ".css"), errors) or ""
    check_tune(parts["tune"], errors)
    check_mounts(parts["sections"], parts["data"].text, set(cfg["components"]), errors)
    check_dupe_keys(parts["data"], errors)
    if shards:
        check_prefix(shards, errors)
        check_shard_mounts(shards, errors)
    check_wellformed(parts["sections"].text, parts["sections"], errors)
    errors.extend(check_js(parts["data"].text, "data.js"))
    errors.extend(scan(parts["sections"].text, HEX_RE, "hex", parts["sections"],
                       "hard-coded colour", "sections use classes; colours come from tokens"))
    errors.extend(scan(parts["data"].text, HEX_RE, "hex", parts["data"],
                       "hard-coded colour in data", "data carries content, not colours"))

    comp_css, comp_js = [], []
    for c in cfg["components"]:
        cd = comps_dir / c
        css_t = read_text(cd / "component.css", errors) or ""
        js_t = read_text(cd / "component.js", errors) or ""
        errors.extend(scan(css_t, HEX_RE, "hex", "%s/component.css" % c,
                           "hard-coded colour", "use var(--token)"))
        errors.extend(scan(css_t, EXTERNAL_RE, "external", "%s/component.css" % c,
                           "external asset", "textures must be pure CSS"))
        errors.extend(check_js(js_t, "%s/component.js" % c))
        comp_css.append("/* component: %s */\n%s" % (c, css_t))
        comp_js.append("%s\n" % js_t.strip())
    for fname, text in extras["extra_css"]:
        errors.extend(scan(text, HEX_RE, "hex", fname, "hard-coded colour",
                           "extra.css is component-level CSS: var(--token) only"))
        comp_css.append("/* extra: %s */\n%s" % (fname, text))
    for fname, text in extras["extra_js"]:
        errors.extend(check_js(text, fname))
        comp_js.append("%s\n" % text.strip())

    shell_for_hex = re.sub(r"/\*HEXOK\*/.*?/\*ENDHEX\*/",
                           lambda m: "\n" * m.group(0).count("\n"), shell, flags=re.S)
    errors.extend(scan(shell_for_hex, HEX_RE, "hex", "skeleton/shell.html",
                       "hard-coded colour outside print block",
                       "move it into a theme pack"))
    for text, fname in [(theme_css, "themes/%s.css" % cfg["theme"]),
                        (parts["tune"], "tune.css"), (parts["sections"].text, parts["sections"]),
                        (parts["data"].text, parts["data"]), (shell, "skeleton/shell.html")] + \
                       [(t, f) for f, t in extras["extra_css"] + extras["extra_js"]]:
        errors.extend(scan(text, EXTERNAL_RE, "external", fname,
                           "external asset", "no http, no @import, gradient-only url()"))

    title = html.escape(str(cfg["title"]), quote=True)
    out = shell.replace("__TITLE__", title)
    out = out.replace("/*__THEME__*/", theme_css)
    out = out.replace("/*__TUNE__*/", parts["tune"])
    out = out.replace("/*__COMPONENT_CSS__*/", "\n".join(comp_css))
    out = out.replace("<!--__SECTIONS__-->", parts["sections"].text)
    out = out.replace("/*__DATA__*/", parts["data"].text)
    out = out.replace("/*__COMPONENT_JS__*/", "\n".join(comp_js) + GLUE_JS)

    errors.extend(scan(out, LEFTOVER_RE, "markers", "(output)",
                       "unsubstituted marker", "check the shell marker table"))
    check_wellformed(out, "(output)", errors)
    check_ids(out, parts["sections"], errors)
    check_contrast(theme_css, parts["tune"], errors)
    if "@media print" not in out:
        errors.append(Err("print", "skeleton/shell.html", None,
                          "no @media print block found",
                          "shell must ship the mandatory print override"))

    if errors:
        return None, errors
    return out, errors


def lint_shard(workdir, shard_id):
    errors = []
    cfg_path = workdir / "build.json"
    if not cfg_path.is_file():
        return [Err("build.json", "build.json", None, "missing", "")]
    try:
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [Err("build.json", "build.json", exc.lineno,
                    "invalid JSON: %s" % exc.msg, "")]
    if not isinstance(cfg, dict):
        return [Err("build.json", "build.json", None, "must be a JSON object", "")]
    plan = load_plan(workdir, errors)
    if plan is None:
        return errors
    shards = validate_plan(plan, workdir, cfg, errors, scope=shard_id)
    if errors:
        return errors
    target = shards[0] if shards else None
    if target is None:
        return errors + [Err("plan", "plan.json", None,
                             "no shard %r in plan; ids: %s"
                             % (shard_id, ", ".join(str(e.get("id"))
                                                    for e in plan["shards"]
                                                    if isinstance(e, dict))), "")]
    hs = Parts([(target.html_rel, target.html)])
    errs = []
    errs.extend(scan(hs.text, HEX_RE, "hex", hs, "hard-coded colour",
                     "sections use classes; colours come from tokens"))
    errs.extend(scan(target.js, HEX_RE, "hex", target.js_rel, "hard-coded colour in data",
                     "data carries content, not colours"))
    errs.extend(scan(hs.text, EXTERNAL_RE, "external", hs, "external asset",
                     "no http, no @import, gradient-only url()"))
    errs.extend(scan(target.js, EXTERNAL_RE, "external", target.js_rel, "external asset",
                     "no http, no @import, gradient-only url()"))
    errs.extend(check_js(target.js, target.js_rel))
    check_wellformed(target.html, hs, errs)
    check_mounts(hs, target.js, set(target.components), errs,
                 list_label="plan components for shard %s" % shard_id)
    check_shard_mounts([target], errs)
    check_prefix([target], errs)
    out, seen = [], set()
    for e in errs:
        key = (e.rule, e.file, e.line, e.msg)
        if key not in seen:
            seen.add(key)
            out.append(e)
    return out


def report(errors):
    for e in errors:
        print(str(e))


def main(argv=None):
    try:  # Windows consoles default to cp1252
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    argv = list(sys.argv[1:] if argv is None else argv)
    skeleton = Path(__file__).resolve().parent / "skeleton"
    lint_id = None
    if "--skeleton" in argv:
        i = argv.index("--skeleton")
        if i + 1 >= len(argv):
            print("FAIL\tusage: build.py <workdir> [--skeleton DIR] [--lint SHARD_ID]")
            return 2
        skeleton = Path(argv[i + 1])
        del argv[i:i + 2]
    if "--lint" in argv:
        i = argv.index("--lint")
        if i + 1 >= len(argv):
            print("FAIL\tusage: build.py <workdir> [--skeleton DIR] [--lint SHARD_ID]")
            return 2
        lint_id = argv[i + 1]
        del argv[i:i + 2]
    if len(argv) != 1 or not Path(argv[0]).is_dir():
        print("usage: python build.py <workdir> [--skeleton DIR] [--lint SHARD_ID]")
        return 2
    workdir = Path(argv[0]).resolve()
    if lint_id is not None:
        lerrs = lint_shard(workdir, lint_id)
        if lerrs:
            report(lerrs)
            print("FAIL - lint shard %s: %d problem(s)" % (lint_id, len(lerrs)))
            return 1
        print("LINT OK - shard %s clean" % lint_id)
        return 0
    out, errors = assemble(workdir, skeleton)
    if errors:
        report(errors)
        print("FAIL - %d problem(s); no output written." % len(errors))
        return 1
    cfg = json.loads((workdir / "build.json").read_text(encoding="utf-8"))
    out_path = Path(cfg["output"])
    if not out_path.is_absolute():
        out_path = workdir / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(out, encoding="utf-8", newline="\n")
    print("OK - wrote %s (%d lines)" % (out_path, out.count("\n") + 1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
