
# tools/fix_one_map_utf8.py
import sys

p = r"tools\_maps\lt_to_lv.csv"

# Try common Excel encodings for Baltic text
encodings = ["cp1257", "cp1252", "latin-1"]

data = None
used = None
for enc in encodings:
    try:
        with open(p, "r", encoding=enc) as f:
            data = f.read()
        used = enc
        break
    except UnicodeDecodeError:
        pass

if data is None:
    raise SystemExit("Could not decode file using cp1257/cp1252/latin-1")

# Write back as clean UTF-8
with open(p, "w", encoding="utf-8", newline="") as f:
    f.write(data)

print("converted to utf-8:", p, "from", used)
