import os, json
import requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
COURSES_DIR = os.path.join(ROOT, "courses")

KEY = os.environ.get("AZ_TRANSLATOR_KEY")
REGION = os.environ.get("AZ_TRANSLATOR_REGION")
if not KEY or not REGION:
    raise SystemExit("Missing AZ_TRANSLATOR_KEY or AZ_TRANSLATOR_REGION env vars.")

ENDPOINT = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0"

CACHE_PATH = os.path.join(os.path.dirname(__file__), "so_overlay_cache.json")
CACHE = {}

if os.path.exists(CACHE_PATH):
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        CACHE = json.load(f)

def save_cache():
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(CACHE, f, ensure_ascii=False, indent=2)

def translate_str(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return text

    if text in CACHE:
        return CACHE[text]

    headers = {
        "Ocp-Apim-Subscription-Key": KEY,
        "Ocp-Apim-Subscription-Region": REGION,
        "Content-Type": "application/json",
    }

    body = [{"text": text}]
    url = ENDPOINT + "&from=en&to=so"
    r = requests.post(url, headers=headers, json=body, timeout=30)
    r.raise_for_status()

    translated = r.json()[0]["translations"][0]["text"]
    CACHE[text] = translated
    save_cache()
    return translated

def translate_any(obj):
    """
    Recursively translate:
    - strings -> translated strings
    - dicts -> translate values
    - lists -> translate each element
    - numbers/bools/null -> unchanged
    """
    if isinstance(obj, str):
        return translate_str(obj)

    if isinstance(obj, dict):
        return {k: translate_any(v) for k, v in obj.items()}

    if isinstance(obj, list):
        return [translate_any(x) for x in obj]

    return obj  # int/float/bool/None

def main():
    total = 0
    for course in os.listdir(COURSES_DIR):
        overlays_dir = os.path.join(COURSES_DIR, course, "overlays")
        if not os.path.isdir(overlays_dir):
            continue

        en_path = os.path.join(overlays_dir, "en.json")
        so_path = os.path.join(overlays_dir, "so.json")
        if not os.path.exists(en_path):
            continue

        with open(en_path, "r", encoding="utf-8") as f:
            en_data = json.load(f)

        so_data = translate_any(en_data)

        with open(so_path, "w", encoding="utf-8") as f:
            json.dump(so_data, f, ensure_ascii=False, indent=2)

        total += 1

    print(f"✅ Somali overlays created for {total} courses.")
    print(f"✅ Cache saved to: {CACHE_PATH}")

if __name__ == "__main__":
    main()
