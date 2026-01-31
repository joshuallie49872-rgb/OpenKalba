import os, json, glob, time, hashlib
import requests

# ====== CONFIG ======
LEARN = "lt"          # course language
NATIVE = "zh-Hans"    # translator "to" code (Simplified). Use "zh-Hant" if you want Traditional.
NATIVE_FIELD = "zh"   # field written into lesson JSON (your app uses nativeLang code like "zh")
FROM_LANG = "en"      # most lessons use English as source
LESSON_GLOB = f"courses/{LEARN}/lessons/*.json"
CACHE_FILE = f"tools/_translate_cache_{FROM_LANG}_to_{NATIVE}.json"

AZ_KEY = os.environ.get("AZURE_TRANSLATOR_KEY") or os.environ.get("AZ_TRANSLATOR_KEY")
AZ_REGION = os.environ.get("AZURE_TRANSLATOR_REGION") or os.environ.get("AZ_REGION")
AZ_ENDPOINT = os.environ.get("AZURE_TRANSLATOR_ENDPOINT") or "https://api.cognitive.microsofttranslator.com"

if not AZ_KEY or not AZ_REGION:
    raise SystemExit("Missing env vars: AZURE_TRANSLATOR_KEY and AZURE_TRANSLATOR_REGION")

# ====== CACHE ======
def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_cache(cache):
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

cache = load_cache()

def key_for(s: str) -> str:
    h = hashlib.sha1(s.encode("utf-8")).hexdigest()
    return f"{FROM_LANG}->{NATIVE}:{h}"

def translate_batch(texts):
    """
    Azure Translator batch translate.
    texts: list[str]
    returns: list[str] same length
    """
    if not texts:
        return []
    url = f"{AZ_ENDPOINT}/translate"
    params = {
        "api-version": "3.0",
        "from": FROM_LANG,
        "to": NATIVE
    }
    headers = {
        "Ocp-Apim-Subscription-Key": AZ_KEY,
        "Ocp-Apim-Subscription-Region": AZ_REGION,
        "Content-type": "application/json"
    }
    body = [{"text": t} for t in texts]
    r = requests.post(url, params=params, headers=headers, json=body, timeout=60)
    r.raise_for_status()
    data = r.json()
    out = []
    for item in data:
        out.append(item["translations"][0]["text"])
    return out

def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

def safe_get_items(lesson):
    # supports {items:[...]} and {questions:[...]}
    if isinstance(lesson.get("items"), list):
        return lesson["items"], "items"
    if isinstance(lesson.get("questions"), list):
        return lesson["questions"], "questions"
    return [], None

def needs_native_fill(item):
    # We only fill native display fields for the SOURCE side (usually item.en)
    # If item already has zh, skip.
    if NATIVE_FIELD in item and isinstance(item[NATIVE_FIELD], str) and item[NATIVE_FIELD].strip():
        return False
    en = item.get("en")
    return isinstance(en, str) and en.strip()

# ====== MAIN ======
files = sorted(glob.glob(LESSON_GLOB))
if not files:
    raise SystemExit(f"No lesson files found: {LESSON_GLOB}")

print(f"Scanning {len(files)} lessons in {LEARN}...")

total_candidates = 0
total_filled = 0

for path in files:
    with open(path, "r", encoding="utf-8") as f:
        lesson = json.load(f)

    arr, kind = safe_get_items(lesson)
    if not kind:
        continue

    # collect strings to translate for this file
    to_translate = []
    positions = []  # (index, original_en)

    for i, item in enumerate(arr):
        if not isinstance(item, dict):
            continue
        if needs_native_fill(item):
            en_text = item["en"].strip()
            total_candidates += 1

            k = key_for(en_text)
            if k in cache:
                # already translated
                continue
            to_translate.append(en_text)
            positions.append((i, en_text))

    # translate in chunks (Azure allows batching; 50 is safe)
    for chunk in chunked(to_translate, 50):
        translated = translate_batch(chunk)
        for src, dst in zip(chunk, translated):
            cache[key_for(src)] = dst
        save_cache(cache)
        time.sleep(0.2)  # gentle throttle

    # apply translations (including ones already in cache)
    changed = False
    for i, item in enumerate(arr):
        if not isinstance(item, dict):
            continue
        if needs_native_fill(item):
            en_text = item["en"].strip()
            k = key_for(en_text)
            zh_text = cache.get(k, "")
            if zh_text:
                item[NATIVE_FIELD] = zh_text
                total_filled += 1
                changed = True

    if changed:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(lesson, f, ensure_ascii=False, indent=2)

    print(f"[{os.path.basename(path)}] filled={changed}")

print("\nDONE")
print("total candidates:", total_candidates)
print("total filled:", total_filled)
print("cache:", CACHE_FILE)
