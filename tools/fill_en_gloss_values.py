import json, sys
from pathlib import Path

def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))

def save(p: Path, obj):
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def main():
    # Usage:
    #   python tools/fill_en_gloss_values.py          -> fills all courses
    #   python tools/fill_en_gloss_values.py hi bn   -> fills only those courses
    courses_dir = Path("courses")
    if not courses_dir.exists():
        raise SystemExit("ERROR: no ./courses folder (run from repo root)")

    only = [a.strip().lower() for a in sys.argv[1:] if a.strip()]
    course_dirs = []
    if only:
        for c in only:
            d = courses_dir / c
            if not d.exists():
                print(f"SKIP missing course folder: {d}")
                continue
            course_dirs.append(d)
    else:
        course_dirs = [p for p in courses_dir.iterdir() if p.is_dir() and not p.name.startswith("_")]

    total_before_blank = 0
    total_filled = 0

    for d in sorted(course_dirs, key=lambda x: x.name):
        en_path = d / "overlays" / "en.json"
        if not en_path.exists():
            print(f"[{d.name}] SKIP no overlays/en.json")
            continue

        o = load(en_path)
        g = o.get("gloss", None)
        if not isinstance(g, dict):
            print(f"[{d.name}] SKIP gloss not a dict in {en_path.as_posix()}")
            continue

        blanks = [k for k, v in g.items() if (v is None) or (isinstance(v, str) and v.strip() == "")]
        before = len(blanks)
        total_before_blank += before

        filled_here = 0
        for k in blanks:
            # Fill English value with the key itself
            g[k] = k
            filled_here += 1

        if filled_here:
            o["gloss"] = g
            save(en_path, o)

        total_filled += filled_here
        print(f"[{d.name}] blanks_before={before} filled={filled_here} -> {en_path.as_posix()}")

    print("\nDONE")
    print("Total blanks found:", total_before_blank)
    print("Total filled:", total_filled)

if __name__ == "__main__":
    main()
