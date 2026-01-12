import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_json(p):
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def main(lang):
    lessons_dir = os.path.join(ROOT, "courses", lang, "lessons")
    man = load_json(os.path.join(lessons_dir, "manifest.json"))
    lessons = man.get("lessons", [])

    phrases = set()

    for meta in lessons:
        fpath = meta.get("file") or f"courses/{lang}/lessons/{meta['id']}.json"
        full = os.path.join(ROOT, fpath.replace("/", os.sep))
        data = load_json(full)
        for q in data.get("questions", []):
            t = (q.get(lang) or "").strip()
            if t:
                phrases.add(t)

    out_dir = os.path.join(ROOT, "tools", "_tts")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"phrases_{lang}.txt")

    with open(out_path, "w", encoding="utf-8") as f:
        for p in sorted(phrases):
            f.write(p + "\n")

    print(f"Wrote {len(phrases)} phrases to {out_path}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python tools/extract_phrases_from_lessons.py lv")
    main(sys.argv[1])
