import os, json

GD_LESSONS_DIR = os.path.join("courses", "gd", "lessons")

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def fix_lesson(path):
    data = load_json(path)
    changed = False
    cards_fixed = 0

    qs = data.get("questions", [])
    for q in qs:
        # If the question contains LT but not GD, copy LT -> GD so the UI has text to display.
        if "lt" in q and isinstance(q["lt"], str) and q["lt"].strip():
            if ("gd" not in q) or (isinstance(q.get("gd"), str) and not q.get("gd","").strip()):
                q["gd"] = q["lt"]
                changed = True
                cards_fixed += 1

        # If tts is empty but gd exists, fill tts from gd (safe).
        if isinstance(q.get("tts"), str) and not q["tts"].strip():
            if isinstance(q.get("gd"), str) and q["gd"].strip():
                q["tts"] = q["gd"]
                changed = True
                cards_fixed += 1

        # If correct is empty but gd exists, fill correct with gd.
        if isinstance(q.get("correct"), list) and len(q["correct"]) == 0:
            if isinstance(q.get("gd"), str) and q["gd"].strip():
                q["correct"] = [q["gd"]]
                changed = True
                cards_fixed += 1

        # Optional: make prompts say Gaelic (won't break anything)
        if isinstance(q.get("prompt"), str):
            if "Translate to Lithuanian" in q["prompt"]:
                q["prompt"] = q["prompt"].replace("Translate to Lithuanian", "Translate to Scottish Gaelic")
                changed = True
        if isinstance(q.get("placeholder"), str):
            if "Type Lithuanian" in q["placeholder"]:
                q["placeholder"] = q["placeholder"].replace("Type Lithuanian", "Type Scottish Gaelic")
                changed = True

    if changed:
        save_json(path, data)
    return changed, cards_fixed

def main():
    if not os.path.isdir(GD_LESSONS_DIR):
        raise SystemExit(f"Missing folder: {GD_LESSONS_DIR}")

    files = sorted([f for f in os.listdir(GD_LESSONS_DIR) if f.endswith(".json")])
    changed_files = 0
    fixed_cards = 0

    for fn in files:
        path = os.path.join(GD_LESSONS_DIR, fn)
        changed, cards = fix_lesson(path)
        if changed:
            changed_files += 1
            fixed_cards += cards

    print(f"Done. Files changed: {changed_files}, cards fixed: {fixed_cards}")

if __name__ == "__main__":
    main()
