import json, glob, os, re, sys

def load(p):
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())

def collect_strings_from_lessons(lesson_dir):
    strings = set()
    for fp in glob.glob(os.path.join(lesson_dir, "*.json")):
        data = load(fp)
        for q in data.get("questions", []):
            # UI-ish fields that must be in overlay["ui"]
            for k in ("prompt", "placeholder"):
                v = q.get(k)
                if isinstance(v, str) and norm(v):
                    strings.add(norm(v))

            # Meaning/choice strings that must be in overlay["gloss"]
            for k in ("choices", "correct"):
                arr = q.get(k)
                if isinstance(arr, list):
                    for v in arr:
                        if isinstance(v, str) and norm(v):
                            strings.add(norm(v))

            # Also include common fields that show up in translate mode
            for k in ("en", "from", "to"):
                v = q.get(k)
                if isinstance(v, str) and norm(v):
                    strings.add(norm(v))
    return strings

def main():
    if len(sys.argv) != 3:
        print("Usage: py tools/find_missing_overlay_keys.py <learn_lang> <native_lang>")
        sys.exit(2)

    learn = sys.argv[1]
    native = sys.argv[2]

    lessons_dir = f"courses/{learn}/lessons"
    overlay_path = f"courses/{learn}/overlays/{native}.json"

    if not os.path.isdir(lessons_dir):
        raise SystemExit(f"Missing lessons dir: {lessons_dir}")
    if not os.path.isfile(overlay_path):
        raise SystemExit(f"Missing overlay file: {overlay_path}")

    overlay = load(overlay_path)
    ui = overlay.get("ui", {}) if isinstance(overlay.get("ui"), dict) else {}
    gloss = overlay.get("gloss", {}) if isinstance(overlay.get("gloss"), dict) else {}

    overlay_keys = set(norm(k) for k in list(ui.keys()) + list(gloss.keys()))

    lesson_strings = collect_strings_from_lessons(lessons_dir)

    missing = sorted(s for s in lesson_strings if s not in overlay_keys)

    # Extra: detect “case-only” mismatches (common source of leaks)
    lower_map = {k.lower(): k for k in overlay_keys}
    case_miss = []
    for s in missing:
        if s.lower() in lower_map:
            case_miss.append((s, lower_map[s.lower()]))

    print(f"Learn={learn} Native={native}")
    print(f"Overlay: {overlay_path}")
    print(f"Lesson strings scanned: {len(lesson_strings)}")
    print(f"Missing keys: {len(missing)}")
    if case_miss:
        print(f"\nCase-only mismatches (add exact key!): {len(case_miss)}")
        for a,b in case_miss[:50]:
            print(f"  missing: {a}  (overlay has: {b})")

    if missing:
        print("\n--- Missing keys (copy/paste into overlay ui/gloss as keys) ---")
        for s in missing:
            print(s)

if __name__ == "__main__":
    main()
