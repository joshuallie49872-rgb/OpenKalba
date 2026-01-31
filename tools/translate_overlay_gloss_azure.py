import os
import json
import glob
import time
import urllib.request
import urllib.error

AZ_KEY = os.getenv("AZURE_TRANSLATOR_KEY") or os.getenv("AZ_TRANSLATOR_KEY")
AZ_REGION = os.getenv("AZURE_TRANSLATOR_REGION") or os.getenv("AZ_TRANSLATOR_LOCATION") or os.getenv("AZ_REGION")

if not AZ_KEY or not AZ_REGION:
    raise SystemExit(
        "Missing env vars. Set:\n"
        "  AZURE_TRANSLATOR_KEY\n"
        "  AZURE_TRANSLATOR_REGION\n"
        "(or AZ_TRANSLATOR_KEY / AZURE_TRANSLATOR_LOCATION)\n"
    )

ENDPOINT = "https://api.cognitive.microsofttranslator.com"
API_PATH = "/translate?api-version=3.0"

def azure_translate_batch(texts, to_lang="zh-Hans", from_lang="en"):
    # Translator expects list of {"Text": "..."}
    body = json.dumps([{"Text": t} for t in texts]).encode("utf-8")

    url = ENDPOINT + API_PATH + f"&from={from_lang}&to={to_lang}"
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json; charset=UTF-8")
    req.add_header("Ocp-Apim-Subscription-Key", AZ_KEY)
    req.add_header("Ocp-Apim-Subscription-Region", AZ_REGION)

    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    # data is list of results matching inputs
    out = []
    for item in data:
        # item["translations"][0]["text"]
        out.append(item["translations"][0]["text"])
    return out

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")

def is_empty(v):
    return v is None or (isinstance(v, str) and v.strip() == "")

def normalize_key(k):
    # Keep EXACT key; do not change.
    return k

def translate_overlay_file(path, to_lang="zh-Hans", from_lang="en", batch_size=50, sleep_s=0.15):
    obj = load_json(path)
    if "gloss" not in obj or not isinstance(obj["gloss"], dict):
        return (0, 0)

    gloss = obj["gloss"]

    # only translate EMPTY values
    keys = [k for k, v in gloss.items() if is_empty(v)]
    total = len(keys)
    if total == 0:
        return (0, 0)

    translated_count = 0
    for i in range(0, total, batch_size):
        chunk_keys = keys[i:i+batch_size]
        chunk_texts = [normalize_key(k) for k in chunk_keys]

        try:
            chunk_trans = azure_translate_batch(chunk_texts, to_lang=to_lang, from_lang=from_lang)
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", errors="ignore")
            raise SystemExit(f"HTTPError translating {path}:\n{e}\n{msg}")

        for k, t in zip(chunk_keys, chunk_trans):
            # Keep as returned; no fake fallback, no placeholders
            gloss[k] = t
            translated_count += 1

        time.sleep(sleep_s)

    save_json(path, obj)
    return (total, translated_count)

def main():
    # translate ALL learning-course overlays for zh:
    # courses/*/overlays/zh.json
    overlay_paths = sorted(glob.glob("courses/*/overlays/zh.json"))
    if not overlay_paths:
        raise SystemExit("No files found at courses/*/overlays/zh.json (run from OpenKalba root).")

    grand_missing = 0
    grand_done = 0

    for p in overlay_paths:
        missing, done = translate_overlay_file(p)
        grand_missing += missing
        grand_done += done
        print(f"[OK] {p} missing={missing} translated={done}")

    print("\nDONE")
    print(f"Total empty gloss values found: {grand_missing}")
    print(f"Total translated now: {grand_done}")

if __name__ == "__main__":
    main()
