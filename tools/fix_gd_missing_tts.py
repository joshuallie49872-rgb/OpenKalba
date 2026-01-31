import os, json, glob

LESSONS_DIR = os.path.join("courses", "gd", "lessons")

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def main():
    changed_files = 0
    changed_cards = 0

    for path in glob.glob(os.path.join(LESSONS_DIR, "*.json")):
        data = load_json(path)
        cards = data.get("cards", [])
        file_changed = False

        for c in cards:
            # only fix if tts is missing/blank
            tts = c.get("tts", "")
            if isinstance(tts, str) and tts.strip():
                continue

            correct = c.get("correct", [])
            if isinstance(correct, list) and len(correct) > 0 and isinstance(correct[0], str) and correct[0].strip():
                c["tts"] = correct[0].strip()
                file_changed = True
                changed_cards += 1

        if file_changed:
            save_json(path, data)
            changed_files += 1
            print(f"✅ fixed: {os.path.basename(path)}")

    print(f"\nDone. Files changed: {changed_files}, cards fixed: {changed_cards}")

if __name__ == "__main__":
    main()
