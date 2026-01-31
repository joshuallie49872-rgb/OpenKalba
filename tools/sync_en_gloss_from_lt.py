import json, sys
from pathlib import Path

MASTER = Path("courses/lt/overlays/en.json")
TARGETS_DEFAULT = ["hi", "bn", "pt", "ur"]

def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))

def save(p: Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def main(targets):
    if not MASTER.exists():
        raise SystemExit(f"Missing master overlay: {MASTER.as_posix()}")

    m = load(MASTER)
    m_gloss = m.get("gloss", {})
    if not isinstance(m_gloss, dict) or not m_gloss:
        raise SystemExit("Master gloss is empty or invalid")

    print("Master gloss keys:", len(m_gloss))

    for code in targets:
        en_path = Path(f"courses/{code}/overlays/en.json")
        if not en_path.exists():
            print(f"[{code}] SKIP missing {en_path.as_posix()}")
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

        # ensure all master keys exist
        for k in m_gloss.keys():
            if k not in g:
                g[k] = k     # English value = key (NOT blank)
                added += 1
            else:
                # if it exists but blank, fill it too
                v = g.get(k)
                if v is None or (isinstance(v, str) and v.strip() == ""):
                    g[k] = k
                    filled += 1

        o["gloss"] = dict(sorted(g.items(), key=lambda kv: kv[0].lower()))
        save(en_path, o)

        after = len(o["gloss"])
        print(f"[{code}] gloss_before={before} gloss_after={after} added={added} filled_blanks={filled} -> {en_path.as_posix()}")

    print("\nDONE")

if __name__ == "__main__":
    targets = [a.strip().lower() for a in sys.argv[1:] if a.strip()]
    if not targets:
        targets = TARGETS_DEFAULT
    main(targets)
