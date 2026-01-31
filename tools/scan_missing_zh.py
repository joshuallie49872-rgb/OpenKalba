import json, os, re

LEARN = os.environ.get("OK_LEARN_LANG", "lt").strip().lower()

en_path = f"courses/{LEARN}/overlays/en.json"
zh_path = f"courses/{LEARN}/overlays/zh.json"

def load(p):
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

en = load(en_path)
zh = load(zh_path)

missing = []
empty = []
same = []

for section in ["ui", "gloss"]:
    en_map = en.get(section, {}) or {}
    zh_map = zh.get(section, {}) or {}

    for k, en_val in en_map.items():
        en_val = "" if en_val is None else str(en_val).strip()
        zh_val = "" if zh_map.get(k) is None else str(zh_map.get(k)).strip()

        if en_val and k not in zh_map:
            missing.append((section, k, en_val))
        elif en_val and not zh_val:
            empty.append((section, k, en_val))
        elif en_val and zh_val == en_val:
            same.append((section, k, en_val))

print(f"LEARN = {LEARN}")
print(f"Missing keys      : {len(missing)}")
print(f"Empty values      : {len(empty)}")
print(f"Same as English   : {len(same)}")

def dump(title, arr):
    print(f"\n== {title} ==")
    for i, (sec, k, en_v) in enumerate(arr[:50], 1):
        print(f"{i:02d}. [{sec}] {k}")
        print(f"    EN: {en_v}")

dump("MISSING", missing)
dump("EMPTY", empty)
dump("SAME", same)

# write report file
out = f"tools/scan_zh_report_{LEARN}.txt"
with open(out, "w", encoding="utf-8") as f:
    f.write(f"LEARN={LEARN}\n")
    f.write(f"Missing={len(missing)} Empty={len(empty)} Same={len(same)}\n\n")
    for title, arr in [("MISSING", missing), ("EMPTY", empty), ("SAME", same)]:
        f.write(f"== {title} ==\n")
        for sec, k, en_v in arr:
            f.write(f"[{sec}] {k}\nEN: {en_v}\n\n")

print(f"\nReport written to: {out}")
