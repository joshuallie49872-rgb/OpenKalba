import json, os, sys
from pathlib import Path

PLACEHOLDER_LT = "Type Lithuanian…"

# tiny starter map for zh for common cafe words (optional, but helps immediately)
ZH_FALLBACK = {
    "menu": "菜单",
    "bill": "账单",
    "table": "桌子",
    "coffee": "咖啡",
    "please": "请",
    "thanks": "谢谢",
    "thank you": "谢谢",
}

def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))

def save_json(p: Path, obj):
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def fix_lesson(obj, add_zh=True):
    qs = obj.get("questions", [])
    if not qs:
        return False

    changed = False

    # Build lt -> englishMeaning map from any valid choose questions
    lt_to_en = {}
    for q in qs:
        lt = (q.get("lt") or "").strip()
        corr = q.get("correct") or []
        if lt and isinstance(corr, list) and corr:
            lt_to_en[lt] = corr[0]

    for q in qs:
        # 1) Fix empty prompt
        if (q.get("prompt") is None) or (str(q.get("prompt")).strip() == ""):
            # choose => "Pick the correct meaning"
            if q.get("type") == "choose":
                q["prompt"] = "Pick the correct meaning"
                changed = True
            # translate/unknown => "Translate to Lithuanian"
            elif q.get("type") in ("translate", "unknown"):
                q["prompt"] = "Translate to Lithuanian"
                changed = True

        # 2) Convert broken "unknown" translate rows
        if q.get("type") == "unknown":
            tts = (q.get("tts") or "").strip()
            lt = (q.get("lt") or "").strip()
            choices = q.get("choices") or []
            # Pattern you showed: lt empty, choices empty, only tts present
            if tts and lt == "" and choices == []:
                # infer english meaning from earlier choose questions in same lesson
                en = lt_to_en.get(tts, "")
                q["type"] = "translate"
                q["prompt"] = "Translate to Lithuanian"
                q["lt"] = ""
                q["choices"] = []
                q["tts"] = tts
                q["correct"] = [tts]
                if en:
                    q["en"] = en
                # add placeholder if missing
                if not q.get("placeholder"):
                    q["placeholder"] = PLACEHOLDER_LT
                # optional: add zh immediately if we have a quick mapping
                if add_zh and en and (not q.get("zh")):
                    q["zh"] = ZH_FALLBACK.get(en, "")
                changed = True

        # 3) Ensure translate questions have placeholder and correct shape
        if q.get("type") == "translate":
            if not q.get("placeholder"):
                q["placeholder"] = PLACEHOLDER_LT
                changed = True
            corr = q.get("correct")
            if not isinstance(corr, list) or len(corr) == 0:
                tts = (q.get("tts") or "").strip()
                if tts:
                    q["correct"] = [tts]
                    changed = True

    return changed

def main():
    if len(sys.argv) < 2:
        print("Usage: py tools/fix_broken_lessons.py <course_code>   (example: lt)")
        sys.exit(1)

    course = sys.argv[1].strip()
    lessons_dir = Path("courses") / course / "lessons"
    if not lessons_dir.exists():
        print(f"Missing lessons dir: {lessons_dir}")
        sys.exit(1)

    files = sorted(lessons_dir.glob("*.json"))
    if not files:
        print(f"No lesson json files in: {lessons_dir}")
        sys.exit(1)

    fixed = 0
    for f in files:
        obj = load_json(f)
        if fix_lesson(obj, add_zh=True):
            save_json(f, obj)
            fixed += 1

    print(f"DONE. Updated {fixed}/{len(files)} lesson files in {lessons_dir}")

if __name__ == "__main__":
    main()
