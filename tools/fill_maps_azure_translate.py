import os, glob, csv, json, time, urllib.request, urllib.error
from typing import List, Tuple

# Maps your course codes -> Translator target codes
# (Translator uses ISO-ish codes; your app uses "mx" for Spanish, "se" for Swedish, "no" for Norwegian)
COURSE_TO_TRANSLATOR = {
    "de": "de",
    "et": "et",
    "fi": "fi",
    "fr": "fr",
    "is": "is",
    "lv": "lv",
    "mx": "es",   # Spanish
    "no": "nb",   # Norwegian Bokmål
    "se": "sv",   # Swedish
    "uk": "uk",   # Ukrainian
    "pl": "pl",
    "ru": "ru",
}

TRANSLATOR_ENDPOINT = os.environ.get("AZURE_TRANSLATOR_ENDPOINT", "https://api.cognitive.microsofttranslator.com")
KEY = os.environ.get("AZURE_TRANSLATOR_KEY", "")
REGION = os.environ.get("AZURE_TRANSLATOR_REGION", "")

def die(msg: str):
    raise SystemExit(msg)

def read_csv_2col(path: str) -> List[Tuple[str, str]]:
    rows = []
    with open(path, "r", encoding="utf-8", newline="") as f:
        for r in csv.reader(f):
            src = (r[0] if len(r) > 0 else "").strip()
            dst = (r[1] if len(r) > 1 else "").strip()
            # ignore completely empty src rows
            if not src:
                continue
            rows.append((src, dst))
    return rows

def write_csv_2col(path: str, rows: List[Tuple[str, str]]):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        for src, dst in rows:
            w.writerow([src, dst])

def azure_translate_batch(texts: List[str], to_lang: str) -> List[str]:
    """
    Translate Lithuanian -> to_lang for a batch of strings.
    """
    if not KEY:
        die("Missing AZURE_TRANSLATOR_KEY env var.")
    if not REGION:
        die("Missing AZURE_TRANSLATOR_REGION env var.")

    url = f"{TRANSLATOR_ENDPOINT}/translate?api-version=3.0&from=lt&to={to_lang}"
    body = json.dumps([{"text": t} for t in texts]).encode("utf-8")

    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json; charset=UTF-8")
    req.add_header("Ocp-Apim-Subscription-Key", KEY)
    req.add_header("Ocp-Apim-Subscription-Region", REGION)

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        die(f"Translator HTTPError {e.code}: {detail}")
    except Exception as e:
        die(f"Translator request failed: {e}")

    out = []
    for item in data:
        # each item has translations: [{text: "...", to: "..."}]
        trans = (item.get("translations") or [])
        out.append(trans[0].get("text", "") if trans else "")
    return out

def fill_one_map(path: str, course_code: str, batch_size: int = 50, sleep_s: float = 0.1):
    to_lang = COURSE_TO_TRANSLATOR.get(course_code)
    if not to_lang:
        print("SKIP    ", os.path.basename(path), "(unknown code mapping)")
        return

    rows = read_csv_2col(path)
    missing_idx = [i for i, (_src, dst) in enumerate(rows) if not dst]

    if not missing_idx:
        print("OK      ", os.path.basename(path), "blank_dst=0")
        return

    # gather missing srcs
    missing_srcs = [rows[i][0] for i in missing_idx]

    filled = 0
    cursor = 0
    while cursor < len(missing_srcs):
        chunk = missing_srcs[cursor: cursor + batch_size]
        translated = azure_translate_batch(chunk, to_lang)

        for j, t in enumerate(translated):
            idx = missing_idx[cursor + j]
            src = rows[idx][0]
            dst = (t or "").strip()
            rows[idx] = (src, dst)
            if dst:
                filled += 1

        cursor += batch_size
        time.sleep(sleep_s)

    write_csv_2col(path, rows)

    still_blank = sum(1 for _s, d in rows if not d)
    print("FILLED  ", os.path.basename(path), f"filled={filled} still_blank={still_blank}")

def main():
    files = sorted(glob.glob(r"tools\_maps\lt_to_*.csv"))
    print("found", len(files), "maps")
    for p in files:
        base = os.path.basename(p)
        # lt_to_xx.csv
        code = base.replace("lt_to_", "").replace(".csv", "").strip()
        fill_one_map(p, code)

if __name__ == "__main__":
    main()
