import os, json, time
import requests

# ===== CONFIG =====
LEARN_LANG = os.environ.get("OK_LEARN_LANG", "lt").strip().lower()
NATIVE_CODE = os.environ.get("OK_NATIVE", "zh").strip().lower()   # target native (zh)
FROM_CODE = os.environ.get("OK_FROM", "en").strip().lower()       # translate from (en)

# Azure Translator env vars
KEY = os.environ.get("AZ_TRANSLATOR_KEY", "").strip()
ENDPOINT = os.environ.get("AZ_TRANSLATOR_ENDPOINT", "").strip().rstrip("/")
REGION = os.environ.get("AZ_TRANSLATOR_REGION", "").strip()

if not KEY or not ENDPOINT:
  raise SystemExit("Missing AZ_TRANSLATOR_KEY or AZ_TRANSLATOR_ENDPOINT env vars.")

TO_MAP = {
  "zh": "zh-Hans",      # Simplified
  "zh-hans": "zh-Hans",
  "zh-hant": "zh-Hant", # Traditional if you ever want it
  "en": "en",
}

def to_tag(code: str) -> str:
  c = (code or "").strip().lower()
  return TO_MAP.get(c, c)

def translate_url(to_code: str, from_code: str) -> str:
  return f"{ENDPOINT}/translate?api-version=3.0&from={from_code}&to={to_tag(to_code)}"

HEADERS = {
  "Ocp-Apim-Subscription-Key": KEY,
  "Content-Type": "application/json",
}
if REGION:
  HEADERS["Ocp-Apim-Subscription-Region"] = REGION

def translate_batch(texts, to_code, from_code):
  body = [{"text": t} for t in texts]
  r = requests.post(translate_url(to_code, from_code), headers=HEADERS, json=body, timeout=60)
  r.raise_for_status()
  data = r.json()
  out = []
  for item in data:
    out.append(item["translations"][0]["text"])
  return out

def load_json(path):
  with open(path, "r", encoding="utf-8") as f:
    return json.load(f)

def save_json(path, obj):
  with open(path, "w", encoding="utf-8") as f:
    json.dump(obj, f, ensure_ascii=False, indent=2)

def is_blank(s):
  return (s is None) or (not str(s).strip())

def main():
  manifest_path = f"courses/{LEARN_LANG}/lessons/manifest.json"
  if not os.path.exists(manifest_path):
    raise SystemExit(f"Missing {manifest_path}")

  manifest = load_json(manifest_path)
  lessons = manifest.get("lessons", [])
  if not isinstance(lessons, list) or not lessons:
    raise SystemExit("manifest.lessons missing/empty")

  # Collect work items: (lesson_path, q_ref, field_name, source_text)
  jobs = []

  def enqueue_if_missing(q, field, source_text):
    # only write if missing/blank
    if is_blank(q.get(field, "")) and (not is_blank(source_text)):
      jobs.append((q, field, str(source_text).strip()))

  # Load each lesson and collect translation tasks
  lesson_files = []
  for l in lessons:
    lp = l.get("file") or f"courses/{LEARN_LANG}/lessons/{l.get('id')}.json"
    lesson_files.append(lp)

  # First pass: collect
  lesson_objs = {}  # path -> parsed json
  for lp in lesson_files:
    if not os.path.exists(lp):
      print(f"⚠️ Missing lesson file: {lp}")
      continue
    data = load_json(lp)

    # Normalize: supports questions[] or items[]
    qs = data.get("questions")
    if not isinstance(qs, list):
      qs = data.get("items")
    if not isinstance(qs, list):
      continue

    lesson_objs[lp] = data

    for q in qs:
      if not isinstance(q, dict):
        continue

      qtype = str(q.get("type", "")).strip().lower()

      # ---- TRANSLATE QUESTIONS: need native source text (q.zh) ----
      if qtype == "translate":
        # Source-of-truth English text:
        # prefer q.en, else q.native, else q.get(FROM_CODE)
        src_text = q.get(FROM_CODE) or q.get("en") or q.get("native")
        enqueue_if_missing(q, NATIVE_CODE, src_text)

        # prompt override: if prompt_native exists (often EN), give prompt_zh
        src_prompt = q.get("prompt_native") or q.get("prompt") or ""
        enqueue_if_missing(q, f"prompt_{NATIVE_CODE}", src_prompt)

      # ---- CHOOSE QUESTIONS: prompt can leak via prompt_native; fix prompt_zh ----
      if qtype == "choose":
        src_prompt = q.get("prompt_native") or q.get("prompt") or ""
        enqueue_if_missing(q, f"prompt_{NATIVE_CODE}", src_prompt)

        # OPTIONAL: If you want fully native choices arrays (choices_zh),
        # you can generate them too. Most of your app uses gloss overlay,
        # so this is not required unless you want 100% native choices.
        # Uncomment if desired:
        #
        # choices = q.get("choices")
        # if isinstance(choices, list) and choices:
        #   want = q.get(f"choices_{NATIVE_CODE}")
        #   if not isinstance(want, list) or len(want) != len(choices):
        #     for ch in choices:
        #       if isinstance(ch, str) and ch.strip():
        #         jobs.append((q, f"choices_{NATIVE_CODE}", choices))  # special handler

  if not jobs:
    print("✅ No missing native fields found to fill.")
    return

  print(f"LEARN={LEARN_LANG}  NATIVE={NATIVE_CODE}  FROM={FROM_CODE}")
  print(f"Translation jobs: {len(jobs)}")

  # Batch translate (text fields only)
  # (We’re not doing choices_zh list translation here unless you enable it above.)
  texts = [j[2] for j in jobs]
  results = [""] * len(texts)

  BATCH = 50
  for off in range(0, len(texts), BATCH):
    batch = texts[off:off+BATCH]
    tx = translate_batch(batch, NATIVE_CODE, FROM_CODE)
    for i, t in enumerate(tx):
      results[off + i] = t
    time.sleep(0.1)

  # Apply translations back into question dicts
  for (job, translated) in zip(jobs, results):
    q, field, src_text = job
    q[field] = translated

  # Second pass: remove prompt_native leaks (optional but recommended)
  # If prompt_native exists AND we now have prompt_zh, delete prompt_native
  changed_files = 0
  for lp, data in lesson_objs.items():
    qs = data.get("questions")
    if not isinstance(qs, list):
      qs = data.get("items")
    if not isinstance(qs, list):
      continue

    touched = False
    for q in qs:
      if not isinstance(q, dict):
        continue
      p_native = q.get("prompt_native")
      p_zh = q.get(f"prompt_{NATIVE_CODE}")
      if isinstance(p_native, str) and p_native.strip() and isinstance(p_zh, str) and p_zh.strip():
        # Removing this prevents future leakage across natives
        del q["prompt_native"]
        touched = True

    if touched:
      save_json(lp, data)
      changed_files += 1

  # Also write any lessons where we inserted zh fields (not only prompt cleanup)
  # (Some files may have been saved already above; safe to save again)
  for lp, data in lesson_objs.items():
    save_json(lp, data)

  print(f"✅ Filled native fields and wrote lessons. Files updated: {len(lesson_objs)} (prompt_native cleaned in {changed_files}).")

if __name__ == "__main__":
  main()
