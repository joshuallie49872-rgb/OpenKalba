import os, json, time, random
import requests

# ===== CONFIG =====
LEARN_LANG = os.environ.get("OK_LEARN_LANG", "lt").strip().lower()

SRC_NATIVE = "en"
SRC_PATH = f"courses/{LEARN_LANG}/overlays/{SRC_NATIVE}.json"
OUT_DIR  = f"courses/{LEARN_LANG}/overlays"

# Azure Translator env vars
KEY = os.environ.get("AZ_TRANSLATOR_KEY", "").strip()
ENDPOINT = os.environ.get("AZ_TRANSLATOR_ENDPOINT", "").strip().rstrip("/")
REGION = os.environ.get("AZ_TRANSLATOR_REGION", "").strip()

if not KEY or not ENDPOINT:
  raise SystemExit("Missing AZ_TRANSLATOR_KEY or AZ_TRANSLATOR_ENDPOINT env vars.")

# internal -> Azure Translator language tags
TO_MAP = {
  "en": "en",
  "zh": "zh-Hans",
  "mx": "es",
  "se": "sv",
}

def to_tag(code: str) -> str:
  c = (code or "").strip().lower()
  return TO_MAP.get(c, c)

def translate_url(to_code: str, from_code: str = "en") -> str:
  return f"{ENDPOINT}/translate?api-version=3.0&from={from_code}&to={to_tag(to_code)}"

HEADERS = {
  "Ocp-Apim-Subscription-Key": KEY,
  "Content-Type": "application/json",
}
if REGION:
  HEADERS["Ocp-Apim-Subscription-Region"] = REGION

# Tuning knobs (env override)
BATCH_SIZE   = int(os.environ.get("OK_BATCH_SIZE", "25"))      # 25 is safer than 50
PAUSE_SEC    = float(os.environ.get("OK_PAUSE_SEC", "0.35"))   # pacing between successful calls
MAX_RETRIES  = int(os.environ.get("OK_MAX_RETRIES", "8"))      # retries on 429/5xx
FORCE        = os.environ.get("OK_FORCE", "0").strip() == "1"  # overwrite existing

def translate_batch(texts, to_code, from_code="en"):
  body = [{"text": t} for t in texts]
  url = translate_url(to_code, from_code)

  last_err = None
  for attempt in range(MAX_RETRIES + 1):
    try:
      r = requests.post(url, headers=HEADERS, json=body, timeout=60)

      # Handle throttling + transient errors with backoff
      if r.status_code in (429, 500, 502, 503, 504):
        retry_after = r.headers.get("Retry-After", "").strip()
        if retry_after.isdigit():
          sleep_s = float(retry_after)
        else:
          # exponential backoff with jitter
          sleep_s = min(20.0, (0.6 * (2 ** attempt))) + random.random() * 0.35

        print(f"   ⚠️  {to_code} throttle/transient ({r.status_code}) — retry in {sleep_s:.2f}s (attempt {attempt+1}/{MAX_RETRIES})")
        time.sleep(sleep_s)
        last_err = Exception(f"{r.status_code} {r.text[:200]}")
        continue

      r.raise_for_status()
      data = r.json()
      return [item["translations"][0]["text"] for item in data]

    except Exception as e:
      last_err = e
      sleep_s = min(20.0, (0.6 * (2 ** attempt))) + random.random() * 0.35
      print(f"   ⚠️  {to_code} error — retry in {sleep_s:.2f}s (attempt {attempt+1}/{MAX_RETRIES}) :: {str(e)[:120]}")
      time.sleep(sleep_s)

  raise last_err if last_err else Exception("translate_batch failed")

def load_json(path):
  with open(path, "r", encoding="utf-8") as f:
    return json.load(f)

def save_json(path, obj):
  os.makedirs(os.path.dirname(path), exist_ok=True)
  with open(path, "w", encoding="utf-8") as f:
    json.dump(obj, f, ensure_ascii=False, indent=2)

def gen_overlay(src, dst_native):
  src_ui = src.get("ui", {}) if isinstance(src.get("ui", {}), dict) else {}
  src_gloss = src.get("gloss", {}) if isinstance(src.get("gloss", {}), dict) else {}

  dst = {"ui": {}, "gloss": {}}

  # ---- UI ----
  ui_keys = list(src_ui.keys())
  ui_vals = [str(src_ui.get(k, "") or "").strip() for k in ui_keys]

  out_vals = [""] * len(ui_vals)
  idxs = [i for i, t in enumerate(ui_vals) if t]
  texts = [ui_vals[i] for i in idxs]

  for off in range(0, len(texts), BATCH_SIZE):
    batch = texts[off:off + BATCH_SIZE]
    tx = translate_batch(batch, dst_native, "en")
    for j, translated in enumerate(tx):
      out_vals[idxs[off + j]] = translated
    time.sleep(PAUSE_SEC)

  for k, v in zip(ui_keys, out_vals):
    dst["ui"][k] = v

  # ---- GLOSS ----
  gloss_keys = list(src_gloss.keys())
  gloss_vals = [str(src_gloss.get(k, "") or "").strip() for k in gloss_keys]

  out_vals = [""] * len(gloss_vals)
  idxs = [i for i, t in enumerate(gloss_vals) if t]
  texts = [gloss_vals[i] for i in idxs]

  for off in range(0, len(texts), BATCH_SIZE):
    batch = texts[off:off + BATCH_SIZE]
    tx = translate_batch(batch, dst_native, "en")
    for j, translated in enumerate(tx):
      out_vals[idxs[off + j]] = translated
    time.sleep(PAUSE_SEC)

  for k, v in zip(gloss_keys, out_vals):
    dst["gloss"][k] = v

  return dst

def main():
  if not os.path.exists(SRC_PATH):
    raise SystemExit(f"Missing source overlay: {SRC_PATH}")

  src = load_json(SRC_PATH)

  ui_all = load_json("i18n/ui.json")
  all_targets = sorted([k for k in ui_all.keys() if k and k != "en"])

  # Optional: only run a subset (resume failed)
  only = os.environ.get("OK_TARGETS", "").strip()
  if only:
    wanted = [x.strip().lower() for x in only.split(",") if x.strip()]
    targets = [t for t in all_targets if t in wanted]
  else:
    targets = all_targets

  print(f"Course: {LEARN_LANG}")
  print(f"Source: {SRC_PATH}")
  print(f"Targets ({len(targets)}): {', '.join(targets)}")
  print(f"Settings: batch={BATCH_SIZE} pause={PAUSE_SEC}s retries={MAX_RETRIES} force={FORCE}")

  failed = []
  for code in targets:
    out_path = f"{OUT_DIR}/{code}.json"
    if os.path.exists(out_path) and not FORCE:
      print(f"— skip {code} (exists)")
      continue

    try:
      dst = gen_overlay(src, code)
      save_json(out_path, dst)
      print(f"✅ wrote {out_path} (ui={len(dst['ui'])}, gloss={len(dst['gloss'])})")
    except Exception as e:
      print(f"❌ {code} failed: {e}")
      failed.append(code)

  if failed:
    print("FAILED TARGETS:", ",".join(failed))
    raise SystemExit(1)

if __name__ == "__main__":
  main()
