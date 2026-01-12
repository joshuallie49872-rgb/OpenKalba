import json, glob

bad=[]
bad2=[]

for p in glob.glob(r"courses\lv\lessons\*.json"):
    d=json.load(open(p,encoding="utf-8"))
    for i,q in enumerate(d.get("questions",[])):
        lv=(q.get("lv") or "").strip()
        lt=(q.get("lt") or "").strip()
        en=(q.get("en") or "").strip()
        if lv and not en:
            bad.append((p,i,lv,lt))
        if en and (en==lv or en==lt):
            bad2.append((p,i,lv,lt,en))

print("missing_en",len(bad))
print("en_equals_lv_or_lt",len(bad2))
print("--- missing_en examples ---")
for x in bad[:15]:
    print(f"{x[0]}#{x[1]} lv={x[2]} lt={x[3]}")
print("--- en_equals examples ---")
for x in bad2[:15]:
    print(f"{x[0]}#{x[1]} lv={x[2]} lt={x[3]} en={x[4]}")
