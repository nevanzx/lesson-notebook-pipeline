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


ASSIGN_FIXED = {"mc": 10, "tf": 4, "id": 4}
ASSIGN_SA_MIN = 2


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
    else:
        safe_items = []
        for it in (data.get("items") or []):
            row = {"type": it.get("type"), "prompt": it.get("prompt")}
            if it.get("type") == "mc":
                row["choices"] = list(it.get("choices") or [])
            safe_items.append(row)
        safe = {"intro": data.get("intro", ""), "items": safe_items}
    return data_text[:i] + json.dumps(safe, ensure_ascii=False) + data_text[end + 1:]


def _wc(s):
    return len(str(s or "").split())


def validate_assignment(data, errors, expected_mode=None, dag_cfg=None):
    data = data or {}
    data_mode = data.get("mode", "flat")
    if data_mode not in ("flat", "dag"):
        errors.append(Err("assign", "data.js", None,
                          "unknown assignment mode %r" % (data_mode,),
                          "mode must be \"dag\" or omitted (flat)"))
        return
    if expected_mode is not None and data_mode != expected_mode:
        errors.append(Err("assign", "data.js", None,
                          "data mode %r != build.json assignment %r"
                          % (data_mode, expected_mode),
                          "set \"mode\": \"%s\" in the assignment data (or fix build.json)"
                          % expected_mode))
        return
    if data_mode == "dag":
        _validate_assignment_dag(data, errors, dag_cfg)
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


def _validate_assignment_dag(data, errors, dag_cfg):
    dag_cfg = dag_cfg or {}
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


def validate_assign_cfg(cfg, errors):
    """Validate build.json assignment/dag keys. cfg may be any dict (or empty)."""
    if not isinstance(cfg, dict):
        return
    comps = cfg.get("components") if isinstance(cfg.get("components"), list) else []
    mode = cfg.get("assignment", "flat")
    if mode not in ("flat", "dag"):
        errors.append(Err("build.json", "build.json", None,
                          "assignment must be \"flat\" or \"dag\", got %r" % (mode,),
                          "omit assignment for flat, or set \"dag\""))
        return
    if "dag" in cfg and mode != "dag":
        errors.append(Err("build.json", "build.json", None,
                          "dag config present in build.json but assignment is not \"dag\"",
                          "drop the dag key, or set \"assignment\": \"dag\""))
    if mode != "dag":
        return
    if "assignment" not in comps:
        errors.append(Err("build.json", "build.json", None,
                          "assignment: \"dag\" requires the assignment component",
                          "add \"assignment\" to components"))
    dag = cfg.get("dag")
    if not isinstance(dag, dict):
        errors.append(Err("build.json", "build.json", None,
                          "assignment: \"dag\" needs a dag object",
                          "add \"dag\": {\"levels\": 2..5, \"max_nodes\": …}"))
        return
    extra = set(dag) - {"levels", "max_nodes"}
    missing = {"levels", "max_nodes"} - set(dag)
    if extra or missing:
        bits = []
        if missing:
            bits.append("missing %s" % ", ".join(sorted(missing)))
        if extra:
            bits.append("unknown %s" % ", ".join(sorted(extra)))
        errors.append(Err("build.json", "build.json", None,
                          "dag keys invalid (%s)" % "; ".join(bits),
                          "allowed: levels, max_nodes"))
        return
    levels, max_nodes = dag.get("levels"), dag.get("max_nodes")
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
    if (data or {}).get("mode") == "dag":
        opt = _dag_optimal(data.get("nodes") or [])
        dagcfg = cfg.get("dag") if isinstance(cfg.get("dag"), dict) else {}
        body["mode"] = "dag"
        body["dag"] = {
            "levels": dagcfg.get("levels"),
            "max_nodes": dagcfg.get("max_nodes"),
            "title": data.get("title", ""),
            "scenario": data.get("scenario", ""),
            "nodes": data.get("nodes") or [],
            "optimal": {"path": opt["path"], "max_score": opt["max_score"]},
        }
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
                              "assignment", "dag"}
        if unknown:
            errors.append(Err("build.json", "build.json", None,
                              "unknown keys: %s" % ", ".join(sorted(unknown)),
                              "allowed: title, theme, components, output, extra_css, "
                              "extra_js, week, subject, assignment, dag"))
        if "assignment" in cfg.get("components", []) or "assignment" in cfg or "dag" in cfg:
            validate_assign_cfg(cfg, errors)
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
            validate_assignment(
                assign_data, errors,
                expected_mode=cfg.get("assignment", "flat"),
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
