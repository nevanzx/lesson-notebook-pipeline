from pathlib import Path

import build
from test_components_matrix import ALL, make_real_wd

REPO = Path(__file__).resolve().parents[1]
SKEL = REPO / "v2" / "skeleton"

PACKS = ["ledger", "opal", "parchment", "studio"]


def test_every_pack_builds(tmp_path):
    for pack in PACKS:
        wd = make_real_wd(tmp_path / pack, ALL, theme=pack)
        out, errs, _ = build.assemble(wd, SKEL)
        assert errs == [], (pack, [str(e) for e in errs])
        assert "repeating-linear-gradient" in out or "radial-gradient" in out, \
            pack + " ships no .sheet texture"


def test_pack_names_exact():
    found = sorted(p.stem for p in (SKEL / "themes").glob("*.css"))
    assert found == sorted(PACKS), "theme pack set must match spec §3.1"
