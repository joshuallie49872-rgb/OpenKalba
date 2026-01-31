import os, json, time
import requests

AZ_ENDPOINT = os.environ["AZ_TRANSLATOR_ENDPOINT"].rstrip("/")
AZ_KEY = os.environ["AZ_TRANSLATOR_KEY"]
AZ_REGION = os.environ["AZ_TRANSLATOR_REGION"]

COURSES_DIR = "courses"
CACHE_PATH = os.path.join("tools", "gd_overlay_cache.json")

# Translator language code for Scottish Gaelic in Azure Translator
TO_LANG = "gd-GB"

def load_cache():
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_cache(cache):
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

CACHE = load_cache()

def translate_str(text: str) -> str:
    if not isinstance(text, str):
        return text
    s = text.strip()
    if not s:
        return text

    # Namespace cache by target language so you can reuse this file safely later
    cache_key = f"{TO_LANG}::{s}"
    if cache_key in CACHE:
        return CACHE[cache_key]

    r = requests.post(
        f"{AZ_ENDPOINT}/translate?api-version=3.0&from=en&to={TO_LANG}",
        headers={
            "Ocp-Apim-Subscription-Key": AZ_KEY,
            "Ocp-Apim-Subscription-Region": AZ_REGION,
            "Content-Type": "application/json"
        },
        json=[{"Text": s}],
        timeout=60
    )

    # Helpful error output if Azure responds with details
    if r.status_code != 200:
        print("❌ Translator error:", r.status_code)
        try:
            print(r.json())
        except Exception:
            print(r.text[:1000])
        r.raise_for_status()

    out = r.json()[0]["translations"][0]["text"]
    CACHE[cache_key] = out
    save_cache(CACHE)
    time.sleep(0.03)
    return out

def translate_values(obj):
    # Translate ONLY string VALUES, keep keys intact
    if isinstance(obj, str):
        return translate_str(obj)
    if isinstance(obj, list):
        return [translate_values(x) for x in obj]
    if isinstance(obj, dict):
        return {k: translate_values(v) for k, v in obj.items()}
    return obj

def main():
    count = 0
    for course in os.listdir(COURSES_DIR):
        overlays_dir = os.path.join(COURSES_DIR, course, "overlays")
        en_path = os.path.join(overlays_dir, "en.json")
        gd_path = os.path.join(overlays_dir, "gd.json")

        if not os.path.exists(en_path) or not os.path.exists(gd_path):
            continue

        with open(en_path, "r", encoding="utf-8") as f:
            en_data = json.load(f)

        gd_data = translate_values(en_data)

        with open(gd_path, "w", encoding="utf-8") as f:
            json.dump(gd_data, f, ensure_ascii=False, indent=2)

        count += 1
        print(f"✅ gd overlays translated: {course}")

    print(f"✅ Done. Updated {count} courses. Cache: {CACHE_PATH}")

if __name__ == "__main__":
    main()
