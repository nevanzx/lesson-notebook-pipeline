#!/usr/bin/env python3
"""Interactive Lesson Notebook v2.9 - parts assembler + mechanical validator.

Usage:
    python build.py <workdir> [--skeleton <dir>]

Reads <workdir>/{build.json, tune.css, sections.html | parts/, data.js | parts/
[, outline.json, extra.css, extra.js]} and injects them into the shell at
skeleton/shell.html. If sections.html/data.js are absent, they are merged in
sorted order from <workdir>/parts/*.sections.html and parts/*.data.js. If
outline.json is present, every section.block id must appear in it exactly once
(no phantom sections), every outline entry must ship, each section carries
exactly one h2 whose text equals the outline heading, and every maps_to title
must be a verbatim source title from source_titles. Exit 0 and the output file
are produced only when every mechanical QA rule passes; otherwise an itemized
FAIL report prints (rule, file, line, message, fix hint) and exit is 1, with no
partial output. The output notebook (and only it) is written relative to the
CURRENT DIRECTORY the command runs in, never into the workdir; an absolute
"output" in build.json is honoured as-is. Python 3 stdlib; assignment builds additionally need the ``cryptography`` package. Assignment questions ship AES-256-GCM ciphertext (key: build/key/unlock.key).
"""
import base64
import colorsys
import hashlib
import html
import json
import os
import re
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

_TOOLS_DIR = Path(__file__).resolve().parent / "tools"
if str(_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOLS_DIR))

import prose_lint  # noqa: E402
import pacing_lint  # noqa: E402

VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input",
             "link", "meta", "param", "source", "track", "wbr"}

MARKERS = [
    "__TITLE__", "/*__THEME__*/", "/*__TUNE__*/", "/*__COMPONENT_CSS__*/",
    "<!--__SECTIONS__-->", "/*__DATA__*/", "/*__COMPONENT_JS__*/", "__META__",
    "/*__LAYOUT_CSS__*/", "<!--__LAYOUT_CHROME__-->", "/*__LAYOUT_JS__*/",
    "__LAYOUT__",
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

# Hard-coded colour guard. The (?<!&) lookbehind is load-bearing: a numeric
# character reference such as &#916; (Delta), &#8722; (minus) or &#8776;
# (almost-equal) used in MathML looks exactly like a 3/4/6-digit hex colour to
# this pattern and used to fail the build with bogus "hard-coded colour" errors.
# A colour never follows "&", so excluding that case removes the false positive
# without weakening the real check.
HEX_RE = re.compile(r"(?<!&)#[0-9a-fA-F]{8}\b|(?<!&)#[0-9a-fA-F]{6}\b"
                    r"|(?<!&)#[0-9a-fA-F]{4}\b|(?<!&)#[0-9a-fA-F]{3}\b")
EXTERNAL_RE = re.compile(
    r"https?://(?!www\.w3\.org/2000/svg)"
    r"|@import"
    r"|url\(\s*(?!['\"]?(?:repeating-)?(?:linear|radial|conic)-gradient)")
JS_TAG_RE = re.compile(r"</[A-Za-z]")
GRID_TPL_RE = re.compile(r"grid-template-(?:columns|rows)\s*:\s*([^;}]+)")
MINMAX0_RE = re.compile(r"minmax\(\s*0\s*,[^)]*\)")
FR_RE = re.compile(r"(?<![\w-])(?:\d+(?:\.\d+)?|)\.?\d*fr\b")
LEFTOVER_RE = re.compile(r"/\*__|<!--__|__[A-Z][A-Z0-9_]*__")
ROOT_RE = re.compile(r":root\s*\{(.*?)\}", re.S)
DECL_RE = re.compile(r"--([A-Za-z0-9-]+)\s*:\s*([^;]+)")
ID_RE = re.compile(r'\bid="([^"]+)"')
KEY_RE = re.compile(r"LN\.data\.([A-Za-z_$][\w$]*)\s*=|LN\.data\[\s*['\"]([^'\"]+)['\"]\s*\]\s*=")
NAME_RE = re.compile(r"^[a-z][a-z0-9-]*$")
# Build-provenance guard (v2.21). Narrating where the notebook's text came from
# must never reach a part; the source-type declaration lives in src/full.txt and
# the opening message only. Every alternative is context-bounded so ordinary
# subject-matter prose (a real "Source: BSP Circular 808" citation, "carried no
# body of evidence", "heat not extracted", "its specification source") does not match.
PROVENANCE_RE = re.compile(
    r"(?<![\w-])authored\s+teaching\s+text"
    r"|\b(?:is|are|was|were)\s+authored\b(?=[^.\n]{0,40}\b(?:for\s+the\s+(?:course|class)\b(?!\s+of\b)|teaching\s+text|not\s+extracted)\b)"
    r"|authored[^.\n]{0,60}?not\s+extracted"
    r"|carried\s+no\s+teaching\s+body"
    r"|\b(?:is|was)\s+(?:a\s+|the\s+)?specification\s+source\b"
    r"|\bsource\s*:\s*(?:specification|teaching)\b"
    r"|written\s+against\s+the\s+standards"
    r"|this\s+week'?s\s+text\s+is\s+written"
    r"|authored\s+against\s+the\s+standards"
    r"|<(?:strong|b)(?:\s[^>]*)?>\s*Sourcing\.",
    re.I)

# Content-kind colour system (v2.39). A definition box must declare what it is;
# the shell maps each kind to one fixed pastel so a hue never changes meaning.
DEF_KINDS = {"concept", "formula", "example", "caution", "insight", "neutral"}
DEF_OPEN_RE = re.compile(
    r'<div\b[^>]*\bclass="[^"]*(?<![\w-])def(?![\w-])[^"]*"[^>]*>', re.I)


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


def scan(text, regex, rule, fname, msg, hint):
    errs = []
    for m in regex.finditer(text):
        errs.append(Err(rule, fname, text.count("\n", 0, m.start()) + 1,
                        "%s found: %r" % (msg, m.group(0)[:38]), hint))
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


def check_mounts(sections_text, data_text, comp_names, errors):
    defined = set()
    key_count = {}
    for m in KEY_RE.finditer(data_text):
        k = m.group(1) or m.group(2)
        key_count[k] = key_count.get(k, 0) + 1
        defined.add(k)
    for k, c in sorted(key_count.items()):
        if c > 1:
            errors.append(Err("data", "data.js", None,
                              "LN.data.%s defined %d times" % (k, c),
                              "parts collision: prefix every key with your section id"))
    for m in re.finditer(r"data-component=", sections_text):
        ln = sections_text.count("\n", 0, m.start()) + 1
        tag = sections_text[sections_text.rfind("<", 0, m.start()):
                            sections_text.find(">", m.end()) + 1]
        name = re.search(r'data-component="([^"]*)"', tag)
        key = re.search(r'data-key="([^"]*)"', tag)
        name = name.group(1) if name else "?"
        if name not in comp_names:
            errors.append(Err("data", "sections.html", ln,
                              "mount %r not in build.json components" % name,
                              "add the component or remove the mount"))
        if not key:
            errors.append(Err("data", "sections.html", ln,
                              "mount %r has no data-key" % name,
                              "add data-key=... and define LN.data.<key> in data.js"))
        elif key.group(1) not in defined:
            errors.append(Err("data", "sections.html", ln,
                              "data-key %r is not defined in data.js" % key.group(1),
                              "add LN.data.%s = {...} to data.js" % key.group(1)))


_PRAC_A_RE = re.compile(r"\ba:\s*(-?\d+(?:\.\d+)?)")
_PRAC_Q_RE = re.compile(r"\bq:\s*[\"']")
_PRAC_TITLE_RE = re.compile(r"\btitle:")


def _js_value_span(data_text, key):
    """Raw text of the LN.data.<key> = … value up to the next LN.data assignment."""
    m = re.search(r"LN\.data\." + re.escape(key) + r"\s*=\s*", data_text)
    if not m:
        return None
    start = m.end()
    nxt = re.search(r"LN\.data\.[A-Za-z0-9_]+", data_text[start:])
    end = start + (nxt.start() if nxt else len(data_text) - start)
    return data_text[start:end]


def check_practice(sections_text, data_text, errors):
    """Step-solver/practice hygiene (v2.18): numeric answers, 2-dp rounding,
    and 4-6 problems for a practice-set array (SKILL §2.4b)."""
    keycomp = {}
    for m in re.finditer(r"data-component=", sections_text):
        tag = sections_text[sections_text.rfind("<", 0, m.start()):
                            sections_text.find(">", m.end()) + 1]
        name = re.search(r'data-component="([^"]*)"', tag)
        key = re.search(r'data-key="([^"]*)"', tag)
        if name and key:
            keycomp.setdefault(key.group(1), name.group(1))
    for key, comp in sorted(keycomp.items()):
        if comp != "step-solver":
            continue
        span = _js_value_span(data_text, key)
        if span is None:
            continue
        is_array = span.lstrip()[:1] == "["
        if is_array:
            for m in _PRAC_A_RE.finditer(span):
                val = m.group(1)
                if "." in val and len(val.split(".")[1]) > 2:
                    errors.append(Err("practice", "data.js", None,
                                      "step-solver %s: answer %s has more than 2 decimals"
                                      % (key, val),
                                      "round answers to two decimal places, tol:0.01"))
            nex = len(_PRAC_TITLE_RE.findall(span)) or len(re.findall(r"\bstory:", span))
            if nex and not (4 <= nex <= 6):
                errors.append(Err("practice", "data.js", None,
                                  "practice set %s has %d problems (need 4-6)" % (key, nex),
                                  "ship 4-6 practice problems per calculation section"))
        nq = len(_PRAC_Q_RE.findall(span))
        na = len(_PRAC_A_RE.findall(span))
        if na < nq:
            errors.append(Err("practice", "data.js", None,
                              "step-solver %s: %d question(s) but %d numeric answer(s)"
                              % (key, nq, na),
                              "every step needs a numeric a: (and tol:)"))


def check_provenance(sections_text, data_text, errors):
    """Build-provenance narration must never reach a part (SKILL §9.1, v2.21):
    no statement of where the notebook's text came from or how it was authored.
    The source-type declaration lives in src/full.txt and the opening message
    only, never in a shipped section or its data."""
    hint = ("remove build-provenance narration — the source-type declaration "
            "belongs in the opening message and src/full.txt, never in a part")
    errors.extend(scan(sections_text, PROVENANCE_RE, "provenance",
                       "sections.html", "build-provenance narration", hint))
    errors.extend(scan(data_text, PROVENANCE_RE, "provenance",
                       "data.js", "build-provenance narration", hint))


def check_def_kinds(sections_text, errors):
    """Every .def declares its content kind so the shared pastel palette has
    one meaning per hue (v2.39). A missing or unknown kind fails the build."""
    for m in DEF_OPEN_RE.finditer(sections_text):
        tag = m.group(0)
        ln = sections_text.count("\n", 0, m.start()) + 1
        km = re.search(r'\bdata-kind="([^"]*)"', tag)
        if not km:
            errors.append(Err("def-kind", "sections.html", ln,
                              ".def block missing data-kind",
                              'add data-kind="concept|formula|example|caution|insight|neutral"'))
        elif km.group(1) not in DEF_KINDS:
            errors.append(Err("def-kind", "sections.html", ln,
                              ".def block has unknown data-kind %r" % km.group(1),
                              "use one of: " + ", ".join(sorted(DEF_KINDS))))


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


def check_wellformed(text, fname, errors):
    bal = Balance()
    try:
        bal.feed(text)
        bal.finish()
    except Exception as exc:
        errors.append(Err("wellformed", fname, None, "parse error: %s" % exc, ""))
        return
    for msg in bal.problems:
        errors.append(Err("wellformed", fname, None, msg, "balance the tags"))


def check_ids(output_text, sections_text, errors):
    seen = {}
    for m in ID_RE.finditer(output_text):
        i = m.group(1)
        ln = output_text.count("\n", 0, m.start()) + 1
        if i in seen:
            errors.append(Err("ids", "(output)", ln,
                              "duplicate id %r (first at line %d)" % (i, seen[i]),
                              "ids must be unique"))
        seen[i] = ln
    for m in re.finditer(r"<section\b[^>]*>", sections_text):
        tag = m.group(0)
        if re.search(r'class="[^"]*\bblock\b[^"]*"', tag):
            ln = sections_text.count("\n", 0, m.start()) + 1
            im = re.search(r'\bid="([^"]*)"', tag)
            if not im:
                errors.append(Err("ids", "sections.html", ln,
                                  "section.block without id",
                                  "every section needs id= for the TOC"))
            elif im.group(1).lower().startswith("ln"):
                errors.append(Err("ids", "sections.html", ln,
                                  "reserved id prefix 'ln': %r" % im.group(1),
                                  "lesson ids must not start with ln"))


def check_js(text, fname):
    return scan(text, JS_TAG_RE, "js", fname, "literal closing tag in script",
                "escape as <\\/ or build nodes with LN.h/LN.s")


def norm_heading(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text))).strip()


