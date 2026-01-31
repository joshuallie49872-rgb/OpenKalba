import os, json, glob
import requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LT_DIR = os.path.join(ROOT, "courses", "lt", "lessons")
SO_DIR = os.path.join(ROOT, "courses", "so", "lessons")

KEY = os.environ.get("AZ_TRANSLATOR_KEY")
REGION = os.environ.get("AZ_TRANSLATOR_REGION")
if not KEY or not REGION:
    raise SystemExit("Set AZ_TRANSLATOR_KEY and AZ_TRANSLATOR_REGION env vars first.")

ENDPOINT = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0"
CACHE_PATH = os.path.join(os.path.dirname(__file__), "so_map_cache.json")

def load_json(p):
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def write_json(p, obj):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def load_cache():
    if os.path.exists(CACHE_PATH):
        return load_json(CACHE_PATH)
    return {}

def save_cache(cache):
    write_json(CACHE_PATH, cache)

def translate_texts(texts, from_lang, to_lang="so", cache=None):
    """Translate only missing uniques; returns dict {src: dst} merged into cache."""
    if cache is None:
        cache = {}

    missing = [t for t in texts if t and f"{from_lang}->{to_lang}::{t}" not in cache]
    if not missing:
        return cache

    headers = {
        "Ocp-Apim-Subscription-Key": KEY,
        "Ocp-Apim-Subscription-Region": REGION,
        "Content-Type": "application/json",
    }

    # batch in chunks
    CHUNK = 50
    for i in range(0, len(missing), CHUNK):
        chunk = missing[i:i+CHUNK]
        body = [{"text": t} for t in chunk]
        url = f"{ENDPOINT}&from={from_lang}&to={to_lang}"
        r = requests.post(url, headers=headers, json=body, timeout=60)
        r.raise_for_status()
        data = r.json()
        for src, item in zip(chunk, data):
            dst = item["translations"][0]["text"]
            cache[f"{from_lang}->{to_lang}::{src}"] = dst

    save_cache(cache)
    return cache

def get_tr(cache, from_lang, src, to_lang="so"):
    if not src:
        return ""
    k = f"{from_lang}->{to_lang}::{src}"
    return cache.get(k, "")

def main():
    os.makedirs(SO_DIR, exist_ok=True)

    lt_manifest = load_json(os.path.join(LT_DIR, "manifest.json"))

    lesson_files = [p for p in glob.glob(os.path.join(LT_DIR, "*.json"))
                    if not p.endswith("manifest.json")]

    # 1) Collect UNIQUE strings we’ll translate
    unique_en = set()
    unique_lt = set()

    for lp in lesson_files:
        lesson = load_json(lp)
        for q in lesson.get("questions", []):
            qtype = q.get("type")
            if qtype == "choose":
                # translate the correct English meaning -> Somali target
                corr = (q.get("correct") or [""])[0]
                unique_en.add((corr or "").strip())
            elif qtype == "translate":
                en_prompt = (q.get("en") or "").strip()
                if en_prompt:
                    unique_en.add(en_prompt)
                else:
                    # dictation: LT answer -> Somali
                    lt_ans = (q.get("correct") or [""])[0]
                    unique_lt.add((lt_ans or "").strip())
            else:
                # anything that uses LT tts -> Somali tts
                tts = (q.get("tts") or "").strip()
                if tts:
                    unique_lt.add(tts)

    # 2) Translate uniques with cache
    cache = load_cache()
    cache = translate_texts(sorted(unique_en), from_lang="en", cache=cache)
    cache = translate_texts(sorted(unique_lt), from_lang="lt", cache=cache)

    # 3) Rebuild Somali lessons: copy LT structure, swap LT->SO
    for lp in lesson_files:
        lesson = load_json(lp)
        out = {"id": lesson["id"], "title": lesson["title"], "questions": []}

        for q in lesson.get("questions", []):
            q2 = dict(q)

            # rename field lt -> so if present
            if "lt" in q2:
                q2["so"] = q2.pop("lt")

            # prompt text
            if q2.get("prompt") == "Translate to Lithuanian":
                q2["prompt"] = "Translate to Somali"
            if q2.get("placeholder") == "Type Lithuanian…":
                q2["placeholder"] = "Type Somali…"

            qtype = q2.get("type")

            if qtype == "choose":
                corr = (q.get("correct") or [""])[0].strip()
                so_target = get_tr(cache, "en", corr)
                q2["so"] = so_target
                q2["tts"] = so_target

            elif qtype == "translate":
                en_prompt = (q.get("en") or "").strip()
                if en_prompt:
                    so_target = get_tr(cache, "en", en_prompt)
                    q2["tts"] = so_target
                    q2["correct"] = [so_target]
                else:
                    lt_ans = (q.get("correct") or [""])[0].strip()
                    so_target = get_tr(cache, "lt", lt_ans)
                    q2["tts"] = so_target
                    q2["correct"] = [so_target]

                # keep field present like LT dictation cards usually do
                q2["so"] = ""

            else:
                # unknown/other: translate LT tts if present
                tts = (q.get("tts") or "").strip()
                if tts:
                    so_tts = get_tr(cache, "lt", tts)
                    q2["tts"] = so_tts
                q2["so"] = q2.get("so", "")

            out["questions"].append(q2)

        write_json(os.path.join(SO_DIR, os.path.basename(lp)), out)

    # Somali manifest mirrors LT
    write_json(os.path.join(SO_DIR, "manifest.json"), lt_manifest)

    print("✅ Somali rebuilt from LT using UNIQUE cached translations.")
    print(f"   Cache: {CACHE_PATH}")

if __name__ == "__main__":
    main()
