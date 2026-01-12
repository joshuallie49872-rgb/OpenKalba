import csv, os, sys

def fix_mojibake(s: str) -> str:
    """
    Common UTF-8->cp1252/latin1 mojibake fix:
    take the current string, treat its codepoints as bytes (latin1),
    decode as utf-8. If it fails, return original.
    """
    if not s:
        return s
    # only try if it *looks* mojibaked
    if any(x in s for x in ("Ã", "Ä", "Å", "Ð", "Ñ", "Ø", "Â")):
        try:
            return s.encode("latin-1", errors="strict").decode("utf-8", errors="strict")
        except Exception:
            return s
    return s

def main():
    path = r"tools\_maps\lt_to_lv.csv"
    if not os.path.exists(path):
        print("missing:", path)
        sys.exit(1)

    # Read using latin-1 so we never crash on bytes like 0xE5 etc
    with open(path, "r", encoding="latin-1", newline="") as f:
        rows = list(csv.reader(f))

    out = []
    touched = 0
    for row in rows:
        if not row:
            out.append(row)
            continue
        # keep only first 2 cols if there are extras
        src = row[0] if len(row) > 0 else ""
        dst = row[1] if len(row) > 1 else ""
        src2 = fix_mojibake(src)
        dst2 = fix_mojibake(dst)
        if src2 != src or dst2 != dst:
            touched += 1
        out.append([src2, dst2])

    # Write clean UTF-8
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerows(out)

    print("repaired:", path)
    print("rows_touched:", touched)

if __name__ == "__main__":
    main()
