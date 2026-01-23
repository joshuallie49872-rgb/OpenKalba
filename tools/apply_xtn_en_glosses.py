#!/usr/bin/env python3
"""Apply a reviewed Spanish->English gloss sheet for Tlaxiaco Mixtec (xtn).

Input (you edit this):
  tools/xtn_lexicon/xtn_es_to_en_review.csv
    columns: xtn, es, en

Output:
  tools/xtn_lexicon/xtn_en_core_locked.csv
    columns: xtn, en

Rules (strict, no fallback):
- Every row must have non-empty 'en'
- No duplicate xtn keys
"""
import csv
from pathlib import Path

IN_PATH = Path("tools/xtn_lexicon/xtn_es_to_en_review.csv")
OUT_PATH = Path("tools/xtn_lexicon/xtn_en_core_locked.csv")

def main():
    if not IN_PATH.exists():
        raise SystemExit(f"Missing input: {IN_PATH}")

    seen = set()
    out_rows = []
    errors = []

    with IN_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):  # header is line 1
            xtn = (row.get("xtn") or "").strip()
            en  = (row.get("en")  or "").strip()
            es  = (row.get("es")  or "").strip()

            if not xtn:
                errors.append(f"Line {i}: empty xtn")
                continue
            if xtn in seen:
                errors.append(f"Line {i}: duplicate xtn '{xtn}'")
                continue
            seen.add(xtn)

            if not en:
                errors.append(f"Line {i}: missing English gloss for xtn '{xtn}' (es='{es}')")
                continue

            out_rows.append((xtn, en))

    if errors:
        print("❌ Validation failed. Fix these issues in tools/xtn_lexicon/xtn_es_to_en_review.csv:\n")
        for e in errors[:200]:
            print(" - " + e)
        if len(errors) > 200:
            print(f"... plus {len(errors)-200} more")
        raise SystemExit(1)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["xtn","en"])
        w.writerows(out_rows)

    print(f"✅ Wrote {OUT_PATH} with {len(out_rows)} entries (strict, no fallback).")

if __name__ == "__main__":
    main()
