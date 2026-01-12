import json, glob

n = 0
ex = []

for p in glob.glob(r"courses\lv\lessons\*.json"):
    with open(p, "r", encoding="utf-8") as f:
        d = json.load(f)
    for q in d.get("questions", []):
        lv = (q.get("lv") or "").strip()
        lt = (q.get("lt") or "").strip()
        if lv:
            n += 1
            if len(ex) < 5:
                ex.append((p, lv, lt))

print("lv_strings", n)
print("examples:")
for x in ex:
    print(x)
