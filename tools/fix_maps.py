import glob, csv, os

def fix_file(path: str):
    rows_in = 0
    rows_out = 0
    changed = 0

    out_rows = []
    with open(path, "r", encoding="utf-8", newline="") as f:
        r = csv.reader(f)
        for row in r:
            rows_in += 1
            if not row:
                continue

            # keep only meaningful values
            a = row[0].strip() if len(row) >= 1 else ""
            b = row[1].strip() if len(row) >= 2 else ""
            c = row[2].strip() if len(row) >= 3 else ""

            # If dst empty but 3rd col has text, shift it into dst
            if (not b) and c:
                b = c

            # skip fully empty
            if not a and not b:
                continue

            # count "structural" fixes (3 cols -> 2)
            if len(row) != 2:
                changed += 1

            out_rows.append([a, b])
            rows_out += 1

    # rewrite as strict 2-column CSV
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerows(out_rows)

    return rows_in, rows_out, changed

def main():
    files = sorted(glob.glob(r"tools\_maps\lt_to_*.csv"))
    print("found", len(files), "maps")
    for p in files:
        rin, rout, changed = fix_file(p)
        print(f"FIXED\t{os.path.basename(p)}\tin={rin}\tout={rout}\trows_touched={changed}")

if __name__ == "__main__":
    main()
