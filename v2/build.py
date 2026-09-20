#!/usr/bin/env python3
"""Interactive Lesson Notebook v2.4 - parts assembler + mechanical validator.

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
"output" in build.json is honoured as-is. Python 3 stdlib only.
"""
import base64
import colorsys
import hashlib
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
    "<!--__SECTIONS__-->", "/*__DATA__*/", "/*__COMPONENT_JS__*/", "__META__",
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
GRID_TPL_RE = re.compile(r"grid-template-(?:columns|rows)\s*:\s*([^;}]+)")
MINMAX0_RE = re.compile(r"minmax\(\s*0\s*,[^)]*\)")
FR_RE = re.compile(r"(?<![\w-])(?:\d+(?:\.\d+)?|)\.?\d*fr\b")
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


def ensure_teacher_keys(key_dir):
    """Parse (or generate-once-then-parse) the run dir's teacher keypair.

    keys.pem lives at <run dir>/build/key/keys.pem, carries a PRIVATE and a
    PUBLIC PEM block. Returns {"id", "pub_b64", "pem"}; ValueError on damage.
    """
    pem_path = Path(key_dir) / "keys.pem"
    if not pem_path.exists():
        here = str(Path(__file__).resolve().parent)
        if here not in sys.path:
            sys.path.append(here)
        try:
            from tools.make_keys import generate_pem
        except ImportError as exc:
            raise ValueError("cannot create keys.pem: 'cryptography' package "
                             "missing (pip install cryptography): %s" % exc)
        generate_pem(pem_path)
    text = pem_path.read_text(encoding="utf-8")
    pm, pr = PUB_RE.search(text), PRV_RE.search(text)
    if not (pm and pr):
        raise ValueError("keys.pem unreadable: missing PUBLIC/PRIVATE PEM block "
                         "(delete the file to regenerate)")
    pub_der = base64.b64decode("".join(pm.group(1).split()))
    return {"id": key_id_for(pub_der), "pem": pem_path,
            "pub_b64": base64.b64encode(pub_der).decode("ascii")}


ASSIGN_FIXED = {"mc": 10, "tf": 4, "id": 4}
ASSIGN_SA_MIN = 2


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


def sanitize_assignment_data(data_text, key, data):
    """Rewrite LN.data.<key> in the student output without any answer material."""
    m = re.search(r"LN\.data\." + re.escape(key) + r"\s*=\s*", data_text)
    if not m:
        return data_text
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
        return data_text
    safe_items = []
    for it in (data.get("items") or []):
        row = {"type": it.get("type"), "prompt": it.get("prompt")}
        if it.get("type") == "mc":
            row["choices"] = list(it.get("choices") or [])
        safe_items.append(row)
    safe = {"intro": data.get("intro", ""), "items": safe_items}
    return data_text[:i] + json.dumps(safe, ensure_ascii=False) + data_text[end + 1:]


def validate_assignment(data, errors):
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
    for t, want in sorted(ASSIGN_FIXED.items()):
        got = counts.get(t, 0)
        if got != want:
            errors.append(Err("assign", "data.js", None,
                              "type mix has %d %s, expected exactly %d"
                              % (got, t, want),
                              "author 10 mc, 4 tf, 4 id, and 2 or more sa"))


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
            # SA fields validated by validate_assignment (rubric: str, max_points: positive int)
            row.update(key_points=it["key_points"], rubric=it["rubric"],
                       max_points=it["max_points"])
        rows.append(row)
    kf.write_text(json.dumps({
        "lesson": cfg["title"], "output": cfg["output"],
        "week": cfg["week"], "subject": cfg["subject"],
        "key_id": keys["id"], "public_key_b64": keys["pub_b64"],
        "teacher_key_pem": Path(keys["pem"]).read_text(encoding="utf-8"),
        "decrypt": "python v2/tools/decrypt.py --key build/key/%s <submissions…>"
                   % (Path(cfg["output"]).stem + "-key.json"),
        "items": rows,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
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
                              "extra_css", "extra_js", "week", "subject"}
        if unknown:
            errors.append(Err("build.json", "build.json", None,
                              "unknown keys: %s" % ", ".join(sorted(unknown)),
                              "allowed: title, theme, components, output, extra_css, extra_js, week, subject"))
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
    check_tune(parts["tune"], errors)
    check_outline(workdir, parts["sections"], errors)
    check_mounts(parts["sections"], parts["data"], set(cfg["components"]), errors)

    assign_data, keys, ka = None, None, None
    if "assignment" in cfg["components"]:
        ka, assign_data = extract_assignment(parts["sections"], parts["data"], errors)
        if assign_data is not None:
            validate_assignment(assign_data, errors)
        try:
            keys = ensure_teacher_keys(Path.cwd() / "build" / "key")
        except ValueError as exc:
            errors.append(Err("assign", "build/key/keys.pem", None, str(exc),
                              "generate or repair the teacher key file"))
    check_wellformed(parts["sections"], "sections.html", errors)
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
    out = shell.replace("__TITLE__", title)
    if "week" in cfg or "subject" in cfg:
        meta = ('<meta name="ln:week" content="%s">\n'
                '<meta name="ln:subject" content="%s">\n'
                % (html.escape(str(cfg.get("week", "?")), quote=True),
                   html.escape(str(cfg.get("subject", "")), quote=True)))
    else:
        meta = ""
    out = out.replace("__META__", meta)
    out = out.replace("/*__THEME__*/", theme_css)
    out = out.replace("/*__TUNE__*/", parts["tune"])
    out = out.replace("/*__COMPONENT_CSS__*/", "\n".join(comp_css))
    out = out.replace("<!--__SECTIONS__-->", parts["sections"])
    data_out = parts["data"]
    if ka and assign_data is not None and keys:
        data_out = sanitize_assignment_data(data_out, ka, assign_data)
    out = out.replace("/*__DATA__*/", data_out)
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
