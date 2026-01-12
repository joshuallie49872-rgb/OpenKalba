import json
import shutil
from pathlib import Path
from datetime import datetime

LESSONS_DIR = Path("courses/lt/lessons")
BACKUP_ROOT = Path("tools/_backup_lessons")

def is_translate_prompt(prompt: str) -> bool:
    p = (prompt or "").strip().lower()
    return "translate" in p

def migrate_lesson(data: dict) -> tuple[dict, bool, list[str]]:
    """
    Returns: (new_data, changed?, notes[])
    """
    changed = False
    notes = []

    qs = data.get("questions")
    if not isinstance(qs, list) or not qs:
        return data, False, ["skip: no questions[]"]

    # 1) Build LT -> EN map from choose questions (labas -> hello)
    lt_to_en = {}
    for q in qs:
        if not isinstance(q, dict):
            continue
        lt = (q.get("lt") or "").strip()
        # existing choose answer is English meaning
        ans = (q.get("answer") or "").strip()
        choices = q.get("choices")
        if lt and ans and isinstance(choices, list) and len(choices) > 0:
            lt_to_en.setdefault(lt, ans)

    # 2) Migrate each question into canonical form
    new_qs = []
    for q in qs:
        if not isinstance(q, dict):
            new_qs.append(q)
            continue

        prompt = q.get("prompt") or ""
        choices = q.get("choices")
        has_choices = isinstance(choices, list) and len(choices) > 0

        q_type = (q.get("type") or "").strip().lower()

        # Infer type if missing
        if not q_type:
            if has_choices:
                q_type = "choose"
            elif is_translate_prompt(prompt):
                q_type = "translate"

        if q_type == "choose":
            # Canonical choose: correct:[...], remove answer
            ans = q.get("answer")
            correct = q.get("correct")

            # Make correct array
            if isinstance(correct, list) and correct:
                pass
            else:
                if isinstance(ans, str) and ans.strip():
                    q["correct"] = [ans.strip()]
                    changed = True
                else:
                    # If no answer, try to infer from existing correctAnswer or similar
                    ca = q.get("correctAnswer")
                    if isinstance(ca, str) and ca.strip():
                        q["correct"] = [ca.strip()]
                        changed = True

            # Remove single-string answer to reduce ambiguity going forward
            if "answer" in q:
                del q["answer"]
                changed = True

            q["type"] = "choose"
            # Keep prompt/lt/choices/tts as-is
            new_qs.append(q)
            continue

        if q_type == "translate":
            # Your current translate rows look like:
            # { prompt:"Translate...", lt:"", choices:[], tts:"labas" }
            # We convert them to:
            # { type:"translate", en:"hello", correct:["labas"], tts:"labas", placeholder:"Type Lithuanian…" }

            # Determine the Lithuanian answer from:
            # - correct[0] if exists
            # - tts if string
            correct = q.get("correct")
            lt_answer = ""
            if isinstance(correct, list) and correct and isinstance(correct[0], str):
                lt_answer = correct[0].strip()
            if not lt_answer:
                tts = q.get("tts")
                if isinstance(tts, str) and tts.strip():
                    lt_answer = tts.strip()
                elif isinstance(tts, dict) and isinstance(tts.get("text"), str) and tts["text"].strip():
                    lt_answer = tts["text"].strip()

            # Set correct
            if lt_answer:
                q["correct"] = [lt_answer]
                changed = True
            else:
                notes.append("warn: translate missing lt answer (no tts/correct)")

            # Set en from map
            if not isinstance(q.get("en"), str) or not q.get("en").strip():
                if lt_answer and lt_answer in lt_to_en:
                    q["en"] = lt_to_en[lt_answer]
                    changed = True
                else:
                    q["en"] = q.get("en") or ""
                    # leave blank if unknown

            # Canonical
            q["type"] = "translate"
            q["placeholder"] = q.get("placeholder") or "Type Lithuanian…"

            # Clean up fields that don’t belong on translate
            # (keep lt if you want; your samples have lt:"" so we keep it untouched)
            new_qs.append(q)
            continue

        # Unknown type: leave it but keep consistent shape
        q["type"] = q_type or "unknown"
        new_qs.append(q)

    data["questions"] = new_qs
    return data, changed, notes

def main():
    if not LESSONS_DIR.exists():
        raise SystemExit(f"ERROR: folder not found: {LESSONS_DIR}")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = BACKUP_ROOT / ts
    backup_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(LESSONS_DIR.glob("*.json"))
    if not files:
        raise SystemExit(f"ERROR: no .json files found in {LESSONS_DIR}")

    changed_count = 0
    skipped_count = 0

    for fp in files:
        raw = fp.read_text(encoding="utf-8")
        try:
            data = json.loads(raw)
        except Exception as e:
            print(f"[SKIP] {fp.name}: JSON parse error: {e}")
            skipped_count += 1
            continue

        new_data, changed, notes = migrate_lesson(data)

        # Always backup original file 1:1
        shutil.copy2(fp, backup_dir / fp.name)

        if changed:
            # Write pretty + stable formatting
            fp.write_text(json.dumps(new_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            changed_count += 1
            print(f"[OK]   {fp.name}: migrated")
        else:
            print(f"[NOOP] {fp.name}: no changes")

        for n in notes:
            print(f"       - {n}")

    print("\nDONE")
    print(f"Backups: {backup_dir}")
    print(f"Changed: {changed_count}")
    print(f"Skipped: {skipped_count}")
    print(f"Total:   {len(files)}")

if __name__ == "__main__":
    main()
