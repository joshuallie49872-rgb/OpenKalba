import os, json, time
import requests

# ===== CONFIG =====
LEARN_LANG = "lt"
SRC_NATIVE = "en"
DST_NATIVE = "zh"

SRC_PATH = f"courses/{LEARN_LANG}/overlays/{SRC_NATIVE}.json"
DST_PATH = f"courses/{LEARN_LANG}/overlays/{DST_NATIVE}.json"

# Azure Translator (Cognitive Services)
# You must set these environment variables:
#   AZ_TRANSLATOR_KEY
#   AZ_TRANSLATOR_ENDPOINT   (example: https://api.cognitive.microsofttranslator.com)
#   AZ_TRANSLATOR_REGION     (example: westus2)  <-- required for many setups
KEY = os.environ.get("AZ_TRANSLATOR_KEY", "").strip()
ENDPOINT = os.environ.get("AZ_TRANSLATOR_ENDPOINT", "").strip().rstrip("/")
REGION = os.environ.get("AZ_TRANSLATOR_REGION", "").strip()

if not KEY or not ENDPOINT:
  raise SystemExit("Missing AZ_TRANSLATOR_KEY or AZ_TRANSLATOR_ENDPOINT env vars.")

TRANSLATE_URL = f"{ENDPOINT}/translate?api-version=3.0&from=en&to=zh-Hans"

HEADERS = {
  "Ocp-Apim-Subscription-Key": KEY,
  "Content-Type": "application/json",
}
if REGION:
  HEADERS["Ocp-Apim-Subscription-Region"] = REGION

def chunks(lst, n):
  for i in range(0, len(lst), n):
    yield lst[i:i+n]

def translate_batch(texts):
  # texts: list[str]
  body = [{"text": t} for t in texts]
  r = requests.post(TRANSLATE_URL, headers=HEADERS, json=body, timeout=60)
  r.raise_for_status()
  data = r.json()
  out = []
  for item in data:
    # item["translations"][0]["text"]
    out.append(item["translations"][0]["text"])
  return out

def main():
  with open(SRC_PATH, "r", encoding="utf-8") as f:
    src = json.load(f)

  src_ui = src.get("ui", {}) if isinstance(src.get("ui", {}), dict) else {}
  src_gloss = src.get("gloss", {}) if isinstance(src.get("gloss", {}), dict) else {}

  # Prepare destination structure
  dst = {
    "ui": {},
    "gloss": {}
  }

  # ---- UI ----
  ui_keys = list(src_ui.keys())
  ui_vals = [str(src_ui[k] or "").strip() for k in ui_keys]

  # translate non-empty
  dst_ui_vals = [""] * len(ui_vals)
  to_tx = []
  to_tx_idx = []
  for i, t in enumerate(ui_vals):
    if t:
      to_tx.append(t)
      to_tx_idx.append(i)

  # batch translate
  for batch_idx in range(0, len(to_tx), 50):
    batch = to_tx[batch_idx:batch_idx+50]
    tx = translate_batch(batch)
    for j, translated in enumerate(tx):
      dst_ui_vals[to_tx_idx[batch_idx + j]] = translated
    time.sleep(0.1)

  for k, v in zip(ui_keys, dst_ui_vals):
    dst["ui"][k] = v

  # ---- GLOSS ----
  gloss_keys = list(src_gloss.keys())
  gloss_vals = [str(src_gloss[k] or "").strip() for k in gloss_keys]

  dst_gloss_vals = [""] * len(gloss_vals)
  to_tx = []
  to_tx_idx = []
  for i, t in enumerate(gloss_vals):
    if t:
      to_tx.append(t)
      to_tx_idx.append(i)

  for batch_idx in range(0, len(to_tx), 50):
    batch = to_tx[batch_idx:batch_idx+50]
    tx = translate_batch(batch)
    for j, translated in enumerate(tx):
      dst_gloss_vals[to_tx_idx[batch_idx + j]] = translated
    time.sleep(0.1)

  for k, v in zip(gloss_keys, dst_gloss_vals):
    dst["gloss"][k] = v

  os.makedirs(os.path.dirname(DST_PATH), exist_ok=True)
  with open(DST_PATH, "w", encoding="utf-8") as f:
    json.dump(dst, f, ensure_ascii=False, indent=2)

  print(f"✅ Wrote: {DST_PATH}  (ui={len(dst['ui'])}, gloss={len(dst['gloss'])})")

if __name__ == "__main__":
  main()
