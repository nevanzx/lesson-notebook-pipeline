#!/usr/bin/env python
"""Tests for the citation-search caps (build.py) - written before the code.

Run:  python v2/tools/test_refs_cap.py
Exit 0 = every case behaved; exit 1 = at least one failure.

Covers the one seam the cap passes through:
  * merge_refs - the pool is capped (root refs.json), and each section
    sidecar is capped in size and in how many of its works may sit
    outside the pool (the per-author fallback budget).
"""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

BUILD_PY = Path(__file__).resolve().parent.parent / "build.py"


def load_build():
    spec = importlib.util.spec_from_file_location("nb_build", BUILD_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def ref(key, author, year):
    """A distinct APA-7-style entry."""
    return {"key": key, "text": "%s (202%d). %s study notes." % (author, year % 10, author)}


def write(path, refs):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"refs": refs}, indent=1), encoding="utf-8")


def build_dir(root_refs, sidecars):
    """refs.json = root pool; sidecars = {filename: [refs]} under parts/."""
    d = Path(tempfile.mkdtemp(dir=r"C:\Users\Daneve\AppData\Local\Temp\opencode"))
    if root_refs is not None:
        write(d / "refs.json", root_refs)
    for name, refs in sidecars.items():
        write(d / "parts" / name, refs)
    return d


def errs_for(mod, root_refs, sidecars):
    errors = []
    mod.merge_refs(build_dir(root_refs, sidecars), errors)
    return [str(e) for e in errors]


def main():
    failures = []

    def check(name, cond, detail=""):
        if cond:
            print("ok   %s" % name)
        else:
            print("FAIL %s%s" % (name, (" - " + detail) if detail else ""))
            failures.append(name)

    try:
        mod = load_build()
    except Exception as exc:  # pragma: no cover
        print("FAIL could not import build.py: %r" % (exc,))
        return 1

    POOL12 = [ref("w%02d" % i, "Author%02d" % i, i) for i in range(12)]

    print("-- baseline: legal builds must pass --")
    check("pool of 12 + all-pool sidecar has no errors",
          not errs_for(mod, POOL12, {"01-over.refs.json": POOL12[:2]}),
          str(errs_for(mod, POOL12, {"01-over.refs.json": POOL12[:2]})))
    check("six sidecar entries fit the size cap",
          not errs_for(mod, POOL12, {"01-over.refs.json": POOL12[:6]}),
          str(errs_for(mod, POOL12, {"01-over.refs.json": POOL12[:6]})))
    check("two out-of-pool sidecar entries fit the fallback budget",
          not errs_for(mod, POOL12, {"01-over.refs.json":
                                     POOL12[:2] + [ref("x1", "NewA", 1), ref("x2", "NewB", 2)]}),
          "")
    check("monolith (no parts/) is unaffected",
          not errs_for(mod, POOL12, {}),
          str(errs_for(mod, POOL12, {})))
    check("sidecars only, no root pool, all small",
          not errs_for(mod, None, {"01-over.refs.json": POOL12[:5]}),
          "")

    print("-- cap set --")
    msg = refs = errs_for(mod, POOL12 + [ref("w13", "Author13", 3),
                                         ref("w14", "Author14", 4)], {})
    check("root pool over 12 works fails", bool(msg), "; ".join(msg))

    seven = POOL12[:6] + [ref("w13", "Author13", 3)]
    msg = errs_for(mod, POOL12, {"01-over.refs.json": seven})
    check("sidecar over 6 entries fails", bool(msg), "; ".join(msg))

    msg = errs_for(mod, POOL12, {"01-over.refs.json":
                                 POOL12[:1] + [ref("x%d" % i, "New%d" % i, i) for i in range(3)],
                                 "02-glossary.refs.json":
                                 POOL12[3:5] + [ref("y1", "NewB", 1)]})
    check("sidecar over 2 out-of-pool entries fails", bool(msg), "; ".join(msg))
    check("a second sidecar within the fallback does not fail",
          all("02-glossary" not in m for m in msg), "; ".join(msg))

    print()
    if failures:
        print("FAILED: %d case(s): %s" % (len(failures), ", ".join(failures)))
        return 1
    print("all refs-cap cases behaved")
    return 0


if __name__ == "__main__":
    sys.exit(main())
