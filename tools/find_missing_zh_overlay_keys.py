import json, os, re
from pathlib import Path

COURSE = "zh"
ROOT = Path(".")
OVERLAY_PATH = ROOT / "courses" / COURSE / "overlays" / "zh.json"
LESSONS_DIR = ROOT / "courses" / COURSE / "lessons"

def load_json(p: Path):
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)

def collect_strings(obj, out):
    """Collect all string values recursively from nested dict/list."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            collect_strings(v, out)
    elif isinstance(obj, list):
        for v in obj:
            collect_strings(v, out)
    elif isinstance(obj, str):
        s = obj.strip()
        if s:
            out.add(s)

def looks_english(s: str) -> bool:
    # crude but effective: contains ASCII letters
    return bool(re.search(r"[A-Za-z]", s))

overlay = load_json(OVERLAY_PATH)
ui = overlay.get("ui", {})
gloss = overlay.get("gloss", {})

known = set(ui.keys()) | set(gloss.keys())

if not LESSONS_DIR.exists():
    raise SystemExit(f"Missing lessons folder: {LESSONS_DIR}")

all_strings = set()
for p in LESSONS_DIR.rglob("*.json"):
    try:
        data = load_json(p)
    except Exception as e:
        print(f"[WARN] failed to read {p}: {e}")
        continue
    collect_strings(data, all_strings)

# Only show strings that look like English AND are not already translated
candidates = sorted({s for s in all_strings if looks_english(s) and s not in known})

print("\n=== Missing overlay keys (English-looking strings found in lessons) ===\n")
for s in candidates:
    print(s)

print(f"\nTotal missing candidates: {len(candidates)}")
print("\nNext step: add these as keys in courses/zh/overlays/zh.json under ui or gloss.\n")
