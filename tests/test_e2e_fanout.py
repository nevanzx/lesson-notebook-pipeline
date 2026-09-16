import json
import re
import shutil
from pathlib import Path

import build

REPO = Path(__file__).resolve().parents[1]
FIX = REPO / "v2" / "sample" / "lesson-demo"


def key_of(chunk):
    return re.match(r"LN\.data\.([A-Za-z_$][\w$]*)", chunk.strip()).group(1)


def split_demo(tmp_path):
    wd = tmp_path / "lesson"
    shutil.copytree(FIX, wd)
    sections = (wd / "sections.html").read_text(encoding="utf-8")
    data = (wd / "data.js").read_text(encoding="utf-8")
    cfg = json.loads((wd / "build.json").read_text(encoding="utf-8"))
    chunks = [b.strip() for b in re.split(r"(?=<section class=\"block\")", sections) if b.strip()]
    if not chunks[0].startswith("<section"):        # <header class="lesson-head"> prelude
        chunks[1] = chunks[0] + "\n" + chunks[1]    # rides along with the overview shard
        chunks.pop(0)
    dcut = re.search(r"(?=LN\.data\.)", data)
    data_prelude, data_body = data[:dcut.start()], data[dcut.start():]
    keys = [k.strip() for k in re.split(r"(?=LN\.data\.)", data_body) if k.strip()]
    (wd / "sections").mkdir()
    (wd / "data").mkdir()
    plan = {"title": cfg["title"], "theme": cfg["theme"], "shards": []}
    used = set()
    for i, blk in enumerate(chunks):
        sid = "0" if i == 0 else ("0G" if i == 1 else str(i))
        stem = {"0": "00-part", "0G": "0G-part"}.get(sid, sid + "-part") + str(i)
        kp = "s" + sid
        names = re.findall(r'data-key="([^"]+)"', blk)
        own = [k for k in keys if key_of(k) in names]
        used.update(names)
        blk = re.sub(r'\bid="([^"]+)"', lambda m: 'id="%s.%s"' % (kp, m.group(1)), blk)
        blk = re.sub(r'data-key="([^"]+)"', lambda m: 'data-key="%s%s"' % (kp, m.group(1)), blk)
        own = [re.sub(r"LN\.data\.([A-Za-z_$][\w$]*)",
                      lambda m: "LN.data.%s%s" % (kp, m.group(1)), k) for k in own]
        if i == 0 and own:
            own[0] = data_prelude.rstrip() + "\n" + own[0]   # data.js comment rides along
        (wd / "sections" / (stem + ".html")).write_text(blk, encoding="utf-8")
        (wd / "data" / (stem + ".js")).write_text("\n".join(own), encoding="utf-8")
        plan["shards"].append({"id": sid, "section": "part %d" % i, "key_prefix": kp,
                               "files": ["sections/%s.html" % stem, "data/%s.js" % stem],
                               "components": cfg["components"],
                               "open_handoff": "x", "close_handoff": "y",
                               "must_teach": ["x"]})
    assert used == {key_of(k) for k in keys}, "each sample key mounts in exactly one section"
    (wd / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    (wd / "sections.html").unlink()
    (wd / "data.js").unlink()
    return wd, [s["id"] for s in plan["shards"]]


def test_fanout_each_shard_lints_clean(tmp_path):
    wd, ids = split_demo(tmp_path)
    for sid in ids:
        assert build.lint_shard(wd, sid) == [], "shard %s: %s" % (sid, build.lint_shard(wd, sid))


def test_fanout_full_build(tmp_path):
    wd, _ = split_demo(tmp_path)
    assert build.main([str(wd)]) == 0
    out = (wd / "Week4-Demo-Notebook.html").read_text(encoding="utf-8")
    for tok in ("562.5", "Tumba", "break-even-lab", "@media print"):
        assert tok in out, tok