def merge_parts(workdir, fname, suffix, errors):
    """Return (text, source_name): the monolith if present, else parts/*suffix
    concatenated in sorted filename order."""
    mono = workdir / fname
    frags = sorted((workdir / "parts").glob("*" + suffix)) if (workdir / "parts").is_dir() else []
    if mono.exists() and frags:
        errors.append(Err("files", fname, None,
                          "both %s and %d parts/*%s files exist" % (fname, len(frags), suffix),
                          "keep one: the monolith, or the parts (assembler merges parts)"))
        return None
    if mono.exists():
        return read_text(mono, errors)
    if frags:
        chunks = []
        for f in frags:
            t = read_text(f, errors)
            if t is not None:
                chunks.append("<!-- part: %s -->\n%s" % (f.name, t) if fname.endswith(".html")
                              else "/* part: %s */\n%s" % (f.name, t))
        return "\n".join(chunks)
    errors.append(Err("files", fname, None, "missing (no %s and no parts/*%s)" % (fname, suffix),
                      "write the parts files, or the monolith"))
    return None


def norm_author(s):
    s = s.lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\b(and|et|al|the)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


REF_POOL_CAP = 12      # works the Wave 0 pool (root refs.json) may carry
REF_SIDECAR_CAP = 6    # cited works one section sidecar may list
REF_FALLBACK = 2       # out-of-pool works one section sidecar may add


def ref_signature(text):
    """(normalized author, year) parsed from an APA-7 reference entry."""
    ym = re.search(r"\((\d{4}[a-z]?|n\.d\.)\)", text)
    if ym:
        return norm_author(text[:ym.start()].strip().rstrip(".")), ym.group(1)
    return norm_author(text), ""


def load_ref_file(path, errors):
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, OSError) as exc:
        errors.append(Err("references", path.name, None,
                          "unreadable/invalid JSON: %s" % exc, ""))
        return []
    items = data.get("refs") if isinstance(data, dict) else data
    if not isinstance(items, list):
        errors.append(Err("references", path.name, None,
                          'must be a list or {"refs":[...]}',
                          'use {"refs":[{"key":"...","text":"..."}]}'))
        return []
    out = []
    for i, it in enumerate(items):
        if not isinstance(it, dict) or not str(it.get("key", "")).strip() \
                or not str(it.get("text", "")).strip():
            errors.append(Err("references", path.name, None,
                              "ref #%d needs non-empty key and text" % (i + 1), ""))
            continue
        out.append({"key": str(it["key"]).strip(), "text": str(it["text"]).strip()})
    return out


def merge_refs(workdir, errors):
    files = []
    root = workdir / "refs.json"
    pool_sigs = set()
    if root.exists():
        pool = load_ref_file(root, errors)
        pool_sigs = {ref_signature(r["text"]) for r in pool}
        if len(pool_sigs) > REF_POOL_CAP:
            errors.append(Err(
                "references", "refs.json", None,
                "%d distinct works in the pool - the cap is %d"
                % (len(pool_sigs), REF_POOL_CAP),
                "search once at Wave 0 (%d caps it), then sections cite from "
                "the pool instead of searching again" % REF_POOL_CAP))
        files.append(root)
    pdir = workdir / "parts"
    if pdir.is_dir():
        files.extend(sorted(pdir.glob("*.refs.json")))
    refs, by_key, by_sig = [], {}, {}
    for f in files:
        items = load_ref_file(f, errors)
        if f != root:
            if len(items) > REF_SIDECAR_CAP:
                errors.append(Err(
                    "references", f.name, None,
                    "%d refs in one sidecar - the cap is %d"
                    % (len(items), REF_SIDECAR_CAP),
                    "cite from the shared refs.json pool instead of "
                    "re-verifying works per section"))
            if pool_sigs:
                outside = [r for r in items
                           if ref_signature(r["text"]) not in pool_sigs]
                if len(outside) > REF_FALLBACK:
                    errors.append(Err(
                        "references", f.name, None,
                        "%d out-of-pool refs in one sidecar - the fallback is %d"
                        % (len(outside), REF_FALLBACK),
                        "cite from the pool, or report the missing work back "
                        "so Wave 0 extends it; never re-verify per section"))
        for r in items:
            if r["key"] in by_key:
                if by_key[r["key"]]["text"] != r["text"]:
                    errors.append(Err("references", f.name, None,
                                      "duplicate ref key %r with different text"
                                      % r["key"], "give each work a unique key"))
                continue
            sig = ref_signature(r["text"])
            if sig in by_sig:
                if by_sig[sig]["text"] != r["text"]:
                    errors.append(Err(
                        "references", f.name, None,
                        "duplicate work %r (same author/year) with different text"
                        % r["key"],
                        "keep one entry under a shared key and cite it"))
                by_key.setdefault(r["key"], r)
                continue
            by_key[r["key"]] = r
            by_sig[sig] = r
            refs.append(r)
    refs.sort(key=lambda r: ref_signature(r["text"]))
    return refs


def _ref_text_html(text):
    out = html.escape(text, quote=False)
    return out.replace("&lt;em&gt;", "<em>").replace("&lt;/em&gt;", "</em>")


def render_references(title, refs):
    lis = "\n".join("    <li>%s</li>" % _ref_text_html(r["text"]) for r in refs)
    return ('<section class="block" id="references">\n'
            '  <h2>%s</h2>\n'
            '  <ul class="refs">\n%s\n  </ul>\n</section>'
            % (html.escape(title, quote=False), lis))


def references_title(workdir, errors):
    opath = workdir / "outline.json"
    if not opath.exists():
        return None
    try:
        outline = json.loads(opath.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, OSError):
        return None
    secs = outline.get("sections") if isinstance(outline, dict) else None
    if not isinstance(secs, list):
        return None
    for s in secs:
        if isinstance(s, dict) and str(s.get("id")) == "references":
            return str(s.get("title", "References"))
    errors.append(Err("references", "outline.json", None,
                      "outline has no references section",
                      'add {"id":"references","title":"N  References","from":[]}'))
    return None


IN_TEXT_PAREN_RE = re.compile(r"\(([^()]{0,200})\)")
CITE_PART_RE = re.compile(
    r"^([A-Za-z][\w'’\-.\s&]*(?:et al\.)?)\s*,\s*(\d{4}[a-z]?|n\.d\.)")
NARRATIVE_RE = re.compile(
    r"\b([A-Z][\w'’\-]+(?:\s+(?:et al\.|and\s+[A-Z][\w'’\-]+"
    r"|&\s+[A-Z][\w'’\-]+))?)\s+\((\d{4}[a-z]?|n\.d\.)\)")


def in_text_citations(sections_text):
    sections_text = html.unescape(sections_text)
    cites = set()
    for m in IN_TEXT_PAREN_RE.finditer(sections_text):
        for part in m.group(1).split(";"):
            cm = CITE_PART_RE.match(part.strip())
            if cm:
                cites.add((norm_author(cm.group(1)), cm.group(2)))
    for m in NARRATIVE_RE.finditer(sections_text):
        cites.add((norm_author(m.group(1)), m.group(2)))
    return cites


def _cites_match(cite, sig):
    author, year = cite
    ra, ry = sig
    if year != ry:
        return False
    if author in ra or ra in author:
        return True
    return author.split()[:1] == ra.split()[:1]


_CITATION_EXEMPT_IDS = {"overview", "glossary", "selfcheck", "self-check",
                        "assignment", "assign", "recap"}


def check_citation_placement(sections_text, errors):
    """In-text citations belong only in teaching sections (plus the per-term
    glossary data); an exempt derived section carrying one is a placement
    error."""
    for m in re.finditer(r'(<section\b[^>]*\bclass="[^"]*\bblock\b[^"]*"[^>]*>)'
                         r'(.*?)(?=</section>)', sections_text, re.S):
        im = re.search(r'\bid="([^"]+)"', m.group(1))
        if not im or im.group(1) not in _CITATION_EXEMPT_IDS:
            continue
        if in_text_citations(m.group(2)):
            errors.append(Err("references", "sections", im.group(1),
                              "in-text citation in non-teaching section %r" % im.group(1),
                              "cite only in teaching sections; glossary terms carry their own"))


def check_references(sections_text, refs, errors):
    check_citation_placement(sections_text, errors)
    cites = in_text_citations(sections_text)
    if not cites:
        errors.append(Err("references", "sections.html", None,
                          "no in-text APA citation found",
                          "cite each fact, e.g. (Author, Year)"))
    sigs = [ref_signature(r["text"]) for r in refs]
    for cite in sorted(cites):
        if not any(_cites_match(cite, s) for s in sigs):
            errors.append(Err("references", "sections.html", None,
                              "in-text citation (%s, %s) has no matching reference"
                              % cite, "add it to a refs.json, or fix the surname/year"))
    for r, sig in zip(refs, sigs):
        if not any(_cites_match(cite, sig) for cite in cites):
            errors.append(Err("references", "refs.json", None,
                              "reference %r is never cited" % r["key"],
                              "cite it in text, or remove it"))


def append_references(workdir, sections_text, errors):
    if not (workdir / "outline.json").exists():
        return sections_text
    title = references_title(workdir, errors)
    refs = merge_refs(workdir, errors)
    if not refs:
        errors.append(Err("references", "refs.json", None,
                          "no reference entries found",
                          "write refs.json or parts/*.refs.json"))
    if title is None:
        return sections_text
    check_references(sections_text, refs, errors)
    return sections_text + "\n" + render_references(title, refs)


def check_outline(workdir, sections_text, errors):
    """outline.json is the anti-phantom contract: the section list was fixed
    before any content was written, so every block must match it exactly."""
    opath = workdir / "outline.json"
    if not opath.exists():
        return
    try:
        outline = json.loads(opath.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, OSError) as exc:
        errors.append(Err("outline", "outline.json", None, "unreadable/invalid: %s" % exc, ""))
        return
    if not isinstance(outline, dict) or not isinstance(outline.get("source_titles"), list) \
            or not isinstance(outline.get("sections"), list):
        errors.append(Err("outline", "outline.json", None,
                          "must have list keys source_titles and sections",
                          '{"source":"...","source_titles":[...],'
                          '"sections":[{"id":...,"title":...,"from":[...]}],"dropped":[...]}'))
        return
    src_titles = [str(t) for t in outline["source_titles"]]
    if len(set(src_titles)) != len(src_titles):
        errors.append(Err("outline", "outline.json", None, "duplicate source_titles", "list each once, verbatim"))
    dropped = [str(t) for t in outline.get("dropped", [])]
    used = set()
    planned = {}
    for s in outline["sections"]:
        sid = str(s.get("id", "?"))
        if sid in planned:
            errors.append(Err("outline", "outline.json", None,
                              "duplicate outline section id %r" % sid, ""))
        planned[sid] = str(s.get("title", ""))
        for t in s.get("from", []):
            t = str(t)
            if t not in src_titles:
                errors.append(Err("outline", "outline.json", None,
                                  "section %r cites unknown source title %r" % (sid, t[:60]),
                                  "from[] entries must be verbatim source_titles strings"))
            else:
                used.add(t)
    for t in dropped:
        if t in src_titles:
            used.add(t)
        else:
            errors.append(Err("outline", "outline.json", None,
                              "dropped cites unknown source title %r" % t[:60], ""))
    for t in src_titles:
        if t not in used:
            errors.append(Err("outline", "outline.json", None,
                              "source title not covered by any section.from: %r" % t[:60],
                              "map it into a section or list it in dropped"))

    blocks = re.findall(r'<section\b[^>]*\bclass="[^"]*\bblock\b[^"]*"[^>]*>', sections_text)
    shipped = {}
    for tag in blocks:
        im = re.search(r'\bid="([^"]+)"', tag)
        if im:
            shipped.setdefault(im.group(1), []).append(tag)
    for sid, tags in shipped.items():
        if len(tags) > 1:
            errors.append(Err("outline", "sections", None,
                              "section.block id %r shipped %d times" % (sid, len(tags)),
                              "ids must be unique (also caught by ids rule)"))
        if sid not in planned:
            errors.append(Err("outline", "sections", None,
                              "phantom section id %r — not in outline.json" % sid,
                              "the outline is the contract: fix outline.json first, or remove the block"))
    for sid, title in planned.items():
        if sid not in shipped:
            errors.append(Err("outline", "sections", None,
                              "outline section %r (%s) missing from sections" % (sid, title[:50]),
                              "every outlined section must ship"))

    for m in re.finditer(r'(<section\b[^>]*\bclass="[^"]*\bblock\b[^"]*"[^>]*>)(.*?)(?=</section>)',
                         sections_text, re.S):
        im = re.search(r'\bid="([^"]+)"', m.group(1))
        if not im or im.group(1) not in planned:
            continue
        h2s = re.findall(r"<h2\b[^>]*>(.*?)</h2>", m.group(2), re.S)
        if len(h2s) != 1:
            errors.append(Err("outline", "sections", None,
                              "section %r has %d h2 headings" % (im.group(1), len(h2s)),
                              "one block = one outline heading; subsections are bold lead-ins"))
            continue
        got = norm_heading(h2s[0])
        want = norm_heading(planned[im.group(1)])
        if got != want:
            errors.append(Err("outline", "sections", None,
                              "section %r heading drift: %r != outline title %r" % (im.group(1), got[:60], want[:60]),
                              "h2 text must equal the outline.json title verbatim (modulo &nbsp;)"))


