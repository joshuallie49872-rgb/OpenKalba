import csv
import re
from pathlib import Path

IN_PATH  = Path("tools/xtn_lexicon/xtn_es_to_en_review.csv")
OUT_PATH = Path("tools/xtn_lexicon/xtn_es_to_en_review_CLEAN.csv")
REJ_PATH = Path("tools/xtn_lexicon/xtn_rejected_rows.csv")

# Heuristics: Mixtec orthography in this book commonly includes ꞌ or glottal/apostrophe,
# and many items are short. Spanish junk often includes punctuation, question words,
# verbs with accents like "cantará", or long explanatory phrases.
SPANISH_COMMON = {
    "allá","así","baño","cantará","cuál","descansaré","destruiré","dónde","irá","irán",
    "llegará","mañana","mirará","pasará","qué","rápidamente","salada","también",
    "tierra","traducción","venado","venderá","venga","mayúscula","interrogativa","interrogativas"
}

def looks_spanish_word(s: str) -> bool:
    t = (s or "").strip().lower()
    if not t:
        return True
    if t in SPANISH_COMMON:
        return True
    # Spanish question marks / punctuation
    if any(ch in t for ch in ["¿","?","¡","!"]):
        return True
    # If it's purely letters and matches common Spanish diacritics patterns, likely Spanish
    # (Mixtec also has diacritics sometimes, but Spanish junk here is obvious and short.)
    if re.fullmatch(r"[a-záéíóúñü]+", t) and len(t) <= 10 and "ꞌ" not in t and "'" not in t:
        return True
    return False

def looks_like_bad_gloss(es: str) -> bool:
    g = (es or "").strip()
    if not g:
        return True
    # too long = likely sentence / explanation
    if len(g) > 40:
        return True
    # contains obvious meta/explanatory wording
    bad_markers = ["realmente no", "no tiene una", "traducción", "se les llama", "punto al final", "siguientes"]
    gl = g.lower()
    if any(m in gl for m in bad_markers):
        return True
    return False

def looks_like_mixtec_token(x: str) -> bool:
    t = (x or "").strip()
    if not t:
        return False
    # Allow short multiword phrases but reject very long
    if len(t) > 20:
        return False
    # Mixtec entries from this book often contain ꞌ or apostrophes
    if "ꞌ" in t or "'" in t:
        return True
    # Also allow tokens with nd-/nt-/ks-/x- patterns common in the dataset
    if re.match(r"^(nd|nt|ks|x|j|k|s|t|y|ñ)", t.lower()):
        return True
    return False

def main():
    if not IN_PATH.exists():
        raise SystemExit(f"Missing: {IN_PATH}")

    kept, rejected = [], []

    with IN_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            xtn = (row.get("xtn") or "").strip()
            es  = (row.get("es")  or "").strip()
            en  = (row.get("en")  or "").strip()

            # Reject obvious Spanish/junk xtn rows
            if looks_spanish_word(xtn):
                rejected.append((xtn, es, en, "xtn_looks_spanish"))
                continue

            # Reject long / explanatory glosses
            if looks_like_bad_gloss(es):
                rejected.append((xtn, es, en, "es_gloss_too_long_or_meta"))
                continue

            # Require it to look like a plausible Mixtec token
            if not looks_like_mixtec_token(xtn):
                rejected.append((xtn, es, en, "xtn_not_plausible_mixtec"))
                continue

            kept.append((xtn, es, en))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    with OUT_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["xtn","es","en"])
        w.writerows(kept)

    with REJ_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["xtn","es","en","reason"])
        w.writerows(rejected)

    print(f"✅ Kept {len(kept)} rows -> {OUT_PATH}")
    print(f"🧹 Rejected {len(rejected)} rows -> {REJ_PATH}")

if __name__ == "__main__":
    main()
