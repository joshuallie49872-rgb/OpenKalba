import os, json, time, hashlib, zipfile
from pathlib import Path
from typing import Any, Dict, List
from openai import OpenAI

# =========================
# CONFIG
# =========================
ROOT = Path(".")
COURSES = ROOT / "courses"

SRC_LESSONS_DIR = COURSES / "en" / "lessons"          # source lesson text
DST_COURSE_DIR  = COURSES / "gd"                      # output course root
DST_LESSONS_DIR = DST_COURSE_DIR / "lessons"
DST_OVERLAYS_DIR = DST_COURSE_DIR / "overlays"

# Translate overlays from English UI overlay keys
OVERLAY_SRC_NAME = "en.json"                          # typically courses/<course>/overlays/en.json
OVERLAY_DST_NAME = "gd.json"

CACHE_DIR = ROOT / "tools" / "_cache"
LESSON_CACHE = CACHE_DIR / "gd_lesson_cache.json"
OVERLAY_CACHE = CACHE_DIR / "gd_overlay_cache.json"

OUT_ZIP_DIR = ROOT / "dist"
OUT_ZIP_PATH = OUT_ZIP_DIR / "OpenKalba_gd_course.zip"

# Model: you can change this if you want
MODEL = os.environ.get("OPENAI_TRANSLATE_MODEL", "gpt-4.1-mini")

# Throttling (be nice to your wallet / rate limits)
SLEEP_SECS = 0.05

TARGET_LANG_NAME = "Scottish Gaelic"
TARGET_LANG_CODE = "gd"

client = OpenAI()

# =========================
# HELPERS
# =========================
def _load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default

def _save_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def _stable_key(text: str) -> str:
    # Stable cache key (handles very long strings)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def translate_text(text: str, cache: Dict[str, str]) -> str:
    if not isinstance(text, str):
        return text
    s = text.strip()
    if not s:
        return text

    k = _stable_key(s)
    if k in cache:
        return cache[k]

    # Ask for ONLY the translation; no quotes, no commentary.
    prompt = (
        f"Translate the following English text into {TARGET_LANG_NAME}.\n"
        f"Return ONLY the translated text, nothing else.\n\n"
        f"TEXT:\n{s}"
    )

    resp = client.responses.create(
        model=MODEL,
        input=prompt
    )
    out = resp.output_text.strip()

    cache[k] = out
    time.sleep(SLEEP_SECS)
    return out

def translate_values(obj: Any, cache: Dict[str, str]) -> Any:
    # Translate string values recursively, preserve keys and structure.
    if isinstance(obj, str):
        return translate_text(obj, cache)
    if isinstance(obj, list):
        return [translate_values(x, cache) for x in obj]
    if isinstance(obj, dict):
        return {k: translate_values(v, cache) for k, v in obj.items()}
    return obj

# =========================
# LESSON TRANSLATION
# =========================
def translate_lessons():
    lesson_cache = _load_json(LESSON_CACHE, {})

    DST_LESSONS_DIR.mkdir(parents=True, exist_ok=True)

    src_files = sorted([p for p in SRC_LESSONS_DIR.glob("*.json")])
    if not src_files:
        raise SystemExit(f"❌ No lesson files found in {SRC_LESSONS_DIR}")

    translated_count = 0

    for p in src_files:
        data = json.loads(p.read_text(encoding="utf-8"))

        # Your lesson schema varies, but you consistently use items[] with fields like:
        # prompt, choices[], correct[], tts, en
        # We translate any string fields we see, but DO NOT touch IDs/types.
        # Also, write into a gd field when appropriate.
        items = data.get("items", [])
        for item in items:
            # If you keep an "en" field as the meaning, keep it.
            # Populate "gd" if present or if target field exists.
            if "en" in item and (item.get("gd") in (None, "",) or "gd" not in item):
                item["gd"] = translate_text(item["en"], lesson_cache)

            # Translate prompt/tts if they are English (often they are)
            for key in ("prompt", "tts", "placeholder"):
                if key in item and isinstance(item[key], str) and item[key].strip():
                    # Only translate if it looks English-ish; simplest rule: translate always.
                    item[key] = translate_text(item[key], lesson_cache)

            # choices and correct can be lists of strings
            if "choices" in item and isinstance(item["choices"], list):
                item["choices"] = [translate_text(x, lesson_cache) if isinstance(x, str) else x for x in item["choices"]]

            if "correct" in item and isinstance(item["correct"], list):
                item["correct"] = [translate_text(x, lesson_cache) if isinstance(x, str) else x for x in item["correct"]]

        out_path = DST_LESSONS_DIR / p.name
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

        translated_count += 1
        if translated_count % 10 == 0:
            print(f"✅ Translated {translated_count}/{len(src_files)} lessons...")

        _save_json(LESSON_CACHE, lesson_cache)

    print(f"✅ Lessons done: {translated_count} files")
    _save_json(LESSON_CACHE, lesson_cache)

# =========================
# OVERLAY TRANSLATION (UI)
# =========================
def translate_overlays_everywhere():
    overlay_cache = _load_json(OVERLAY_CACHE, {})

    # Create gd overlay for every course that has overlays/en.json
    updated = 0
    for course_dir in [p for p in COURSES.iterdir() if p.is_dir()]:
        overlays_dir = course_dir / "overlays"
        src = overlays_dir / OVERLAY_SRC_NAME
        if not src.exists():
            continue

        en_overlay = json.loads(src.read_text(encoding="utf-8"))
        gd_overlay = translate_values(en_overlay, overlay_cache)

        dst = overlays_dir / OVERLAY_DST_NAME
        dst.write_text(json.dumps(gd_overlay, ensure_ascii=False, indent=2), encoding="utf-8")
        updated += 1

        if updated % 5 == 0:
            print(f"✅ Overlays updated in {updated} courses...")
        _save_json(OVERLAY_CACHE, overlay_cache)

    print(f"✅ Overlay done: updated {updated} courses")
    _save_json(OVERLAY_CACHE, overlay_cache)

# =========================
# MANIFEST (gd course)
# =========================
def build_gd_manifest():
    # Build a minimal manifest based on lesson filenames (no dependency on en manifest)
    lesson_files = sorted([p.name for p in DST_LESSONS_DIR.glob("*.json")])
    manifest = {
        "code": TARGET_LANG_CODE,
        "name": TARGET_LANG_NAME,
        "ready": True,
        "hasAudio": False,
        "lessons": lesson_files
    }
    (DST_COURSE_DIR).mkdir(parents=True, exist_ok=True)
    (DST_COURSE_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("✅ Built courses/gd/manifest.json")

# =========================
# ZIP OUTPUT (gd only)
# =========================
def zip_gd_course():
    OUT_ZIP_DIR.mkdir(parents=True, exist_ok=True)
    if OUT_ZIP_PATH.exists():
        OUT_ZIP_PATH.unlink()

    with zipfile.ZipFile(OUT_ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as z:
        for p in (DST_COURSE_DIR).rglob("*"):
            if p.is_file():
                arc = str(p.relative_to(ROOT))
                z.write(p, arcname=arc)

    print(f"✅ Wrote {OUT_ZIP_PATH}")

def main():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print("== Translating lessons en -> gd ==")
    translate_lessons()

    print("== Translating overlays en -> gd across all courses ==")
    translate_overlays_everywhere()

    print("== Building gd manifest ==")
    build_gd_manifest()

    print("== Zipping gd course ==")
    zip_gd_course()

    print("DONE ✅")

if __name__ == "__main__":
    main()
