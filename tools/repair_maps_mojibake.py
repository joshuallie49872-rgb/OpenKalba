import glob, csv, os

def looks_mojibake(s: str) -> bool:
    if not s:
        return False
    bad = ("Ã", "Å", "Ä", "Ð", "Ñ", "Ø", "Â", "â€™", "â€œ", "â€")
    return any(x in s for x in bad)

def fix_mojibake(s: str) -> str:
    if not s:
        return s
    try:
        return s.encode("latin1").decode("utf-8")
    except Exception:
        return s

def main():
    files = sorted(glob.glob(r"tools\_maps\lt_to_*.csv"))
    print("found", len(files), "maps")
    for p in files:
        rows = []
        touched = 0
        with open(p, "r", encoding="utf-8", newline="") as f:
            for r in csv.reader(f):
                src = (r[0] if len(r) > 0 else "").strip()
                dst = (r[1] if len(r) > 1 else "").strip()

                src2, dst2 = src, dst
                if looks_mojibake(src2):
                    src2 = fix_mojibake(src2).strip()
                if looks_mojibake(dst2):
                    dst2 = fix_mojibake(dst2).strip()

                if src2 != src or dst2 != dst:
                    touched += 1

                rows.append([src2, dst2])

        with open(p, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerows(rows)

        print(("REPAIRED" if touched else "OK").ljust(8), os.path.basename(p), "rows_touched=", touched)

if __name__ == "__main__":
    main()
