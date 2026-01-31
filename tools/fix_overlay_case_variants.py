import json, re

path = "courses/lt/overlays/zh.json"

with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

data.setdefault("ui", {})
data.setdefault("gloss", {})

def variants(s: str):
    s2 = s.strip()
    out = {s2}
    out.add(s2.lower())
    out.add(s2.upper())
    if s2:
        out.add(s2[:1].lower() + s2[1:])
        out.add(s2[:1].upper() + s2[1:])
    out.add(re.sub(r"\s+", " ", s2))
    return [x for x in out if x and x != s]

def expand(section_name):
    section = data.get(section_name, {})
    keys = list(section.keys())
    for k in keys:
        v = section[k]
        if not isinstance(k, str):
            continue
        for kk in variants(k):
            if kk not in section:
                section[kk] = v
    data[section_name] = section

expand("ui")
expand("gloss")

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("DONE")
print("ui keys:", len(data["ui"]))
print("gloss keys:", len(data["gloss"]))