PRESENT_ATTR_RE = re.compile(r'data-present="([^"]*)"')
PRESENT_EXEMPT = {"overview", "glossary", "selfcheck", "assignment", "recap",
                  "self-check", "assign", "references"}
SECTION_RE = re.compile(
    r'<section\b[^>]*\bclass="[^"]*\bblock\b[^"]*"[^>]*>(.*?)(?=</section>)', re.S)


def _owning_tag(block, pos):
    """Return the lowercased tag containing the attribute at `pos`, or ''."""
    pre = block[:pos]
    gt = pre.rfind(">")
    lt = pre.rfind("<")
    if lt > gt:
        tm = re.match(r"<([a-zA-Z][\w-]*)", pre[lt:])
        return tm.group(1).lower() if tm else ""
    return ""


def check_present(sections_text, errors):
    """data-present="N" marks content kept at present time.

    N=0 is reserved for the section title <h2>: kept in flow, not a bullet.
    Every teaching section needs exactly one title marker and >=1 positive
    content marker; positive depths may not skip a level; markers may not nest
    or sit on the section root."""
    for m in SECTION_RE.finditer(sections_text):
        block = m.group(1)
        open_tag = sections_text[m.start():sections_text.find(">", m.start()) + 1]
        im = re.search(r'\bid="([^"]+)"', open_tag)
        sid = im.group(1) if im else "?"
        ln0 = sections_text.count("\n", 0, m.start()) + 1
        if re.search(r"data-present=", open_tag):
            errors.append(Err("present", "sections.html", ln0,
                              "data-present on section root %r" % sid,
                              "tag the inner content, not the whole section"))
        vals = []
        titles = 0
        for am in PRESENT_ATTR_RE.finditer(block):
            raw = am.group(1).strip()
            ln = sections_text.count("\n", 0, m.start(1) + am.start(1)) + 1
            if raw == "0":
                if _owning_tag(block, am.start()) == "h2":
                    titles += 1
                else:
                    errors.append(Err("present", "sections.html", ln,
                                      'data-present="0" is only valid on the '
                                      "section title <h2>",
                                      'put data-present="0" on the <h2>; use '
                                      '"1","2",... for content'))
                continue
            if not re.fullmatch(r"[1-9][0-9]*", raw):
                errors.append(Err("present", "sections.html", ln,
                                  "data-present=%r is not a positive integer" % raw,
                                  'use data-present="1", "2", ... (or "0" on the <h2>)'))
                continue
            vals.append(int(raw))
        if sid not in PRESENT_EXEMPT:
            if titles == 0:
                errors.append(Err("present", "sections.html", ln0,
                                  "section %r has no title marker" % sid,
                                  'put data-present="0" on its <h2>'))
            elif titles > 1:
                errors.append(Err("present", "sections.html", ln0,
                                  "section %r has more than one title marker" % sid,
                                  'exactly one data-present="0" belongs on the <h2>'))
            if not vals:
                errors.append(Err("present", "sections.html", ln0,
                                  "section %r has no data-present content marker" % sid,
                                  'add data-present="1" to its definition and '
                                  '"2" to its key points'))
        depth = 0
        for n in vals:
            if n > depth + 1:
                errors.append(Err("present", "sections.html", ln0,
                                  "section %r skips depth: %d after depth %d" % (sid, n, depth),
                                  "every depth N needs a preceding N-1 marker"))
                break
            depth = max(depth, n)
        # nested markers: a data-present element must not contain another
        for am in PRESENT_ATTR_RE.finditer(block):
            tag = _owning_tag(block, am.start())
            if not tag or tag in VOID_TAGS:
                continue
            open_end = block.find(">", am.end()) + 1
            # Find the close tag at the same nesting depth. A naive find()
            # stops at the first same-named close, hiding a marker that sits
            # after an inner same-tag close (e.g. a div nested in a div).
            tag_open = re.compile(r"<%s(?=[\s/>])" % re.escape(tag))
            tag_close = re.compile(r"</%s\s*>" % re.escape(tag))
            depth, close, pos = 1, -1, open_end
            while depth > 0:
                no = tag_open.search(block, pos)
                nc = tag_close.search(block, pos)
                if not nc:
                    break
                if no and no.start() < nc.start():
                    depth += 1
                    pos = no.end()
                else:
                    depth -= 1
                    if depth == 0:
                        close = nc.start()
                    pos = nc.end()
            if close < 0:
                continue
            nested = PRESENT_ATTR_RE.search(block[open_end:close])
            if nested:
                ln = sections_text.count(
                    "\n", 0, m.start(1) + open_end + nested.start()) + 1
                errors.append(Err("present", "sections.html", ln,
                                  "nested data-present inside a data-present <%s>" % tag,
                                  "tag the outer element only"))


def check_grid(css_text, fname, errors):
    """Grid/flex fr tracks default to min-width:auto and blow out of their
    container when a child has a fixed min size (svg, min-width table). Every
    fr track in component CSS must be clamped: minmax(0, 1fr)."""
    body = strip_comments(css_text)
    for m in GRID_TPL_RE.finditer(body):
        value = m.group(1)
        rest = MINMAX0_RE.sub("", value)
        bad = FR_RE.search(rest)
        if bad:
            ln = css_text.count("\n", 0, m.start()) + 1
            errors.append(Err("grid", fname, ln,
                              "bare fr track %r in %r" % (bad.group(0), value.strip()[:48]),
                              "wrap every fr track as minmax(0, %s) so children can shrink"
                              % bad.group(0)))


def read_text(path, errors):
    try:
        return path.read_text(encoding="utf-8-sig")
    except OSError:
        errors.append(Err("files", path.name, None, "cannot read %s" % path, ""))
        return None


PUB_RE = re.compile(r"-----BEGIN PUBLIC KEY-----(.*?)-----END PUBLIC KEY-----", re.S)
PRV_RE = re.compile(r"-----BEGIN PRIVATE KEY-----(.*?)-----END PRIVATE KEY-----", re.S)


def key_id_for(pub_der):
    return hashlib.sha256(pub_der).hexdigest()[:12]


def sanitize_filename(s):
    s = str(s)
    s = "".join("_" if (ord(c) < 32 or c in '<>:"/\\|?*') else c for c in s)
    s = re.sub(r"_+", "_", s)
    s = s.strip()
    return s or "unnamed"


