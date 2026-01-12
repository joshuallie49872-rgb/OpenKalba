import glob, csv, os

files = sorted(glob.glob(r"tools\_maps\lt_to_*.csv"))
print("found", len(files), "maps")

for p in files:
    with open(p, encoding="utf-8", newline="") as f:
        r = list(csv.reader(f))

    maxc = max((len(x) for x in r), default=0)
    weird = sum(1 for x in r if len(x) != 2)
    blank = sum(1 for x in r if len(x) >= 2 and not x[1].strip())

    tag = "BAD" if (weird or maxc != 2 or blank) else "OK"
    print(f"{tag}\t{os.path.basename(p)}\trows={len(r)}\tmax_cols={maxc}\tweird={weird}\tblank_dst={blank}")
