#!/usr/bin/env python3
"""
OpenKalba — make_course_from_lt.py

Creates a new course folder (e.g., courses/ru) by copying Lithuanian lessons
and converting them into "overlay-friendly" format:

- For choose questions:
  - keeps canonical English in `choices` (for grading/index stability)
  - creates `choices_<native>` arrays using overlay.gloss (e.g. choices_uk)
  - adds prompt_<native> using overlay.ui for prompt strings

- For translate questions:
  - keeps `en` as canonical English source
  - creates `<native>` field (e.g. uk) using overlay.gloss (English -> native)
  - keeps `correct` as Lithuanian (or target language if you later swap)

This does NOT magically create Russian-language content yet; it creates the
structure that lets native overlays drive display without editing 200 lessons.

Run:
  python tools/make_course_from_lt.py --to ru --native uk
Examples:
  python tools/make_course_from_lt.py --to ru --native uk
  python tools/make_course_from_lt.py --to ru --native mx
"""

import argparse
import json
import os
import shutil
from pathlib import Path

PROMPT_KEYS = [
    "Pick the correct meaning",
    "Translate to Lithuanian",
]

def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def gloss_translate(gloss: dict, english: str) -> str:
    # exact-key lookup (your gloss keys are exact English phrases)
    return gloss.get(english, english)

def ui_translate(ui: dict, english: str) -> str:
    return ui.get(english, english)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--to", required=True, help="new course code to create (e.g. ru)")
    ap.add_argument("--native", required=True, help="native overlay code to generate fields for (e.g. uk, mx, de)")
    ap.add_argument("--from_course", default="lt", help="source course code (default: lt)")
    args = ap.parse_args()

    root = Path(__file__).resolve().parents[1]  # project root (one up from tools/)
    src_course = args.from_course
    dst_course = args.to
    native = args.native

    src_lessons_dir = root / "courses" / src_course / "lessons"
    src_manifest = src_lessons_dir / "manifest.json"
    if not src_manifest.exists():
        raise SystemExit(f"Missing {src_manifest}")

    # IMPORTANT: we reuse LT overlays folder as the "native overlays" provider
    # because your overlays are currently under courses/lt/overlays/<native>.json
    overlay_path = root / "courses" / "lt" / "overlays" / f"{native}.json"
    if not overlay_path.exists():
        raise SystemExit(f"Missing overlay file: {overlay_path}")

    overlay = load_json(overlay_path)
    ui = overlay.get("ui", {}) if isinstance(overlay.get("ui", {}), dict) else {}
    gloss = overlay.get("gloss", {}) if isinstance(overlay.get("gloss", {}), dict) else {}

    dst_course_dir = root / "courses" / dst_course
    dst_lessons_dir = dst_course_dir / "lessons"

    # Copy entire lt course structure as base (but we will overwrite lessons)
    if dst_course_dir.exists():
        print(f"[!] courses/{dst_course} already exists. We will update lessons only.")
    else:
        dst_course_dir.mkdir(parents=True, exist_ok=True)

    # Copy manifest
    manifest = load_json(src_manifest)
    save_json(dst_lessons_dir / "manifest.json", manifest)

    # Transform each lesson file referenced by manifest
    lessons = manifest.get("lessons", [])
    if not isinstance(lessons, list) or not lessons:
        raise SystemExit("manifest.json has no lessons[]")

    for entry in lessons:
        file_path = entry.get("file") or ""
        # your manifest uses something like "courses/lt/lessons/001-basics.json"
        # we convert to local filename:
        filename = Path(file_path).name if file_path else f"{entry.get('id','')}.json"
        src_lesson_path = src_lessons_dir / filename
        if not src_lesson_path.exists():
            print(f"[skip] missing lesson {src_lesson_path}")
            continue

        data = load_json(src_lesson_path)
        questions = data.get("questions", [])
        if not isinstance(questions, list):
            print(f"[skip] bad questions[] in {src_lesson_path}")
            continue

        for q in questions:
            qtype = q.get("type", "")
            prompt = q.get("prompt", "")

            # prompt_<native> from overlay.ui (or keep blank if not found)
            if isinstance(prompt, str) and prompt:
                q[f"prompt_{native}"] = ui_translate(ui, prompt) if prompt in PROMPT_KEYS else ui_translate(ui, prompt)

            if qtype == "choose":
                choices = q.get("choices", [])
                if isinstance(choices, list) and choices:
                    # create translated display choices using gloss
                    q[f"choices_{native}"] = [gloss_translate(gloss, str(c)) for c in choices]

            elif qtype == "translate":
                en = q.get("en", "")
                if isinstance(en, str) and en:
                    # create native source field, e.g. q["uk"] = "привіт"
                    q[native] = gloss_translate(gloss, en)

        out = {
            "id": data.get("id", entry.get("id", "")),
            "title": data.get("title", entry.get("title", "")),
            "questions": questions,
        }
        save_json(dst_lessons_dir / filename, out)
        print(f"[ok] {dst_course}/lessons/{filename}")

    print("\nDone.")
    print(f"Created/updated: courses/{dst_course}/lessons/*")
    print("Next: add courses/ru/overlays/*.json (copy from lt/overlays for now) and set catalog ready:true")

if __name__ == "__main__":
    main()
