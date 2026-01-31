import os, json, glob, time, hashlib
import requests

TO_LANG = "zh-Hans"
FROM_LANG = "en"
NATIVE_CODE = "zh"  # overlay filename uses zh.json

AZ_KEY = os.environ.get("AZURE_TRANSLATOR_KEY") or os.environ.get("AZ_TRANSLATOR_KEY")
AZ_REGION = os.environ.get("AZURE_TRANSLATOR_REGION") or os.environ.get("AZ_REGION")
AZ_ENDPOINT = os.environ.get("AZURE_TRANSLATOR_ENDPOINT") or "https://api.cognitive.microsofttranslator.com"

if not AZ_KEY or not AZ_REGION:
    raise SystemExit("Missing env vars: AZURE_TRANSLATOR_KEY and AZURE_TRANSLATOR_REGION")

CACHE_FILE = f"tools/_gloss_cache_{FROM_LANG}_to_{TO_LANG}.json"

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

def k_for(s):
    h = hashlib.sha1(s.encode("utf-8")).hexdigest()
    return f"{FROM_LANG}->{TO_LANG}:{h}"

def translate_batch(texts):
    if not texts:
        return []
    url = f"{AZ_ENDPOINT}/translate"
    params = {"api-version": "3.0", "from": FROM_LANG, "to": TO_LANG}
    headers = {
        "Ocp-Apim-Subscription-Key": AZ_KEY,
        "Ocp-Apim-Subscription-Region": AZ_REGION,
        "Content-type": "application/json"
    }
    body = [{"text": t} for t in texts]
    r = requests.post(url, params=params, headers=headers, json=body, timeout=60)
    r.raise_for_status()
    data = r.json()
    return [x["translations"][0]["text"] for x in data]

def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

overlay_files = sorted(glob.glob(f"courses/*/overlays/{NATIVE_CODE}.json"))

if not overlay_files:
    raise SystemExit("No overlay files found at courses/*/overlays/zh.json")

print("Found overlays:", len(overlay_files))

for path in overlay_files:
    with open(path, "r", encoding="utf-8") as f:
        ov = json.load(f)

    gloss = ov.get("gloss") if isinstance(ov.get("gloss"), dict) else {}
    if not gloss:
        continue

    # keys are English phrases; values are Chinese (currently "" for many)
    missing_keys = [k for k,v in gloss.items() if (not isinstance(v,str) or not v.strip()) and isinstance(k,str) and k.strip()]

    # translate missing keys (batch)
    to_do = []
    for eng in missing_keys:
        kk = k_for(eng)
        if kk not in cache:
            to_do.append(eng)

    for chunk in chunked(to_do, 50):
        zh = translate_batch(chunk)
        for src, dst in zip(chunk, zh):
            cache[k_for(src)] = dst
        save_cache(cache)
        time.sleep(0.2)

    changed = False
    for eng in missing_keys:
        kk = k_for(eng)
        if kk in cache and cache[kk].strip():
            gloss[eng] = cache[kk]
            changed = True

    if changed:
        ov["gloss"] = gloss
        with open(path, "w", encoding="utf-8") as f:
            json.dump(ov, f, ensure_ascii=False, indent=2)

    print(f"[{path}] missing={len(missing_keys)} wrote={changed}")

print("DONE cache:", CACHE_FILE)

