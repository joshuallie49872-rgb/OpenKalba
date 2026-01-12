import os, json

DIR = "courses/lv/audio/mp3"
OUT = "courses/lv/audio/manifest.json"

m = {}

for f in os.listdir(DIR):
    if f.endswith(".mp3"):
        key = f[:-4]
        m[key] = f"courses/lv/audio/mp3/{f}"

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(m, f, ensure_ascii=False, indent=2)

print(f"Wrote {len(m)} entries → {OUT}")
