import json
from pathlib import Path

MASTER_CODE = "pt"   # change if you want another master later
COURSES_DIR = Path("courses")

def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))

def save(p: Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def is_course_dir(d: Path):
    return d.is_dir() and not d.name.startswith("_") and (d / "overlays").exists()

def main():
    master_path = COURSES_DIR / MASTER_CODE / "overlays" / "en.json"
    if not master_path.exists():
        raise SystemExit(f"Missing master: {master_path.as_posix()}")

    master = load(master_path)
    m_gloss = master.get("gloss", {})
    if not isinstance(m_gloss, dict) or not m_gloss:
        raise SystemExit("Master gloss empty/invalid")

    print("Master:", MASTER_CODE, "gloss keys:", len(m_gloss))

    changed = 0
    for course_dir in sorted([d for d in COURSES_DIR.iterdir() if is_course_dir(d)], key=lambda x: x.name):
        code = course_dir.name
        en_path = course_dir / "overlays" / "en.json"
        if not en_path.exists():
            print(f"[{code}] SKIP no overlays/en.json")
            continue

        o = load(en_path)
        o.setdefault("ui", {})
        o.setdefault("gloss", {})
        g = o["gloss"]
        if not isinstance(g, dict):
            print(f"[{code}] SKIP gloss not dict")
            continue

        before = len(g)
        added = 0
        filled = 0

        for k in m_gloss.keys():
            if k not in g:
                g[k] = k   # EN value = key
                added += 1
            else:
                v = g.get(k)
                if v is None or (isinstance(v, str) and v.strip() == ""):
                    g[k] = k
                    filled += 1

        if added or filled:
            o["gloss"] = dict(sorted(g.items(), key=lambda kv: kv[0].lower()))
            save(en_path, o)
            changed += 1
            print(f"[{code}] gloss_before={before} gloss_after={len(o['gloss'])} added={added} filled_blanks={filled}")

    print("\nDONE. Courses updated:", changed)

if __name__ == "__main__":
    main()