def _keys_from_embedded(path):
    try:
        doc = json.loads(Path(path).read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None
    if not (isinstance(doc, dict)
            and isinstance(doc.get("teacher_key_pem"), str)
            and "-----BEGIN PRIVATE KEY-----" in doc["teacher_key_pem"]):
        return None
    text = doc["teacher_key_pem"]
    pm, pr = PUB_RE.search(text), PRV_RE.search(text)
    if not (pm and pr):
        raise ValueError("%s: teacher_key_pem is damaged "
                         "(restore the file from backup)" % path)
    pub_der = base64.b64decode("".join(pm.group(1).split()))
    return {"id": key_id_for(pub_der), "pem": None,
            "pub_b64": base64.b64encode(pub_der).decode("ascii"),
            "pem_text": text}


def ensure_teacher_keys(key_dir, output_stem=None):
    """One key file per lesson: the pair lives in <stem>-key.json.

    Lookup order: legacy build/key/keys.pem (if present) →
    <output_stem>-key.json → the single *-key.json in the folder →
    fresh in-memory pair (embedded into -key.json at write time; no
    keys.pem is ever created). Returns {"id", "pub_b64", "pem",
    "pem_text"}; "pem" is the legacy path or None. ValueError on damage
    or ambiguity.
    """
    key_dir = Path(key_dir)
    pem_path = key_dir / "keys.pem"
    if pem_path.exists():
        text = pem_path.read_text(encoding="utf-8")
        pm, pr = PUB_RE.search(text), PRV_RE.search(text)
        if not (pm and pr):
            raise ValueError("keys.pem unreadable: missing PUBLIC/PRIVATE PEM block "
                             "(delete the file to regenerate)")
        pub_der = base64.b64decode("".join(pm.group(1).split()))
        return {"id": key_id_for(pub_der), "pem": pem_path,
                "pub_b64": base64.b64encode(pub_der).decode("ascii"),
                "pem_text": text}
    if output_stem:
        direct = key_dir / (output_stem + "-key.json")
        if direct.exists():
            keys = _keys_from_embedded(direct)
            if keys is not None:
                return keys
        candidates = [p for p in sorted(key_dir.glob("*-key.json"))
                      if _keys_from_embedded(p) is not None]
        if len(candidates) == 1:
            return _keys_from_embedded(candidates[0])
        if len(candidates) > 1:
            raise ValueError("multiple *-key.json files in %s and none matches %r "
                             "(keep exactly one per lesson folder)" % (key_dir, output_stem))
    here = str(Path(__file__).resolve().parent)
    if here not in sys.path:
        sys.path.append(here)
    try:
        from tools.make_keys import generate_pair
    except ImportError as exc:
        raise ValueError("cannot create teacher key: 'cryptography' package "
                         "missing (pip install cryptography): %s" % exc)
    pair = generate_pair()
    return {"id": pair["id"], "pem": None,
            "pub_b64": pair["pub_b64"], "pem_text": pair["pem_text"]}


UNLOCK_KEY_LEN = 32


def _unlock_b64_to_bytes(text, where):
    try:
        raw = base64.b64decode(text, validate=True)
    except Exception:
        raise ValueError("%s is not valid base64 "
                         "(restore it from backup)" % where)
    if len(raw) != UNLOCK_KEY_LEN:
        raise ValueError("%s must decode to exactly %d bytes, got %d "
                         "(restore it from backup)" % (where, UNLOCK_KEY_LEN,
                                                       len(raw)))
    return raw


def ensure_unlock_key(key_dir):
    """Universal assignment key: (32 raw bytes, base64 str), one key for all.

    Lookup order: LN_UNLOCK_KEY env (authoritative, never written to disk) →
    <key_dir>/unlock.key → fresh os.urandom(32) written to the file with a
    loud warning. ValueError on damage (mirrors ensure_teacher_keys).
    """
    env = os.environ.get("LN_UNLOCK_KEY")
    if env:
        raw = _unlock_b64_to_bytes(env.strip(), "LN_UNLOCK_KEY env")
        return raw, base64.b64encode(raw).decode("ascii")
    key_dir = Path(key_dir)
    kf = key_dir / "unlock.key"
    if kf.exists():
        raw = _unlock_b64_to_bytes(
            kf.read_text(encoding="ascii").strip(), "build/key/unlock.key")
        return raw, base64.b64encode(raw).decode("ascii")
    raw = os.urandom(UNLOCK_KEY_LEN)
    b64 = base64.b64encode(raw).decode("ascii")
    key_dir.mkdir(parents=True, exist_ok=True)
    kf.write_text(b64 + "\n", encoding="ascii")
    print("WARNING: generated build/key/unlock.key — set this same value as "
          "the Worker secret UNLOCK_KEY (cd checker/worker; "
          "npx wrangler secret put UNLOCK_KEY); losing it orphans existing "
          "lessons.")
    return raw, b64


ASSIGN_FIXED = {"mc": 10, "tf": 4, "id": 4}
ASSIGN_SA_MIN = 2

# Mixed objective assignment (design 2026-10-29): the default deck — 10 mc,
# 8 tf, and 2 multi items, no SA. Position and tf-balance guards keep the
# answer from being guessable from shape alone.
ASSIGN_MIX = {"mc": 10, "tf": 8, "multi": 2}
ASSIGN_MIX_MAX_POS = 3
ASSIGN_MIX_MIN_TF_EACH = 3
ASSIGN_MULTI_MAX_CHOICES = 8

# Error-checking + multi-select assignment (design 2026-10-28): 12 err items,
# 8 multi items, and deck-level guards against answer-length cues.
ASSIGN_ERROR_ERR = 12
ASSIGN_ERROR_MULTI = 8
ASSIGN_ERROR_MAX_POS = 4
ASSIGN_ERROR_MAX_LONGEST = 4
ASSIGN_ERROR_MIN_LONG_SPANS = 3

# Graph-reading assignment (design 2026-10-18): 10 multiple-choice items, each
# pairing a written situation with a named figure from the deck's figure bank.
ASSIGN_GRAPH_N = 10
ASSIGN_GRAPH_MIN_FIGURES = 3
ASSIGN_GRAPH_MAX_POS = 4
GRAPH_BANNED_CHOICES = ("all of the above", "none of the above")

# Every graph in a graph-reading deck carries a legend, so a bank entry is an
# object {svg, legend:[{label, token, mark?}]}. The legend is rendered as HTML
# under the drawing (a scaled SVG's own text shrinks on a phone), coloured only
# by the theme's chart tokens.
GRAPH_LEGEND_TOKENS = ("chart-rev", "chart-cost", "chart-profit", "chart-loss",
                       "chart-axis", "chart-grid", "chart-label")
GRAPH_LEGEND_MARKS = ("line", "dashed", "block")

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


def _dag_optimal(nodes):
    """Enumerate every root-to-leaf path; report max, uniqueness, node-level rule.

    Budget is tiny (<=16 nodes, branch<=4, depth<=5) so full enumeration beats
    DP for the second-best / tie checks. Assumes higher-level edges only
    (validate_assignment enforces that before relying on this).
    """
    by_id = {n["id"]: n for n in (nodes or []) if isinstance(n, dict) and n.get("id")}
    roots = [n for n in by_id.values() if n.get("level") == 0]
    best_path, max_score = [], None
    max_count, path_count = 0, 0

    def walk(node_id, path, total):
        nonlocal best_path, max_score, max_count, path_count
        node = by_id[node_id]
        if node.get("isLeaf"):
            path_count += 1
            if max_score is None or total > max_score:
                max_score, max_count, best_path = total, 1, list(path)
            elif total == max_score:
                max_count += 1
            return
        for ch in (node.get("choices") or []):
            if not isinstance(ch, dict):
                continue
            nxt = ch.get("nextNodeId")
            if nxt is None or nxt not in by_id:
                continue
            pts = ch.get("points") if isinstance(ch.get("points"), int) else 0
            walk(nxt, path + [{"node": node_id, "label": ch.get("label"),
                               "points": pts}], total + pts)

    if roots:
        walk(roots[0]["id"], [], 0)

    node_level_ok = True
    for step in best_path:
        node = by_id.get(step["node"])
        if not node:
            node_level_ok = False
            break
        chosen_pts = None
        for ch in (node.get("choices") or []):
            if not isinstance(ch, dict):
                continue
            if ch.get("label") == step["label"]:
                chosen_pts = ch.get("points") if isinstance(ch.get("points"), int) else 0
                break
        if chosen_pts is None:
            node_level_ok = False
            break
        for ch in (node.get("choices") or []):
            if not isinstance(ch, dict):
                continue
            if ch.get("label") == step["label"]:
                continue
            sib = ch.get("points") if isinstance(ch.get("points"), int) else 0
            if sib >= chosen_pts:
                node_level_ok = False
                break

    return {
        "path": best_path,
        "max_score": max_score if max_score is not None else 0,
        "max_count": max_count,
        "path_count": path_count,
        "node_level_ok": node_level_ok,
    }


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
    n_mounts = len(re.findall(
        r'<div[^>]*data-component="assignment"[^>]*>', sections_text))
    if n_mounts > 1:
        errors.append(Err("assign", "sections.html", None,
                          "assignment appears %d times — exactly one assignment "
                          "section per build" % n_mounts,
                          "keep a single <div data-component=\"assignment\"> mount"))
        return key, None
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


def _data_obj_span(data_text, key):
    """(open, close) indices of the LN.data.<key> = { … } object, or None."""
    m = re.search(r"LN\.data\." + re.escape(key) + r"\s*=\s*", data_text)
    if not m:
        return None
    try:
        i = data_text.index("{", m.end())
    except ValueError:
        return None
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
    return (i, end) if end >= 0 else None


def sanitize_assignment_data(data_text, key, data):
    """Rewrite LN.data.<key> in the student output without any answer material."""
    span = _data_obj_span(data_text, key)
    if span is None:
        return data_text
    i, end = span
    if data.get("mode") == "dag":
        safe_nodes = []
        for n in (data.get("nodes") or []):
            row = {
                "id": n.get("id"),
                "level": n.get("level"),
                "isLeaf": bool(n.get("isLeaf")),
                "question": n.get("question", ""),
                "outcome": n.get("outcome"),
                "choices": [
                    {"label": c.get("label"), "text": c.get("text", ""),
                     "nextNodeId": c.get("nextNodeId")}
                    for c in (n.get("choices") or [])
                ],
            }
            if row["isLeaf"]:
                row["finalOutcome"] = n.get("finalOutcome", "")
            safe_nodes.append(row)
        safe = {"intro": data.get("intro", ""), "mode": "dag",
                "title": data.get("title", ""), "scenario": data.get("scenario", ""),
                "nodes": safe_nodes}
    elif data.get("mode") == "graph":
        safe_items = []
        for it in (data.get("items") or []):
            safe_items.append({
                "type": it.get("type"),
                "situation": it.get("situation", ""),
                "figure": it.get("figure", ""),
                "prompt": it.get("prompt", ""),
                "choices": list(it.get("choices") or []),
            })
        safe = {"intro": data.get("intro", ""), "mode": "graph",
                "figures": data.get("figures") or {}, "items": safe_items}
    elif data.get("mode") == "error":
        safe_items = []
        for it in (data.get("items") or []):
            safe_items.append({
                "type": it.get("type"),
                "statement": it.get("statement", ""),
                "prompt": it.get("prompt", ""),
                "choices": list(it.get("choices") or []),
            })
        safe = {"intro": data.get("intro", ""), "mode": "error",
                "items": safe_items}
    elif data.get("mode") == "mixed":
        safe_items = []
        for it in (data.get("items") or []):
            row = {"type": it.get("type"), "prompt": it.get("prompt", "")}
            if it.get("type") in ("mc", "multi"):
                row["choices"] = list(it.get("choices") or [])
            safe_items.append(row)
        safe = {"intro": data.get("intro", ""), "mode": "mixed",
                "items": safe_items}
    else:
        safe_items = []
        for it in (data.get("items") or []):
            row = {"type": it.get("type"), "prompt": it.get("prompt")}
            if it.get("type") == "mc":
                row["choices"] = list(it.get("choices") or [])
            safe_items.append(row)
        safe = {"intro": data.get("intro", ""), "items": safe_items}
    return data_text[:i] + json.dumps(safe, ensure_ascii=False) + data_text[end + 1:]


def encrypt_assignment_data(data_text, key, key_bytes):
    """Replace the sanitized LN.data.<key> object with an AES-256-GCM envelope."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    span = _data_obj_span(data_text, key)
    if span is None:
        return data_text
    i, end = span
    safe_obj = json.loads(data_text[i:end + 1])
    iv = os.urandom(12)
    pt = json.dumps(safe_obj, ensure_ascii=False).encode("utf-8")
    ct = AESGCM(key_bytes).encrypt(iv, pt, None)
    envelope = {"lnenc": 1, "v": 1,
                "iv": base64.b64encode(iv).decode("ascii"),
                "ct": base64.b64encode(ct).decode("ascii")}
    return data_text[:i] + json.dumps(envelope) + data_text[end + 1:]


def _wc(s):
    return len(str(s or "").split())


def _norm_span(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


_SENT_ABBREV = ("mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs",
                "e.g", "i.e", "u.s", "u.k", "u.s.a", "fig", "pp", "p")


def _sentence_count(text):
    """Count sentences, ignoring dotted abbreviations and quoted terminators."""
    s = _norm_span(text)
    if not s:
        return 0
    for abbr in sorted(_SENT_ABBREV, key=len, reverse=True):
        s = re.sub(r"(?<!\w)%s\.(?=\s|$)" % re.escape(abbr),
                   lambda m: m.group(0)[:-1] + "\x00", s, flags=re.I)
    parts = [p for p in re.split(r"[.!?]+[\"'\u201d\u2019]?(?=\s|$)", s)
             if p.strip()]
    return len(parts)


def _span_hits(statement, span):
    """Whole-word, whitespace-normalized occurrence count of span in statement."""
    stmt, sp = _norm_span(statement), _norm_span(span)
    if not sp:
        return 0
    return len(re.findall(r"(?<!\w)%s(?!\w)" % re.escape(sp), stmt))


def _norm_choice(s):
    """Mirror the checker's normalize(): case, diacritics, punctuation ignored."""
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def validate_assignment(data, errors, expected_mode=None, dag_cfg=None):
    data = data or {}
    data_mode = data.get("mode", "flat")
    if data_mode not in ("flat", "dag", "graph", "error", "mixed"):
        errors.append(Err("assign", "data.js", None,
                          "unknown assignment mode %r" % (data_mode,),
                          "mode must be \"mixed\", \"error\", \"dag\", \"graph\", "
                          "or omitted (flat)"))
        return
    if expected_mode is not None and data_mode != expected_mode:
        if data_mode == "dag":
            hint = ("set \"mode\": \"dag\" in the assignment data and pin "
                    "\"assignment\": \"dag\" in build.json - a lesson written "
                    "for the old implicit DAG default must opt in")
        else:
            hint = ("set \"mode\": \"%s\" in the assignment data (or fix "
                    "build.json)" % expected_mode)
        errors.append(Err("assign", "data.js", None,
                          "data mode %r != build.json assignment %r"
                          % (data_mode, expected_mode), hint))
        return
    if data_mode == "dag":
        _validate_assignment_dag(data, errors, dag_cfg)
        return
    if data_mode == "graph":
        _validate_assignment_graph(data, errors)
        return
    if data_mode == "mixed":
        _validate_assignment_mixed(data, errors)
        return
    if data_mode == "error":
        _validate_assignment_error(data, errors)
        return
    _validate_assignment_flat(data, errors)


def _validate_assignment_flat(data, errors):
    items = (data or {}).get("items") or []
    n_sa = sum(1 for it in items if it.get("type") == "sa")
    if n_sa < ASSIGN_SA_MIN:
        errors.append(Err("assign", "data.js", None,
                          "assignment needs at least %d sa items, found %d"
                          % (ASSIGN_SA_MIN, n_sa),
                          "author 2 or more situational short-answer items"))
        return
    if len(items) != sum(ASSIGN_FIXED.values()) + n_sa:
        errors.append(Err("assign", "data.js", None,
                          "assignment needs exactly %d fixed items + %d sa, found %d total"
                          % (sum(ASSIGN_FIXED.values()), n_sa, len(items)),
                          "author 10 mc, 4 tf, 4 id, and 2 or more sa"))
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
            wc = [len(str(c).split()) for c in ch]
            if len(ch) == 4 and max(wc) - min(wc) > 1:
                errors.append(Err("assign", "data.js", None,
                                  "mc item %d choices vary by %d words — keep all four "
                                  "within 1 word (question-craft.md)"
                                  % (n, max(wc) - min(wc)),
                                  "trim or pad choices so they match in length"))
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
            rb = it.get("rubric")
            if not isinstance(rb, str) or not rb.strip():
                errors.append(Err("assign", "data.js", None,
                                  "sa item %d needs a non-empty rubric string" % n,
                                  "rubric = the scoring criteria shipped to the key file"))
            mp = it.get("max_points")
            if not isinstance(mp, int) or isinstance(mp, bool) or mp <= 0:
                errors.append(Err("assign", "data.js", None,
                                  "sa item %d needs a positive integer max_points" % n,
                                  "max_points = the SA item's point ceiling"))
        else:
            errors.append(Err("assign", "data.js", None,
                              "item %d has unknown type %r" % (n, t),
                              "types: mc, tf, id, sa"))
    tf_bool = [it.get("ans") for it in items
               if it.get("type") == "tf" and isinstance(it.get("ans"), bool)]
    if len(tf_bool) == ASSIGN_FIXED["tf"] and len(set(tf_bool)) == 1:
        errors.append(Err("assign", "data.js", None,
                          "tf block is all-%s — single-flip traps need both verdicts"
                          % ("true" if tf_bool[0] else "false"),
                          "author at least one true and one false statement"))
    for t, want in sorted(ASSIGN_FIXED.items()):
        got = counts.get(t, 0)
        if got != want:
            errors.append(Err("assign", "data.js", None,
                              "type mix has %d %s, expected exactly %d"
                              % (got, t, want),
                              "author 10 mc, 4 tf, 4 id, and 2 or more sa"))


def _validate_assignment_graph(data, errors):
    """Graph-reading deck: ASSIGN_GRAPH_N multiple-choice items, each pairing a
    written situation with a figure named from the deck's `figures` bank.

    Design: docs/specs/2026-10-18-week10-market-structures-design.md 5.4.
    """
    data = data or {}
    items = data.get("items") or []
    figures = data.get("figures")
    if not isinstance(figures, dict) or not figures:
        errors.append(Err("assign", "data.js", None,
                          "graph assignment needs a non-empty 'figures' bank",
                          "figures = {name: '<svg ...>'} - the drawings the items read"))
        return
    for name in sorted(figures):
        entry = figures[name]
        if not isinstance(entry, dict):
            errors.append(Err("assign", "data.js", None,
                              "figure %r must be an object {svg, legend}" % (name,),
                              "every graph carries a legend; a bare <svg> string is "
                              "not a bank entry"))
            continue
        svg = entry.get("svg")
        if not isinstance(svg, str) or not svg.strip():
            errors.append(Err("assign", "data.js", None,
                              "figure %r has no svg" % (name,),
                              "figure %r = {svg: '<svg ...>', legend: [...]}" % (name,)))
        else:
            body = svg.strip()
            if not body.startswith("<svg") or "viewBox=" not in body or "</svg>" not in body:
                errors.append(Err("assign", "data.js", None,
                                  "figure %r's svg must be an inline <svg> with a viewBox"
                                  % (name,),
                                  "start <svg xmlns=... viewBox=...> and close </svg>"))
        legend = entry.get("legend")
        if not isinstance(legend, list) or not legend:
            errors.append(Err("assign", "data.js", None,
                              "figure %r has no legend" % (name,),
                              "every graph carries a legend: a non-empty list of "
                              "{label, token[, mark]}"))
            continue
        seen_labels = set()
        for j, row in enumerate(legend, 1):
            if not isinstance(row, dict):
                errors.append(Err("assign", "data.js", None,
                                  "figure %r legend entry %d is not an object"
                                  % (name, j), ""))
                continue
            label = str(row.get("label") or "").strip()
            if not label:
                errors.append(Err("assign", "data.js", None,
                                  "figure %r legend entry %d has no label"
                                  % (name, j),
                                  "label = the words a student reads"))
            elif label.lower() in seen_labels:
                errors.append(Err("assign", "data.js", None,
                                  "figure %r legend repeats the label %r" % (name, label),
                                  "drop the duplicate"))
            else:
                seen_labels.add(label.lower())
            token = row.get("token")
            if token not in GRAPH_LEGEND_TOKENS:
                errors.append(Err("assign", "data.js", None,
                                  "figure %r legend entry %d has token %r"
                                  % (name, j, token),
                                  "token must be one of: %s"
                                  % ", ".join(GRAPH_LEGEND_TOKENS)))
            mark = row.get("mark")
            if mark is not None and mark not in GRAPH_LEGEND_MARKS:
                errors.append(Err("assign", "data.js", None,
                                  "figure %r legend entry %d has mark %r"
                                  % (name, j, mark),
                                  "mark must be one of: %s"
                                  % ", ".join(GRAPH_LEGEND_MARKS)))
    n = len(items)
    if n != ASSIGN_GRAPH_N:
        errors.append(Err("assign", "data.js", None,
                          "graph assignment needs exactly %d items, found %d"
                          % (ASSIGN_GRAPH_N, n),
                          "author %d situational graph-reading items" % ASSIGN_GRAPH_N))
    pos = {}
    used_figs = set()
    for i, it in enumerate(items, 1):
        if not isinstance(it, dict):
            errors.append(Err("assign", "data.js", None,
                              "graph item %d is not an object" % i, ""))
            continue
        if it.get("type") != "mc":
            errors.append(Err("assign", "data.js", None,
                              "graph item %d has type %r, expected 'mc'"
                              % (i, it.get("type")),
                              "every graph-reading item is multiple choice"))
            continue
        for field in ("situation", "figure", "prompt"):
            if not str(it.get(field) or "").strip():
                errors.append(Err("assign", "data.js", None,
                                  "graph item %d has an empty %s" % (i, field),
                                  "each item carries a situation, a figure name, "
                                  "and a prompt"))
        fig = it.get("figure")
        if str(fig or "").strip():
            if fig not in figures:
                errors.append(Err("assign", "data.js", None,
                                  "graph item %d names figure %r, not in the bank"
                                  % (i, fig),
                                  "figure names one of: %s" % ", ".join(sorted(figures))))
            else:
                used_figs.add(fig)
        ch = it.get("choices") or []
        if len(ch) != 4 or not all(str(c).strip() for c in ch):
            errors.append(Err("assign", "data.js", None,
                              "graph item %d needs exactly 4 non-empty choices" % i,
                              ""))
        else:
            if len(set(str(c) for c in ch)) != 4:
                errors.append(Err("assign", "data.js", None,
                                  "graph item %d repeats a choice" % i,
                                  "all four choices must be distinct"))
            wc = [len(str(c).split()) for c in ch]
            if max(wc) - min(wc) > 1:
                errors.append(Err("assign", "data.js", None,
                                  "graph item %d choices vary by %d words - keep all "
                                  "four within 1 word" % (i, max(wc) - min(wc)),
                                  "trim or pad choices so they match in length"))
            for c in ch:
                if str(c).strip().lower() in GRAPH_BANNED_CHOICES:
                    errors.append(Err("assign", "data.js", None,
                                      "graph item %d uses the choice %r" % (i, c),
                                      "drop 'all/none of the above' choices"))
        a = it.get("ans")
        if not isinstance(a, int) or isinstance(a, bool) or not 0 <= a < 4:
            errors.append(Err("assign", "data.js", None,
                              "graph item %d needs ans 0..3" % i,
                              "the answer key ships only to build/key/"))
        else:
            pos[a] = pos.get(a, 0) + 1
    if items and len(used_figs) < ASSIGN_GRAPH_MIN_FIGURES:
        errors.append(Err("assign", "data.js", None,
                          "the deck reads only %d distinct figure(s); a graph-reading "
                          "deck needs at least %d"
                          % (len(used_figs), ASSIGN_GRAPH_MIN_FIGURES),
                          "draw the structures the deck asks about"))
    for p, c in sorted(pos.items()):
        if c > ASSIGN_GRAPH_MAX_POS:
            errors.append(Err("assign", "data.js", None,
                              "answer position %d used %d times, over the %d cap"
                              % (p, c, ASSIGN_GRAPH_MAX_POS),
                              "spread the answers across all four positions"))


def _check_multi_item(n, it, errors):
    """Validate one multi-select item; return (choices_ok, ans_ok, len_cue).

    Shared by the mixed deck and the opt-in error-check deck so both enforce
    the same option rules and the same answer-length guard.
    """
    prompt = it.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        errors.append(Err("assign", "data.js", None,
                          "multi item %d has an empty prompt" % n,
                          "the prompt names what to select"))
    ch = it.get("choices")
    choices_ok = (isinstance(ch, list)
                  and 4 <= len(ch) <= ASSIGN_MULTI_MAX_CHOICES
                  and all(isinstance(c, str) and c.strip() for c in ch))
    if not choices_ok:
        errors.append(Err("assign", "data.js", None,
                          "multi item %d needs 4-8 non-empty choices" % n,
                          "options run from 4 to %d" % ASSIGN_MULTI_MAX_CHOICES))
        ch = []
    elif len(set(ch)) != len(ch):
        errors.append(Err("assign", "data.js", None,
                          "multi item %d repeats a choice" % n,
                          "all options must be distinct"))
        choices_ok = False
    if choices_ok:
        normed = {}
        for c in ch:
            nc = _norm_choice(c)
            if not nc:
                errors.append(Err("assign", "data.js", None,
                                  "multi item %d choice %r has no "
                                  "letters or digits" % (n, c),
                                  "each option states a real choice"))
                choices_ok = False
            elif nc in normed:
                errors.append(Err("assign", "data.js", None,
                                  "multi item %d choices %r and %r are "
                                  "equal after normalization"
                                  % (n, normed[nc], c),
                                  "options differing only by case or "
                                  "punctuation are not distinct"))
                choices_ok = False
            else:
                normed[nc] = c
    a = it.get("ans")
    ans_ok = False
    if not isinstance(a, list) or not all(
            isinstance(x, int) and not isinstance(x, bool) for x in a):
        errors.append(Err("assign", "data.js", None,
                          "multi item %d ans must be an array of integer "
                          "indices" % n,
                          "ans = [0, 2] selects choices 0 and 2"))
    else:
        if len(set(a)) != len(a):
            errors.append(Err("assign", "data.js", None,
                              "multi item %d ans repeats an index" % n,
                              "list each correct choice once"))
        if len(a) < 2:
            errors.append(Err("assign", "data.js", None,
                              "multi item %d ans needs at least 2 correct "
                              "choices" % n,
                              "author 2 or more correct options"))
        if choices_ok and len(a) > len(ch) - 1:
            errors.append(Err("assign", "data.js", None,
                              "multi item %d ans selects all choices; leave "
                              "at least one incorrect" % n,
                              "correct options are 2..%d" % (len(ch) - 1)))
        if choices_ok and any(not 0 <= x < len(ch) for x in a):
            errors.append(Err("assign", "data.js", None,
                              "multi item %d ans has an index outside 0..%d"
                              % (n, len(ch) - 1),
                              "indices count from 0"))
        ans_ok = (2 <= len(a) <= (len(ch) - 1 if choices_ok
                                  else ASSIGN_MULTI_MAX_CHOICES - 1)
                  and len(set(a)) == len(a)
                  and (not choices_ok
                       or all(0 <= x < len(ch) for x in a)))
    len_cue = False
    if choices_ok and ans_ok:
        picked = set(a)
        correct_wc = [_wc(ch[x]) for x in a]
        wrong_wc = [_wc(c) for j, c in enumerate(ch)
                    if j not in picked]
        if wrong_wc and (sum(correct_wc) / len(correct_wc)
                         > sum(wrong_wc) / len(wrong_wc)):
            len_cue = True
    return choices_ok, ans_ok, len_cue


def _validate_assignment_mixed(data, errors):
    """Mixed objective deck (the default): 10 mc, 8 tf, 2 multi, no SA.

    Design: docs/superpowers/specs/2026-10-29-mixed-assignment-design.md
    """
    items = (data or {}).get("items") or []
    counts = {}
    for it in items:
        if isinstance(it, dict):
            t = it.get("type")
            counts[t] = counts.get(t, 0) + 1
    for t, want in sorted(ASSIGN_MIX.items()):
        got = counts.get(t, 0)
        if got != want:
            errors.append(Err("assign", "data.js", None,
                              "type mix has %d %s, expected exactly %d"
                              % (got, t, want),
                              "author 10 mc, 8 tf, and 2 multi; no other types"))
    pos = {}
    tf_bool = []
    for n, it in enumerate(items, 1):
        if not isinstance(it, dict):
            errors.append(Err("assign", "data.js", None,
                              "item %d is not an object" % n, ""))
            continue
        t = it.get("type")
        if t == "mc":
            prompt = it.get("prompt")
            if not isinstance(prompt, str) or not prompt.strip():
                errors.append(Err("assign", "data.js", None,
                                  "mc item %d has an empty prompt" % n, ""))
            ch = it.get("choices")
            choices_ok = (isinstance(ch, list) and len(ch) == 4
                          and all(isinstance(c, str) and c.strip() for c in ch))
            if not choices_ok:
                errors.append(Err("assign", "data.js", None,
                                  "mc item %d needs exactly 4 non-empty choices"
                                  % n, ""))
                ch = []
            else:
                normed = {}
                for c in ch:
                    nc = _norm_choice(c)
                    if not nc:
                        errors.append(Err("assign", "data.js", None,
                                          "mc item %d choice %r has no letters "
                                          "or digits" % (n, c),
                                          "each choice states a real answer"))
                        choices_ok = False
                    elif nc in normed:
                        errors.append(Err("assign", "data.js", None,
                                          "mc item %d choices %r and %r are "
                                          "equal after normalization"
                                          % (n, normed[nc], c),
                                          "choices differing only by case or "
                                          "punctuation are not distinct"))
                        choices_ok = False
                    elif nc in GRAPH_BANNED_CHOICES:
                        errors.append(Err("assign", "data.js", None,
                                          "mc item %d uses %r" % (n, c),
                                          "never 'all of the above' / 'none of "
                                          "the above'"))
                        choices_ok = False
                    else:
                        normed[nc] = c
                if len(ch) == 4:
                    wcs = [_wc(c) for c in ch]
                    if max(wcs) - min(wcs) > 1:
                        errors.append(Err(
                            "assign", "data.js", None,
                            "mc item %d choices vary by %d words — keep all four "
                            "within 1 word (mixed-craft.md)"
                            % (n, max(wcs) - min(wcs)),
                            "trim or pad choices so they match in length"))
            a = it.get("ans")
            if not isinstance(a, int) or isinstance(a, bool) or not 0 <= a < 4:
                errors.append(Err("assign", "data.js", None,
                                  "mc item %d needs ans 0..3" % n,
                                  "the answer key ships only to build/key/"))
            else:
                pos[a] = pos.get(a, 0) + 1
        elif t == "tf":
            prompt = it.get("prompt")
            if not isinstance(prompt, str) or not prompt.strip():
                errors.append(Err("assign", "data.js", None,
                                  "tf item %d has an empty prompt" % n, ""))
            ans = it.get("ans")
            if not isinstance(ans, bool):
                errors.append(Err("assign", "data.js", None,
                                  "tf item %d needs a boolean ans" % n, ""))
            else:
                tf_bool.append(ans)
        elif t == "multi":
            _choices_ok, _ans_ok, len_cue = _check_multi_item(n, it, errors)
            if len_cue:
                errors.append(Err("assign", "data.js", None,
                                  "multi item %d's correct set has the largest "
                                  "mean length" % n,
                                  "vary option lengths; do not let the correct "
                                  "set dominate"))
        else:
            errors.append(Err("assign", "data.js", None,
                              "item %d has unknown type %r" % (n, t),
                              "types: mc, tf, multi"))
    for p, c in sorted(pos.items()):
        if c > ASSIGN_MIX_MAX_POS:
            errors.append(Err("assign", "data.js", None,
                              "mc answer position %d used %d times, over the %d cap"
                              % (p, c, ASSIGN_MIX_MAX_POS),
                              "spread the answer across all four positions"))
    n_true = sum(1 for v in tf_bool if v)
    n_false = len(tf_bool) - n_true
    if tf_bool and min(n_true, n_false) < ASSIGN_MIX_MIN_TF_EACH:
        errors.append(Err("assign", "data.js", None,
                          "tf block is %d true / %d false; at least %d of each "
                          "are required" % (n_true, n_false,
                                            ASSIGN_MIX_MIN_TF_EACH),
                          "balance the verdicts so they cannot be guessed"))


def _validate_assignment_error(data, errors):
    """Error-check + multi-select deck: 12 err and 8 multi items, no SA.

    Design: docs/superpowers/specs/2026-10-28-error-multiselect-assignment-design.md
    """
    data = data or {}
    items = data.get("items") or []
    n_err = sum(1 for it in items
                if isinstance(it, dict) and it.get("type") == "err")
    n_multi = sum(1 for it in items
                  if isinstance(it, dict) and it.get("type") == "multi")
    if n_err != ASSIGN_ERROR_ERR or n_multi != ASSIGN_ERROR_MULTI:
        errors.append(Err("assign", "data.js", None,
                          "error assignment needs exactly 12 err + 8 multi items, "
                          "found %d err and %d multi (%d total)"
                          % (n_err, n_multi, len(items)),
                          "author 12 error-check items and 8 multi-select items; no sa"))
    pos = {}
    n_longest = 0
    n_long_spans = 0
    n_multi_longest = 0
    for n, it in enumerate(items, 1):
        if not isinstance(it, dict):
            errors.append(Err("assign", "data.js", None,
                              "item %d is not an object" % n, ""))
            continue
        t = it.get("type")
        if t == "err":
            stmt_raw = it.get("statement")
            stmt = _norm_span(stmt_raw)
            if not isinstance(stmt_raw, str) or not stmt:
                errors.append(Err("assign", "data.js", None,
                                  "err item %d has an empty statement" % n,
                                  "each err item carries the full statement"))
            else:
                sentences = _sentence_count(stmt)
                if not 1 <= sentences <= 3:
                    errors.append(Err("assign", "data.js", None,
                                      "err item %d statement has %d sentences; keep it "
                                      "to 1-3" % (n, sentences),
                                      "split or trim the statement"))
                n_words = _wc(stmt)
                if n_words > 80:
                    errors.append(Err("assign", "data.js", None,
                                      "err item %d statement has %d words; cap is 80"
                                      % (n, n_words),
                                      "trim the statement to 80 words or fewer"))
            ch = it.get("choices")
            choices_ok = (isinstance(ch, list) and len(ch) == 4
                          and all(isinstance(c, str) and c.strip() for c in ch))
            if not choices_ok:
                errors.append(Err("assign", "data.js", None,
                                  "err item %d needs exactly 4 non-empty choices" % n,
                                  ""))
                ch = []
            else:
                if len(set(ch)) != 4:
                    errors.append(Err("assign", "data.js", None,
                                      "err item %d repeats a choice" % n,
                                      "all four spans must be distinct"))
                normed = {}
                for c in ch:
                    nc = _norm_choice(c)
                    if not nc:
                        errors.append(Err("assign", "data.js", None,
                                          "err item %d choice %r has no letters "
                                          "or digits" % (n, c),
                                          "each choice names a real span"))
                        choices_ok = False
                    elif nc in normed:
                        errors.append(Err("assign", "data.js", None,
                                          "err item %d choices %r and %r are "
                                          "equal after normalization"
                                          % (n, normed[nc], c),
                                          "choices differing only by case or "
                                          "punctuation are not distinct"))
                        choices_ok = False
                    else:
                        normed[nc] = c
                for c in ch:
                    hits = _span_hits(stmt, c)
                    if hits != 1:
                        errors.append(Err("assign", "data.js", None,
                                          "err item %d choice %r is not a verbatim "
                                          "whole-word span occurring exactly once in "
                                          "the statement (found %d)"
                                          % (n, c, hits),
                                          "copy each choice verbatim from the "
                                          "statement; remove repeated spans"))
            a = it.get("ans")
            if not isinstance(a, int) or isinstance(a, bool) or not 0 <= a < 4:
                errors.append(Err("assign", "data.js", None,
                                  "err item %d needs ans 0..3" % n,
                                  "the answer key ships only to build/key/"))
            else:
                pos[a] = pos.get(a, 0) + 1
                if choices_ok:
                    wcs = [_wc(c) for c in ch]
                    others = [w for j, w in enumerate(wcs) if j != a]
                    if others and wcs[a] > max(others):
                        n_longest += 1
                    if wcs[a] >= 4:
                        n_long_spans += 1
        elif t == "multi":
            _choices_ok, _ans_ok, len_cue = _check_multi_item(n, it, errors)
            if len_cue:
                n_multi_longest += 1
        else:
            errors.append(Err("assign", "data.js", None,
                              "item %d has unknown type %r" % (n, t),
                              "types: err, multi"))
    for p, c in sorted(pos.items()):
        if c > ASSIGN_ERROR_MAX_POS:
            errors.append(Err("assign", "data.js", None,
                              "err answer position %d used %d times, over the %d cap"
                              % (p, c, ASSIGN_ERROR_MAX_POS),
                              "spread the error across all four positions"))
    if n_longest > ASSIGN_ERROR_MAX_LONGEST:
        errors.append(Err("assign", "data.js", None,
                          "err deck has %d items whose correct span is the unique "
                          "longest choice, over the %d cap"
                          % (n_longest, ASSIGN_ERROR_MAX_LONGEST),
                          "make some distractors as long as or longer than the error"))
    if n_multi_longest > ASSIGN_ERROR_MAX_LONGEST:
        errors.append(Err("assign", "data.js", None,
                          "multi deck has %d items whose correct set has the largest "
                          "mean length, over the %d cap"
                          % (n_multi_longest, ASSIGN_ERROR_MAX_LONGEST),
                          "vary option lengths; do not let the correct set dominate"))
    if n_long_spans < ASSIGN_ERROR_MIN_LONG_SPANS:
        errors.append(Err("assign", "data.js", None,
                          "err deck has only %d correct spans of 4+ words; at least "
                          "%d are required"
                          % (n_long_spans, ASSIGN_ERROR_MIN_LONG_SPANS),
                          "make at least 3 errors a phrase, clause, or sentence"))


def _validate_assignment_dag(data, errors, dag_cfg):
    title = data.get("title")
    scenario = data.get("scenario")
    if not isinstance(title, str) or not title.strip():
        errors.append(Err("assign", "data.js", None,
                          "dag assignment needs a non-empty title", ""))
    if not isinstance(scenario, str) or not scenario.strip():
        errors.append(Err("assign", "data.js", None,
                          "dag assignment needs a non-empty scenario", ""))
    if "intro" in data and data["intro"] is not None and not isinstance(data["intro"], str):
        errors.append(Err("assign", "data.js", None, "intro must be a string", ""))
    nodes = data.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        errors.append(Err("assign", "data.js", None,
                          "dag assignment needs a non-empty nodes array", ""))
        return

    dag_cfg = dag_cfg or {}
    levels_cfg = dag_cfg.get("levels")
    max_nodes_cfg = dag_cfg.get("max_nodes")
    if not isinstance(levels_cfg, int) or isinstance(levels_cfg, bool):
        lvls = [n.get("level") for n in nodes
                if isinstance(n, dict)
                and isinstance(n.get("level"), int)
                and not isinstance(n.get("level"), bool)]
        if not lvls:
            errors.append(Err("assign", "data.js", None,
                              "cannot infer dag levels — no node has a valid integer level",
                              "pass dag.levels in build.json or fix node levels"))
            return
        levels_cfg = max(lvls) + 1
    if not isinstance(max_nodes_cfg, int) or isinstance(max_nodes_cfg, bool):
        max_nodes_cfg = 16

    if len(nodes) > max_nodes_cfg:
        errors.append(Err("assign", "data.js", None,
                          "dag has %d nodes, max_nodes is %d"
                          % (len(nodes), max_nodes_cfg),
                          "reuse nodes (convergence) or raise dag.max_nodes in build.json"))

    ids = set()
    for n in nodes:
        nid = n.get("id") if isinstance(n, dict) else None
        if not isinstance(nid, str) or not re.match(r"^n\d+$", nid):
            errors.append(Err("assign", "data.js", None,
                              "dag node id %r must match n0, n1, …" % (nid,), ""))
            return
        if nid in ids:
            errors.append(Err("assign", "data.js", None,
                              "duplicate dag node id %s" % nid, ""))
            return
        ids.add(nid)

    roots = [n for n in nodes if n.get("level") == 0]
    if len(roots) != 1:
        errors.append(Err("assign", "data.js", None,
                          "dag needs exactly one level-0 root, found %d" % len(roots),
                          "mark the start node level 0; all others level 1..levels-1"))
        return
    root_id = roots[0]["id"]
    struct_ok = True

    for n in nodes:
        lvl = n.get("level")
        if not isinstance(lvl, int) or isinstance(lvl, bool) or not (0 <= lvl < levels_cfg):
            errors.append(Err("assign", "data.js", None,
                              "node %s level %r out of range 0..%d"
                              % (n.get("id"), lvl, levels_cfg - 1),
                              "fix dag.levels in build.json or the node's level"))
            return
        q = n.get("question")
        if not isinstance(q, str) or not q.strip():
            errors.append(Err("assign", "data.js", None,
                              "node %s has an empty question" % n.get("id"), ""))
        elif not n.get("isLeaf") and _wc(q) < 15:
            errors.append(Err("assign", "data.js", None,
                              "node %s question has %d words (<15) — situation-first "
                              "(dag-craft.md)" % (n.get("id"), _wc(q)),
                              "restate the learner's situation before the decision"))
        if n.get("isLeaf"):
            if n.get("choices"):
                errors.append(Err("assign", "data.js", None,
                                  "leaf %s must have choices: []" % n.get("id"), ""))
            if not str(n.get("finalOutcome") or "").strip():
                errors.append(Err("assign", "data.js", None,
                                  "leaf %s needs a non-empty finalOutcome" % n.get("id"), ""))
        else:
            if n.get("finalOutcome"):
                errors.append(Err("assign", "data.js", None,
                                  "non-leaf %s must not carry finalOutcome" % n.get("id"), ""))
            chs = n.get("choices")
            if not isinstance(chs, list) or not (2 <= len(chs) <= 4):
                errors.append(Err("assign", "data.js", None,
                                  "node %s needs 2-4 choices (got %s)"
                                  % (n.get("id"), len(chs) if isinstance(chs, list) else None), ""))
                struct_ok = False
            else:
                lens = []
                for i, c in enumerate(chs):
                    if not isinstance(c, dict):
                        errors.append(Err("assign", "data.js", None,
                                          "node %s choice %d must be an object, got %s"
                                          % (n.get("id"), i, type(c).__name__),
                                          "each choice needs label, text, points, nextNodeId"))
                        struct_ok = False
                        continue
                    if c.get("label") != "ABCD"[i]:
                        errors.append(Err("assign", "data.js", None,
                                          "node %s choice %d label must be %r, got %r"
                                          % (n.get("id"), i, "ABCD"[i], c.get("label")), ""))
                        struct_ok = False
                    txt = c.get("text")
                    if not isinstance(txt, str) or not txt.strip():
                        errors.append(Err("assign", "data.js", None,
                                          "node %s choice %d has empty text"
                                          % (n.get("id"), i), ""))
                    pts = c.get("points")
                    if not isinstance(pts, int) or isinstance(pts, bool) or not (0 <= pts <= 10):
                        errors.append(Err("assign", "data.js", None,
                                          "node %s choice %d points must be int 0..10"
                                          % (n.get("id"), i), ""))
                        struct_ok = False
                    nxt = c.get("nextNodeId")
                    if not isinstance(nxt, str) or nxt not in ids:
                        errors.append(Err("assign", "data.js", None,
                                          "node %s choice %d nextNodeId %r not found"
                                          % (n.get("id"), i, nxt),
                                          "point at an existing higher-level node"))
                        struct_ok = False
                    else:
                        tgt = next(x for x in nodes if x["id"] == nxt)
                        if not (tgt.get("level", 0) > n.get("level", 0)):
                            errors.append(Err("assign", "data.js", None,
                                              "node %s → %s does not increase level "
                                              "(%s → %s) — DAG edges must go forward"
                                              % (n.get("id"), nxt, n.get("level"),
                                                 tgt.get("level")),
                                              "re-wire the choice or fix levels"))
                            struct_ok = False
                    lens.append(_wc(txt))
                if lens:
                    mn, mx = min(lens), max(lens)
                    if mn < 3 or mn * 4 < mx * 3:
                        errors.append(Err("assign", "data.js", None,
                                          "node %s choices vary %d..%d words — keep each ≥3 "
                                          "and within ±25%% (dag-craft.md)"
                                          % (n.get("id"), mn, mx),
                                          "rebalance choice texts at this node"))
        if n.get("level") == 0:
            if n.get("outcome") not in (None, ""):
                errors.append(Err("assign", "data.js", None,
                                  "root outcome must be null", ""))
        else:
            if not str(n.get("outcome") or "").strip():
                errors.append(Err("assign", "data.js", None,
                                  "node %s needs a non-empty outcome" % n.get("id"),
                                  "outcome = consequence of the incoming choice"))

    # reachability from root
    by_id = {n["id"]: n for n in nodes}
    seen = set()
    stack = [root_id]
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        chs = by_id[cur].get("choices")
        if isinstance(chs, list):
            for c in chs:
                t = c.get("nextNodeId") if isinstance(c, dict) else None
                if t in by_id and t not in seen:
                    stack.append(t)
    unreachable = ids - seen
    if unreachable:
        errors.append(Err("assign", "data.js", None,
                          "unreachable dag node(s): %s"
                          % ", ".join(sorted(unreachable)),
                          "every node must be reachable from the root"))

    # pure-chain rejection: a dag assignment must actually branch
    if struct_ok:
        branch_found = False
        for n in nodes:
            if n.get("isLeaf"):
                continue
            chs = n.get("choices")
            if not isinstance(chs, list):
                continue
            targets = {c.get("nextNodeId") for c in chs
                       if isinstance(c, dict) and c.get("nextNodeId")}
            if len(targets) >= 2:
                branch_found = True
                break
        if not branch_found:
            errors.append(Err("assign", "data.js", None,
                              "dag has no branching decision — a pure chain is not "
                              "a DAG assignment",
                              "add a branching decision: at least one node must offer "
                              "choices to 2+ different next nodes"))

    # gold-path rules (only when structure is sound enough to walk)
    if struct_ok and not unreachable:
        opt = _dag_optimal(nodes)
        if opt["path_count"] < 1:
            errors.append(Err("assign", "data.js", None,
                              "dag has no complete root-to-leaf path",
                              "mark at least one reachable node as a leaf"))
        elif opt["max_count"] != 1:
            errors.append(Err("assign", "data.js", None,
                              "gold path is not unique — %d paths tie at %d points"
                              % (opt["max_count"], opt["max_score"]),
                              "one path must be strictly highest (dag-craft.md gold rule)"))
        elif not opt["node_level_ok"]:
            errors.append(Err("assign", "data.js", None,
                              "gold edge is not strictly highest at its node",
                              "gold choice must out-point every sibling on the path"))


DAG_DEFAULT = {"levels": 5, "max_nodes": 16}


def _resolve_dag_cfg(dag):
    """Merge an explicit dag block onto the maxed-out defaults. dag may be None."""
    resolved = {"levels": DAG_DEFAULT["levels"], "max_nodes": DAG_DEFAULT["max_nodes"]}
    if isinstance(dag, dict):
        if "levels" in dag:
            resolved["levels"] = dag["levels"]
        if "max_nodes" in dag:
            resolved["max_nodes"] = dag["max_nodes"]
    return resolved


def validate_assign_cfg(cfg, errors):
    """Validate build.json assignment/dag keys. cfg may be any dict (or empty)."""
    if not isinstance(cfg, dict):
        return
    comps = cfg.get("components") if isinstance(cfg.get("components"), list) else []
    if "assignment" not in comps and "assignment" not in cfg and "dag" not in cfg:
        return
    mode = cfg.get("assignment", "mixed")
    if mode not in ("flat", "dag", "graph", "error", "mixed"):
        errors.append(Err("build.json", "build.json", None,
                          "assignment must be \"mixed\", \"error\", \"flat\", "
                          "\"dag\", or \"graph\", got %r" % (mode,),
                          "omit assignment for mixed, or set \"error\" / "
                          "\"flat\" / \"dag\" / \"graph\""))
        return
    if "dag" in cfg and mode != "dag":
        errors.append(Err("build.json", "build.json", None,
                          "dag config present in build.json but assignment is %r"
                          % (mode,),
                          "drop the dag key, or set \"assignment\": \"dag\""))
    if mode not in ("dag", "error", "mixed"):
        return
    if "assignment" not in comps:
        errors.append(Err("build.json", "build.json", None,
                          "%s assignment requires the assignment component" % mode,
                          "add \"assignment\" to components"))
    if mode != "dag":
        return
    dag = cfg.get("dag")
    if dag is not None and not isinstance(dag, dict):
        errors.append(Err("build.json", "build.json", None,
                          "dag must be an object when present",
                          "add \"dag\": {\"levels\": 2..5, \"max_nodes\": …} or omit it"))
        return
    extra = set(dag or {}) - {"levels", "max_nodes"}
    if extra:
        errors.append(Err("build.json", "build.json", None,
                          "dag has unknown keys: %s" % ", ".join(sorted(extra)),
                          "allowed: levels, max_nodes"))
        return
    # An omitted dag block means the maxed-out defaults (levels 5, max_nodes 16).
    dag = _resolve_dag_cfg(dag)
    levels, max_nodes = dag["levels"], dag["max_nodes"]
    levels_ok = isinstance(levels, int) and not isinstance(levels, bool) and 2 <= levels <= 5
    if not levels_ok:
        errors.append(Err("build.json", "build.json", None,
                          "dag.levels must be an integer 2..5, got %r" % (levels,),
                          "set levels between 2 and 5"))
    if not isinstance(max_nodes, int) or isinstance(max_nodes, bool):
        errors.append(Err("build.json", "build.json", None,
                          "dag.max_nodes must be an integer, got %r" % (max_nodes,),
                          "set max_nodes between levels+1 and 16"))
    elif levels_ok and not (levels + 1 <= max_nodes <= 16):
        errors.append(Err("build.json", "build.json", None,
                          "dag.max_nodes must satisfy %d <= max_nodes <= 16, got %d"
                          % (levels + 1, max_nodes),
                          "a pure chain is not a DAG assignment; budget ≤16"))
    # Record the effective config (defaults merged in) for the teacher key.
    cfg["dag"] = dag


def write_key_file(run_dir, cfg, data, keys):
    kf = Path(run_dir) / "build" / "key" / (Path(cfg["output"]).stem + "-key.json")
    kf.parent.mkdir(parents=True, exist_ok=True)
    body = {
        "lesson": cfg["title"], "output": cfg["output"],
        "week": cfg["week"], "subject": cfg["subject"],
        "key_id": keys["id"], "public_key_b64": keys["pub_b64"],
        "teacher_key_pem": keys["pem_text"],
        "decrypt": "python v2/tools/decrypt.py --key build/key/%s <submissions…>"
                   % (Path(cfg["output"]).stem + "-key.json"),
    }
    win = cfg.get("window") if isinstance(cfg.get("window"), dict) else {}
    body["window"] = {
        "day": win.get("day") if win.get("day") in WINDOW_DAYS else WINDOW_DEFAULT["day"],
        "tz": win.get("tz") if isinstance(win.get("tz"), str) and win.get("tz").strip()
              else WINDOW_DEFAULT["tz"],
    }
    if (data or {}).get("mode") == "graph":
        rows = []
        for n, it in enumerate(data.get("items") or [], 1):
            rows.append({
                "n": n, "type": it.get("type"),
                "situation": it.get("situation", ""),
                "figure": it.get("figure", ""),
                "prompt": it.get("prompt", ""),
                "choices": it.get("choices") or [],
                "ans": it.get("ans"),
            })
        body["mode"] = "graph"
        body["items"] = rows
        body["graph"] = {
            "figures": data.get("figures") or {},
            "intro": data.get("intro", ""),
            "items": rows,
        }
    elif (data or {}).get("mode") == "dag":
        opt = _dag_optimal(data.get("nodes") or [])
        dagcfg = cfg.get("dag") if isinstance(cfg.get("dag"), dict) else _resolve_dag_cfg(None)
        body["mode"] = "dag"
        body["dag"] = {
            "levels": dagcfg.get("levels"),
            "max_nodes": dagcfg.get("max_nodes"),
            "title": data.get("title", ""),
            "scenario": data.get("scenario", ""),
            "nodes": data.get("nodes") or [],
            "optimal": {"path": opt["path"], "max_score": opt["max_score"]},
        }
    elif (data or {}).get("mode") == "error":
        rows = []
        for n, it in enumerate(data.get("items") or [], 1):
            row = {
                "n": n, "type": it.get("type"),
                "prompt": it.get("prompt", ""),
                "choices": it.get("choices") or [],
                "ans": it.get("ans"),
            }
            if it.get("type") == "err":
                row["statement"] = it.get("statement", "")
            rows.append(row)
        body["mode"] = "error"
        body["items"] = rows
    elif (data or {}).get("mode") == "mixed":
        rows = []
        for n, it in enumerate(data.get("items") or [], 1):
            row = {"n": n, "type": it.get("type"),
                   "prompt": it.get("prompt", ""), "ans": it.get("ans")}
            if it.get("type") in ("mc", "multi"):
                row["choices"] = it.get("choices") or []
            rows.append(row)
        body["mode"] = "mixed"
        body["items"] = rows
    else:
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
                # SA fields validated by validate_assignment (rubric: str, max_points: positive int)
                row.update(key_points=it["key_points"], rubric=it["rubric"],
                           max_points=it["max_points"])
            rows.append(row)
        body["items"] = rows
    kf.write_text(json.dumps(body, ensure_ascii=False, indent=1), encoding="utf-8")
    return kf


def assemble(workdir, skeleton):
    errors = []
    cfg_path = workdir / "build.json"
    cfg = None
    if cfg_path.exists():
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8-sig"))
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
        unknown = set(cfg) - {"title", "theme", "components", "output",
                              "extra_css", "extra_js", "week", "subject",
                              "assignment", "dag", "window", "layout", "labs",
                              "minutes"}
        if unknown:
            errors.append(Err("build.json", "build.json", None,
                              "unknown keys: %s" % ", ".join(sorted(unknown)),
                              "allowed: title, theme, components, output, extra_css, "
                              "extra_js, week, subject, assignment, dag, window, layout, labs, "
                              "minutes"))
        labs = cfg.get("labs", False)
        if not isinstance(labs, bool):
            errors.append(Err("build.json", "build.json", None,
                              "labs must be true or false",
                              'use "labs": true to opt into lab components'))
        elif not labs:
            for comp in cfg.get("components", []):
                if isinstance(comp, str) and comp.endswith("-lab"):
                    errors.append(Err(
                        "build.json", "build.json", None,
                        "%r is a lab, but labs are off by default" % comp,
                        'set "labs": true in build.json, or mount a practice '
                        "set/activity instead"))
        if "assignment" in cfg.get("components", []) or "assignment" in cfg or "dag" in cfg:
            validate_assign_cfg(cfg, errors)
        validate_window_cfg(cfg, errors)
        if "assignment" in cfg.get("components", []):
            for k in ("week", "subject"):
                if not cfg.get(k):
                    errors.append(Err("build.json", "build.json", None,
                                      "assignment builds need %r" % k,
                                      "assignment components require week + subject"))
        w = cfg.get("week")
        if "week" in cfg and (not isinstance(w, int) or isinstance(w, bool)
                              or w < 1):
            errors.append(Err("build.json", "build.json", None,
                              "week must be an integer >= 1, got %r" % (w,),
                              "set week to a positive integer"))
        if not isinstance(cfg.get("components"), list) or not cfg.get("components"):
            errors.append(Err("build.json", "build.json", None,
                              "components must be a non-empty list", ""))
            cfg["components"] = []
        mins = cfg.get("minutes", 60)
        if (not isinstance(mins, int) or isinstance(mins, bool)
                or not 5 <= mins <= 240):
            errors.append(Err(
                "build.json", "build.json", None,
                "minutes must be an integer 5-240, got %r" % (mins,),
                "use the class length in minutes; default 60"))
    if errors:
        return None, errors, {}

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
    tune_f = workdir / "tune.css"
    if not tune_f.exists():
        errors.append(Err("files", "tune.css", None, "missing in workdir",
                          "the required parts are build.json, tune.css, and the "
                          "sections/data pair (monolith or parts/)"))
    else:
        parts["tune"] = read_text(tune_f, errors)
    sections_text = merge_parts(workdir, "sections.html", ".sections.html", errors)
    data_text = merge_parts(workdir, "data.js", ".data.js", errors)
    if sections_text is not None:
        parts["sections"] = sections_text
    if data_text is not None:
        parts["data"] = data_text
    if "sections" not in parts or "data" not in parts:
        parts.setdefault("sections", "")
        parts.setdefault("data", "")
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
        return None, errors, {}

    for marker in MARKERS:
        n = shell.count(marker)
        if n < 1 or (n != 1 and marker != "__TITLE__"):
            errors.append(Err("markers", "skeleton/shell.html", None,
                              "marker %s occurs %d times" % (marker, n),
                              "every marker exactly once; title may appear in more than one slot"))

    theme_css = read_text(themes_dir / (cfg["theme"] + ".css"), errors) or ""
    sections_full = append_references(workdir, parts["sections"], errors)
    check_tune(parts["tune"], errors)
    check_outline(workdir, sections_full, errors)
    check_mounts(parts["sections"], parts["data"], set(cfg["components"]), errors)
    check_def_kinds(parts["sections"], errors)
    check_practice(parts["sections"], parts["data"], errors)
    check_present(sections_full, errors)
    check_provenance(parts["sections"], parts["data"], errors)

    prose_report = prose_lint.lint_text(
        parts["sections"],
        glossary=prose_lint.glossary_terms(parts["data"]))
    (workdir / "prose-review.json").write_text(
        json.dumps(prose_report, ensure_ascii=False, indent=2),
        encoding="utf-8")
    for finding in prose_report["fails"]:
        errors.append(Err(
            finding["rule"], "sections.html", None,
            "%s \u00b6%d: %s" % (finding["section"], finding["paragraph"],
                            finding["detail"]),
            finding["fix"]))

    pacing_report = pacing_lint.lint_text(
        parts["sections"], minutes=cfg.get("minutes", pacing_lint.LESSON_MINUTES))
    (workdir / "pacing-review.json").write_text(
        json.dumps(pacing_report, ensure_ascii=False, indent=2),
        encoding="utf-8")
    for finding in pacing_report["fails"]:
        detail = finding["detail"]
        if finding["section"] != "-":
            detail = "%s: %s" % (finding["section"], detail)
        errors.append(Err(finding["rule"], "sections.html", None,
                          detail, finding["fix"]))

    assign_data, keys, ka, unlock_key = None, None, None, None
    if "assignment" in cfg["components"]:
        ka, assign_data = extract_assignment(parts["sections"], parts["data"], errors)
        if assign_data is not None:
            validate_assignment(
                assign_data, errors,
                expected_mode=cfg.get("assignment", "mixed"),
                dag_cfg=cfg.get("dag") if isinstance(cfg.get("dag"), dict) else None)
        try:
            stem = Path(cfg["output"]).stem if cfg.get("output") else None
            keys = ensure_teacher_keys(Path.cwd() / "build" / "key",
                                       output_stem=stem)
        except ValueError as exc:
            errors.append(Err("assign", "build/key/%s-key.json" % (stem or "output"),
                              None, str(exc),
                              "restore the lesson -key.json from backup, or rebuild "
                              "(a fresh key orphans old submissions)"))
        try:
            unlock_key, _unlock_b64 = ensure_unlock_key(
                Path.cwd() / "build" / "key")
        except ValueError as exc:
            errors.append(Err("assign", "build/key/unlock.key", None, str(exc),
                              "restore build/key/unlock.key from backup, or set "
                              "the LN_UNLOCK_KEY env to the Worker secret value "
                              "(a fresh key orphans old lessons)"))
    check_wellformed(sections_full, "sections.html", errors)
    errors.extend(check_js(parts["data"], "data.js"))
    errors.extend(scan(parts["sections"], HEX_RE, "hex", "sections.html",
                       "hard-coded colour", "sections use classes; colours come from tokens"))
    errors.extend(scan(parts["data"], HEX_RE, "hex", "data.js",
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
        check_grid(css_t, "%s/component.css" % c, errors)
        comp_css.append("/* component: %s */\n%s" % (c, css_t))
        comp_js.append("%s\n" % js_t.strip())
    for fname, text in extras["extra_css"]:
        errors.extend(scan(text, HEX_RE, "hex", fname, "hard-coded colour",
                           "extra.css is component-level CSS: var(--token) only"))
        check_grid(text, fname, errors)
        comp_css.append("/* extra: %s */\n%s" % (fname, text))
    for fname, text in extras["extra_js"]:
        errors.extend(check_js(text, fname))
        comp_js.append("%s\n" % text.strip())

    if assign_data and keys:
        for _ix, c in enumerate(cfg["components"]):
            if c == "assignment":
                comp_js[_ix] = (comp_js[_ix]
                                .replace("__PUBKEY__", keys["pub_b64"])
                                .replace("__KEYID__", keys["id"]))

    layout_name = cfg.get("layout") or "app"
    layouts_dir = skeleton / "layouts"
    available_layouts = sorted(
        p.name for p in layouts_dir.iterdir()
        if p.is_dir() and (p / "layout.css").exists()
        and (p / "layout.js").exists() and (p / "chrome.html").exists()
    ) if layouts_dir.is_dir() else []
    layout_css = layout_js = layout_chrome = ""
    if layout_name != "app":
        errors.append(Err("layout", "build.json", None,
                          "layout is pinned to \"app\" (v2.12), got %r"
                          % (layout_name,),
                          "set \"layout\": \"app\" or omit the key"))
    elif layout_name not in available_layouts:
        layout_hint = "pick one of the shipped layouts"
        if not layouts_dir.is_dir():
            layout_hint += "; this skeleton has no layouts/ directory"
        errors.append(Err("layout", "build.json", None,
                          "unknown layout %r; available: %s"
                          % (layout_name, ", ".join(available_layouts) or "(none)"),
                          layout_hint))
    else:
        layout_css = read_text(layouts_dir / layout_name / "layout.css", errors) or ""
        layout_js = read_text(layouts_dir / layout_name / "layout.js", errors) or ""
        layout_chrome = read_text(layouts_dir / layout_name / "chrome.html", errors) or ""
        errors.extend(scan(layout_css, HEX_RE, "hex", "layouts/%s/layout.css" % layout_name,
                           "hard-coded colour", "layout colours come from tokens"))
        errors.extend(scan(layout_css, EXTERNAL_RE, "external", "layouts/%s/layout.css" % layout_name,
                           "external asset", "textures must be pure CSS"))
        check_grid(layout_css, "layouts/%s/layout.css" % layout_name, errors)
        errors.extend(check_js(layout_js, "layouts/%s/layout.js" % layout_name))
        errors.extend(scan(layout_js, EXTERNAL_RE, "external", "layouts/%s/layout.js" % layout_name,
                           "external asset", "no http, no @import"))
        errors.extend(scan(layout_chrome, HEX_RE, "hex", "layouts/%s/chrome.html" % layout_name,
                           "hard-coded colour", "chrome colours come from tokens"))
        errors.extend(scan(layout_chrome, EXTERNAL_RE, "external", "layouts/%s/chrome.html" % layout_name,
                           "external asset", "no http, no @import"))

    shell_for_hex = re.sub(r"/\*HEXOK\*/.*?/\*ENDHEX\*/",
                           lambda m: "\n" * m.group(0).count("\n"), shell, flags=re.S)
    errors.extend(scan(shell_for_hex, HEX_RE, "hex", "skeleton/shell.html",
                       "hard-coded colour outside print block",
                       "move it into a theme pack"))
    for text, fname in [(theme_css, "themes/%s.css" % cfg["theme"]),
                        (parts["tune"], "tune.css"), (parts["sections"], "sections.html"),
                        (parts["data"], "data.js"), (shell, "skeleton/shell.html")] + \
                       [(t, f) for f, t in extras["extra_css"] + extras["extra_js"]]:
        errors.extend(scan(text, EXTERNAL_RE, "external", fname,
                           "external asset", "no http, no @import, gradient-only url()"))

    title = html.escape(str(cfg["title"]), quote=True)
    out = shell
    out = out.replace("/*__LAYOUT_CSS__*/", layout_css)
    out = out.replace("<!--__LAYOUT_CHROME__-->", layout_chrome)
    out = out.replace("/*__LAYOUT_JS__*/", layout_js)
    out = out.replace("__LAYOUT__", layout_name)
    out = out.replace("__TITLE__", title)
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
    out = out.replace("/*__THEME__*/", theme_css)
    out = out.replace("/*__TUNE__*/", parts["tune"])
    out = out.replace("/*__COMPONENT_CSS__*/", "\n".join(comp_css))
    out = out.replace("<!--__SECTIONS__-->", sections_full)
    data_out = parts["data"]
    if ka and assign_data is not None and keys:
        data_out = sanitize_assignment_data(data_out, ka, assign_data)
        if unlock_key is not None:
            data_out = encrypt_assignment_data(data_out, ka, unlock_key)
    out = out.replace("/*__DATA__*/", data_out)
    out = out.replace("/*__COMPONENT_JS__*/", "\n".join(comp_js) + GLUE_JS)

    errors.extend(scan(out, LEFTOVER_RE, "markers", "(output)",
                       "unsubstituted marker", "check the shell marker table"))
    check_wellformed(out, "(output)", errors)
    check_ids(out, sections_full, errors)
    check_contrast(theme_css, parts["tune"], errors)
    if "@media print" not in out:
        errors.append(Err("print", "skeleton/shell.html", None,
                          "no @media print block found",
                          "shell must ship the mandatory print override"))

    if errors:
        return None, errors, {}
    return out, errors, {"assign": assign_data, "keys": keys}


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
    if "--skeleton" in argv:
        i = argv.index("--skeleton")
        if i + 1 >= len(argv):
            print("FAIL\tusage: build.py <workdir> [--skeleton DIR]")
            return 2
        skeleton = Path(argv[i + 1])
        del argv[i:i + 2]
    if len(argv) != 1 or not Path(argv[0]).is_dir():
        print("usage: python build.py <workdir> [--skeleton DIR]")
        return 2
    workdir = Path(argv[0]).resolve()
    out, errors, ctx = assemble(workdir, skeleton)
    if errors:
        report(errors)
        print("FAIL - %d problem(s); no output written." % len(errors))
        return 1
    cfg = json.loads((workdir / "build.json").read_text(encoding="utf-8-sig"))
    out_path = Path(cfg["output"])
    if not out_path.is_absolute():
        out_path = Path.cwd() / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(out, encoding="utf-8", newline="\n")
    print("OK - wrote %s (%d lines)" % (out_path, out.count("\n") + 1))
    if ctx["assign"] and ctx["keys"]:
        kf = write_key_file(Path.cwd(), cfg, ctx["assign"], ctx["keys"])
        print("OK - wrote %s" % kf)
    return 0


if __name__ == "__main__":
    sys.exit(main())
