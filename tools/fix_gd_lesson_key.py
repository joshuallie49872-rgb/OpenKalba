import os, json

LESSONS_DIR = os.path.join("courses", "gd", "lessons")

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def fix_question(q):
    # If Gaelic field missing but Lithuanian exists, rename lt -> gd
    if "gd" not in q and "lt" in q:
        q["gd"] = q["lt"]
        del q["lt"]

    # Ensure tts exists and matches the target-language string when appropriate
    if "gd" in q:
        if (not q.get("tts")) or (q.get("tts") == q["gd"]):
            q["tts"] = q["gd"]

    # If correct is literally the old target text, update it too
    if "gd" in q and isinstance(q.get("correct"), list) and len(q["correct"]) == 1:
        # if they copied lt lessons, correct might equal old lt text
        # after rename, it should equal gd text
        if q["correct"][0] != q["gd"] and q["correct"][0] == q.get("tts"):
            q["correct"] = [q["gd"]]

    return q

def main():
    changed_files = 0
    changed_questions = 0

    for fname in sorted(os.listdir(LESSONS_DIR)):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(LESSONS_DIR, fname)
        data = load_json(path)

        # support either "questions" or "cards" just in case
        key = "questions" if "questions" in data else ("cards" if "cards" in data else None)
        if not key:
            continue

        before = json.dumps(data, ensure_ascii=False, sort_keys=True)
        for i, q in enumerate(data[key]):
            orig = json.dumps(q, ensure_ascii=False, sort_keys=True)
            data[key][i] = fix_question(q)
            if json.dumps(data[key][i], ensure_ascii=False, sort_keys=True) != orig:
                changed_questions += 1

        after = json.dumps(data, ensure_ascii=False, sort_keys=True)
        if after != before:
            save_json(path, data)
            changed_files += 1

    print(f"Done. Files changed: {changed_files}, questions fixed: {changed_questions}")

if __name__ == "__main__":
    main()
