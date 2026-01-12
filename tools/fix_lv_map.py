# tools/fix_lv_map.py
from pathlib import Path
import csv

p = Path("tools/_maps/lt_to_lv.csv")

text = p.read_text(encoding="utf-8", errors="replace")

# Fix common broken header text
text = text.replace("ï»¿src", "src")
text = text.replace("\ufeffsrc", "src")

# Split lines and parse robustly
lines = [ln for ln in text.splitlines() if ln.strip()]

rows = []
for ln in lines:
    # skip header-ish lines
    if ln.lower().replace(" ", "").startswith(("src,dst", "src\tdst")):
        continue

    # accept tab or comma
    if "\t" in ln and "," not in ln:
        a, b = (ln.split("\t", 1) + [""])[:2]
    else:
        a, b = (ln.split(",", 1) + [""])[:2]

    a = a.strip()
    b = b.strip()
    if not a and not b:
        continue
    rows.append((a, b))

# Write clean CSV
out = ["src,dst,notes"]
for a, b in rows:
    out.append(f"{a},{b},")

p.write_text("\n".join(out) + "\n", encoding="utf-8")
print("OK: rewrote", p, "rows=", len(rows))
