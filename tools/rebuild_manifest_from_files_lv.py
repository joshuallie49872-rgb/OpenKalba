import os, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LESSONS_DIR = os.path.join(ROOT, "courses", "lv", "lessons")
MAN_PATH = os.path.join(LESSONS_DIR, "manifest.json")

def load_json(p):
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def main():
    old = load_json(MAN_PATH)
    old_lessons = old.get("lessons", [])
    old_by_id = {x.get("id"): x for x in old_lessons if isinstance(x, dict) and x.get("id")}

    files = sorted([f for f in os.listdir(LESSONS_DIR) if f.endswith(".json") and f != "manifest.json"])

    new_lessons = []
    for fn in files:
        lesson_id = fn[:-5]  # strip .json
        prev = old_by_id.get(lesson_id, {})
        new_lessons.append({
            "id": lesson_id,
            "title": prev.get("title", prev.get("name", lesson_id)),
            "topic": prev.get("topic", ""),
            "icon": prev.get("icon", ""),
            "file": f"courses/lv/lessons/{lesson_id}.json"
        })

    out = {"lessons": new_lessons}

    # preserve other top-level fields (like version)
    for k, v in old.items():
        if k != "lessons":
            out[k] = v

    with open(MAN_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"Rebuilt manifest with {len(new_lessons)} lessons → {MAN_PATH}")

if __name__ == "__main__":
    main()
