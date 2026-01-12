import json, os, re

ROOT = "courses/lv/lessons"
OUT = "tools/_audio_phrases_lv.txt"

def slug(s):
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')

phrases = set()

for fname in os.listdir(ROOT):
    if not fname.endswith(".json"):
        continue
    path = os.path.join(ROOT, fname)
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for q in data.get("questions", []):
        v = (q.get("lv") or "").strip()
        if v:
            phrases.add(v)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    for p in sorted(phrases):
        f.write(p + "\n")

print(f"Extracted {len(phrases)} Latvian phrases → {OUT}")
