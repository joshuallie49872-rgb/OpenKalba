import os, json, glob
import requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LT_DIR = os.path.join(ROOT, "courses", "lt", "lessons")
CY_DIR = os.path.join(ROOT, "courses", "cy", "lessons")

KEY = os.environ.get("AZ_TRANSLATOR_KEY")
REGION = os.environ.get("AZ_TRANSLATOR_REGION")
if not KEY or not REGION:
    raise SystemExit("Set AZ_TRANSLATOR_KEY and AZ_TRANSLATOR_REGION first.")

ENDPOINT = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0"
CACHE_PATH = os.path.join(os.path.dirname(__file__), "cy_lessons_cache.json")

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

def translate_missing(texts, from_lang, to_lang="cy", cache=None):
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

def tr(cache, from_lang, src, to_lang="cy"):
    if not src:
        return ""
    return cache.get(f"{from_lang}->{to_lang}::{src}", "")

def main():
    os.makedirs(CY_DIR, exist_ok=True)

    lt_manifest = load_json(os.path.join(LT_DIR, "manifest.json"))
    lesson_files = [p for p in glob.glob(os.path.join(LT_DIR, "*.json"))
                    if not p.endswith("manifest.json")]

    unique_en = set()
    unique_lt = set()

    for lp in lesson_files:
        lesson = load_json(lp)
        for q in lesson.get("questions", []):
            qtype = q.get("type")
            if qtype == "choose":
                corr = (q.get("correct") or [""])[0]
                unique_en.add((corr or "").strip())
            elif qtype == "translate":
                en_prompt = (q.get("en") or "").strip()
                if en_prompt:
                    unique_en.add(en_prompt)
                else:
                    lt_ans = (q.get("correct") or [""])[0]
                    unique_lt.add((lt_ans or "").strip())
            else:
                tts = (q.get("tts") or "").strip()
                if tts:
                    unique_lt.add(tts)

    cache = load_cache()
    cache = translate_missing(sorted(unique_en), from_lang="en", to_lang="cy", cache=cache)
    cache = translate_missing(sorted(unique_lt), from_lang="lt", to_lang="cy", cache=cache)

    for lp in lesson_files:
        lesson = load_json(lp)
        out = {"id": lesson["id"], "title": lesson["title"], "questions": []}

        for q in lesson.get("questions", []):
            q2 = dict(q)

            if "lt" in q2:
                q2["cy"] = q2.pop("lt")

            if q2.get("prompt") == "Translate to Lithuanian":
                q2["prompt"] = "Translate to Welsh"
            if q2.get("placeholder") == "Type Lithuanian…":
                q2["placeholder"] = "Type Welsh…"

            qtype = q2.get("type")

            if qtype == "choose":
                corr = (q.get("correct") or [""])[0].strip()
                cy_target = tr(cache, "en", corr, "cy")
                q2["cy"] = cy_target
                q2["tts"] = cy_target

            elif qtype == "translate":
                en_prompt = (q.get("en") or "").strip()
                if en_prompt:
                    cy_target = tr(cache, "en", en_prompt, "cy")
                    q2["tts"] = cy_target
                    q2["correct"] = [cy_target]
                else:
                    lt_ans = (q.get("correct") or [""])[0].strip()
                    cy_target = tr(cache, "lt", lt_ans, "cy")
                    q2["tts"] = cy_target
                    q2["correct"] = [cy_target]
                q2["cy"] = ""

            else:
                tts = (q.get("tts") or "").strip()
                if tts:
                    cy_tts = tr(cache, "lt", tts, "cy")
                    q2["tts"] = cy_tts
                q2["cy"] = q2.get("cy", "")

            out["questions"].append(q2)

        write_json(os.path.join(CY_DIR, os.path.basename(lp)), out)

    write_json(os.path.join(CY_DIR, "manifest.json"), lt_manifest)

    print("✅ Welsh lessons rebuilt from LT using UNIQUE cached translations.")
    print(f"✅ Cache: {CACHE_PATH}")

if __name__ == "__main__":
    main()
