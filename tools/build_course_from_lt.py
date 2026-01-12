# tools/build_course_from_lt.py
# Build a new course (e.g., Russian) by cloning LT lessons and replacing LT tokens using a mapping CSV.
# Usage:
#   python tools/build_course_from_lt.py extract --target ru
#   (fill the generated CSV mapping)
#   python tools/build_course_from_lt.py build --target ru
#   python tools/build_course_from_lt.py audit --target ru

import argparse
import csv
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional

ROOT = Path(__file__).resolve().parents[1]  # OpenKalba/
COURSES = ROOT / "courses"

SOURCE_COURSE = "lt"
SOURCE_LESSONS_DIR = COURSES / SOURCE_COURSE / "lessons"
SOURCE_MANIFEST = SOURCE_LESSONS_DIR / "manifest.json"

MAP_DIR = ROOT / "tools" / "_maps"
MAP_DIR.mkdir(parents=True, exist_ok=True)

LT_DIACRITICS = set("ąčęėįšųūžĄČĘĖĮŠŲŪŽ")


def read_json(p: Path) -> Any:
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(p: Path, data: Any) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def deep_copy(obj: Any) -> Any:
    # safest deep copy for dict/list containing only JSON-serializable types
    return json.loads(json.dumps(obj, ensure_ascii=False))


def normalize_questions(lesson: Dict[str, Any]) -> List[Dict[str, Any]]:
    # Supports {questions:[...]} or {items:[...]} (older)
    if isinstance(lesson.get("questions"), list):
        return lesson["questions"]
    if isinstance(lesson.get("items"), list):
        return lesson["items"]
    return []


def collect_lt_tokens() -> Tuple[List[Path], List[str]]:
    """Scan all LT lesson JSON files and collect unique Lithuanian tokens used in lt/tts/correct."""
    if not SOURCE_LESSONS_DIR.exists():
        raise SystemExit(f"Missing: {SOURCE_LESSONS_DIR}")

    lesson_files = sorted([p for p in SOURCE_LESSONS_DIR.glob("*.json") if p.name != "manifest.json"])
    tokens = set()

    for lf in lesson_files:
        data = read_json(lf)
        qs = normalize_questions(data)
        for q in qs:
            qtype = (q.get("type") or "").strip().lower()

            # token sources in LT lessons
            lt_word = (q.get("lt") or "").strip()
            if lt_word:
                tokens.add(lt_word)

            # sometimes LT word is stored under "lt" language key
            lt_lang_key = (q.get(SOURCE_COURSE) or "").strip()
            if lt_lang_key:
                tokens.add(lt_lang_key)

            # many lessons have tts set to LT word
            tts = q.get("tts")
            if isinstance(tts, str) and tts.strip():
                tokens.add(tts.strip())
            elif isinstance(tts, dict) and isinstance(tts.get("text"), str) and tts["text"].strip():
                tokens.add(tts["text"].strip())

            # translate questions have correct list = LT answers
            if qtype == "translate":
                corr = q.get("correct")
                if isinstance(corr, list):
                    for c in corr:
                        if isinstance(c, str) and c.strip():
                            tokens.add(c.strip())

            # also harvest correct[] for choose-type questions (often contains LT tokens in older shapes)
            if qtype == "choose":
                corr = q.get("correct")
                if isinstance(corr, list):
                    for c in corr:
                        if isinstance(c, str) and c.strip():
                            tokens.add(c.strip())

    return lesson_files, sorted(tokens)


def mapping_csv_path(target: str) -> Path:
    return MAP_DIR / f"{SOURCE_COURSE}_to_{target}.csv"


def _norm_header(h: str) -> str:
    if h is None:
        return ""
    # strip BOM + common mojibake BOM marker
    return str(h).strip().lstrip("\ufeff").replace("ï»¿", "")


def _pick_field(fieldnames: List[str], wanted: str) -> Optional[str]:
    """
    Find the real header name for 'src'/'dst' even if it contains BOM garbage.
    Example: ['ï»¿src','dst'] -> returns 'ï»¿src' for wanted='src'
    """
    if not fieldnames:
        return None
    wanted = wanted.lower().strip()
    # exact match first
    for fn in fieldnames:
        if _norm_header(fn).lower() == wanted:
            return fn
    # fallback: endswith match (super defensive)
    for fn in fieldnames:
        if _norm_header(fn).lower().endswith(wanted):
            return fn
    return None


def write_mapping_csv(target: str, tokens: List[str]) -> Path:
    """
    Create/update mapping CSV.
    IMPORTANT: write as UTF-8 (no BOM) with headers: src,dst
    """
    p = mapping_csv_path(target)
    existing: Dict[str, Dict[str, str]] = {}

    if p.exists():
        # preserve anything already filled (handle BOM-safe)
        with p.open("r", encoding="utf-8-sig", newline="") as f:
            r = csv.DictReader(f)
            src_key = _pick_field(r.fieldnames or [], "src")
            dst_key = _pick_field(r.fieldnames or [], "dst")
            if src_key and dst_key:
                for row in r:
                    s = (row.get(src_key) or "").strip()
                    d = (row.get(dst_key) or "").strip()
                    if s:
                        existing[s] = {"src": s, "dst": d}

    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["src", "dst"])
        w.writeheader()
        for t in tokens:
            row = existing.get(t, {"src": t, "dst": ""})
            w.writerow(row)

    return p


def load_mapping_csv(target: str) -> Dict[str, str]:
    """
    Load mapping CSV robustly:
      - reads UTF-8 with or without BOM (utf-8-sig)
      - accepts header 'ï»¿src' etc
    """
    p = mapping_csv_path(target)
    if not p.exists():
        raise SystemExit(f"Missing mapping CSV: {p}\nRun: python tools/build_course_from_lt.py extract --target {target}")

    m: Dict[str, str] = {}
    with p.open("r", encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        fieldnames = r.fieldnames or []
        src_key = _pick_field(fieldnames, "src")
        dst_key = _pick_field(fieldnames, "dst")
        if not src_key or not dst_key:
            raise SystemExit(
                f"CSV header problem in {p}\n"
                f"Expected headers like: src,dst\n"
                f"Found: {fieldnames}"
            )

        for row in r:
            src = (row.get(src_key) or "").strip()
            dst = (row.get(dst_key) or "").strip()
            if src and dst:
                m[src] = dst
    return m


def replace_token(s: str, mapping: Dict[str, str]) -> str:
    s = (s or "").strip()
    if not s:
        return s
    return mapping.get(s, s)  # if missing, keep original (build still runs)


def build_target_manifest(target: str) -> Dict[str, Any]:
    src = read_json(SOURCE_MANIFEST)
    out = {"lessons": []}
    for l in src.get("lessons", []):
        out["lessons"].append({
            "id": l.get("id"),
            "title": l.get("title", l.get("id")),
            "topic": l.get("topic", ""),
            "icon": l.get("icon", ""),
            "file": f"courses/{target}/lessons/{l.get('id')}.json"
        })
    return out


def get_tts_text(q: Dict[str, Any]) -> str:
    tts = q.get("tts")
    if isinstance(tts, str):
        return tts.strip()
    if isinstance(tts, dict):
        t = tts.get("text")
        if isinstance(t, str):
            return t.strip()
    return ""


def set_tts_text(q: Dict[str, Any], text: str) -> None:
    if not isinstance(text, str):
        return
    text = text.strip()
    if not text:
        return
    tts = q.get("tts")
    if isinstance(tts, dict):
        q["tts"]["text"] = text
    else:
        q["tts"] = text


def _get_source_token(q: Dict[str, Any]) -> str:
    """
    Find the Lithuanian token for a question in the most reliable way.
    Some lessons store it in q['lt'], some in q['tts'], some in q['lt'] language key.
    """
    v = (q.get("lt") or "").strip()
    if v:
        return v

    v = (q.get(SOURCE_COURSE) or "").strip()
    if v:
        return v

    tts_text = get_tts_text(q)
    if tts_text:
        return tts_text

    # last resort: sometimes correct[] holds the token in older shapes
    corr = q.get("correct")
    if isinstance(corr, list) and len(corr) == 1 and isinstance(corr[0], str):
        v = corr[0].strip()
        if v:
            return v

    return ""


def convert_lesson_to_target(src_lesson: Dict[str, Any], target: str, mapping: Dict[str, str]) -> Dict[str, Any]:
    out = {
        "id": src_lesson.get("id", ""),
        "title": src_lesson.get("title", ""),
        "questions": []
    }

    qs = normalize_questions(src_lesson)
    for q in qs:
        qtype = (q.get("type") or "").strip().lower()

        if qtype == "choose":
            lt_token = _get_source_token(q)
            target_word = replace_token(lt_token, mapping)

            choices = q.get("choices") if isinstance(q.get("choices"), list) else []
            correct = q.get("correct") if isinstance(q.get("correct"), list) else []

            out_q = {
                "prompt": q.get("prompt", "Pick the correct meaning"),
                target: target_word,
                "lt": "",
                "choices": choices,
                "correct": correct,
                "type": "choose"
            }

            # ALWAYS force TTS to target language word (never carry LT)
            set_tts_text(out_q, target_word)

            if "answerIndex" in q:
                out_q["answerIndex"] = q["answerIndex"]
            if "correctIndex" in q:
                out_q["correctIndex"] = q["correctIndex"]

            out["questions"].append(out_q)
            continue

        if qtype == "translate":
            en = (q.get("en") or "").strip()
            corr = q.get("correct") if isinstance(q.get("correct"), list) else []

            new_correct: List[str] = []
            for c in corr:
                if isinstance(c, str) and c.strip():
                    new_correct.append(replace_token(c.strip(), mapping))

            tts_text = new_correct[0] if new_correct else ""

            out_q = {
                "prompt": q.get("prompt", "Translate to Lithuanian"),
                "choices": [],
                "type": "translate",
                "en": en,
                target: "",
                "correct": new_correct,
                "placeholder": f"Type {target.upper()}…"
            }

            # ALWAYS force TTS to target language answer (never carry LT)
            set_tts_text(out_q, tts_text)

            out["questions"].append(out_q)
            continue

        # --------
        # Fallback: do NOT pass-through raw (this is what was killing you).
        # We clone it, then aggressively fix tts/correct and any obvious LT token fields.
        # --------
        q2 = deep_copy(q)

        # If it has a Lithuanian token field, we can optionally create target field
        src_tok = (q2.get("lt") or "").strip() or (q2.get(SOURCE_COURSE) or "").strip()
        if src_tok:
            mapped = replace_token(src_tok, mapping)
            # add/overwrite target field only if it exists already OR target field missing but this looks like a "word" question
            if target in q2 or target not in q2:
                q2[target] = mapped

        # Always fix tts if it matches a mapping key OR contains LT diacritics
        tts_old = get_tts_text(q2)
        if tts_old:
            tts_new = replace_token(tts_old, mapping)
            # Only overwrite if changed OR if old looks Lithuanian
            if tts_new != tts_old or any(ch in LT_DIACRITICS for ch in tts_old):
                set_tts_text(q2, tts_new)

        # Fix correct[] strings if they match mapping keys
        corr = q2.get("correct")
        if isinstance(corr, list):
            new_corr = []
            changed = False
            for c in corr:
                if isinstance(c, str):
                    c_new = replace_token(c.strip(), mapping)
                    if c_new != c:
                        changed = True
                    new_corr.append(c_new)
                else:
                    new_corr.append(c)
            if changed:
                q2["correct"] = new_corr

        out["questions"].append(q2)

    return out


def cmd_extract(target: str) -> None:
    _, tokens = collect_lt_tokens()
    p = write_mapping_csv(target, tokens)
    print("\n✅ Extract complete.")
    print(f"Mapping file created/updated:\n  {p}")
    print("\nNext:")
    print(f"1) Open that CSV and fill the 'dst' column with {target.upper()} translations.")
    print(f"2) Run: python tools/build_course_from_lt.py build --target {target}\n")


def cmd_build(target: str) -> None:
    mapping = load_mapping_csv(target)

    target_course_dir = COURSES / target
    target_lessons_dir = target_course_dir / "lessons"
    target_lessons_dir.mkdir(parents=True, exist_ok=True)

    manifest = build_target_manifest(target)
    write_json(target_lessons_dir / "manifest.json", manifest)

    lesson_files = sorted([p for p in SOURCE_LESSONS_DIR.glob("*.json") if p.name != "manifest.json"])
    built = 0

    for lf in lesson_files:
        src_lesson = read_json(lf)
        converted = convert_lesson_to_target(src_lesson, target, mapping)
        write_json(target_lessons_dir / lf.name, converted)
        built += 1

    print("\n✅ Build complete.")
    print(f"Built {built} lesson files into:\n  {target_lessons_dir}")
    print(f"Manifest written:\n  {target_lessons_dir / 'manifest.json'}")
    print("\nImportant:")
    print("- If some words didn’t change, your CSV is missing those rows in 'dst' OR the LT token is new.")
    print("- Run audit to find leaks + missing mappings:")
    print(f"  python tools/build_course_from_lt.py audit --target {target}\n")


def _contains_lt_diacritics(s: str) -> bool:
    if not s:
        return False
    return any(ch in LT_DIACRITICS for ch in s)


def cmd_audit(target: str) -> None:
    """
    Audit built target lessons:
      - Flags Lithuanian leaks in:
        * the target language field
        * tts field (string or dict.text)
        * correct[] for translate-type questions
      - Uses TWO detectors:
        A) LT diacritics (ąčęėįšųūž...)
        B) exact match against mapping SRC keys (catches 'argumentas', 'problema', etc.)
    """
    mapping = load_mapping_csv(target)
    src_keys = set(mapping.keys())

    target_lessons_dir = COURSES / target / "lessons"
    if not target_lessons_dir.exists():
        raise SystemExit(f"Missing: {target_lessons_dir} (run build first)")

    lesson_files = sorted([p for p in target_lessons_dir.glob("*.json") if p.name != "manifest.json"])
    leaks: List[str] = []
    leaked_tokens: set = set()

    def flag(lf_name: str, field: str, val: str):
        leaks.append(f"{lf_name}: {field}='{val}'")
        leaked_tokens.add(val.strip())

    for lf in lesson_files:
        data = read_json(lf)
        qs = normalize_questions(data)
        for q in qs:
            qtype = (q.get("type") or "").strip().lower()

            # target field
            tv = q.get(target)
            if isinstance(tv, str):
                tvs = tv.strip()
                if tvs and (_contains_lt_diacritics(tvs) or tvs in src_keys):
                    flag(lf.name, target, tvs)

            # tts field
            tts_text = get_tts_text(q)
            if tts_text:
                if _contains_lt_diacritics(tts_text) or tts_text in src_keys:
                    flag(lf.name, "tts", tts_text)

            # translate correct[]
            corr = q.get("correct")
            if isinstance(corr, list):
                for c in corr:
                    if isinstance(c, str):
                        cs = c.strip()
                        if not cs:
                            continue
                        # For translate, correct should be target language; if it equals src key, that's a leak
                        if _contains_lt_diacritics(cs) or cs in src_keys:
                            flag(lf.name, "correct[]", cs)

    print("\n=== AUDIT RESULT ===")
    if not leaks:
        print(f"✅ No Lithuanian leaks detected in courses/{target}/lessons")
        return

    print(f"❌ Found {len(leaks)} Lithuanian leaks in courses/{target}/lessons:")
    for line in leaks[:80]:
        print("  " + line)
    if len(leaks) > 80:
        print(f"  ...and {len(leaks)-80} more")

    # Missing mapping for leaked tokens (only matters if they look LT and aren't mapped)
    missing = [t for t in sorted(leaked_tokens) if t not in src_keys and _contains_lt_diacritics(t)]
    if missing:
        print("\nThese leaked LT tokens contain diacritics but are NOT in mapping SRC keys (add them to CSV src,dst):")
        for t in missing:
            print("  " + t)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    ap_extract = sub.add_parser("extract", help="Extract LT tokens into a mapping CSV to fill")
    ap_extract.add_argument("--target", required=True, help="Target course code, e.g. ru")

    ap_build = sub.add_parser("build", help="Build target lessons using the filled mapping CSV")
    ap_build.add_argument("--target", required=True, help="Target course code, e.g. ru")

    ap_audit = sub.add_parser("audit", help="Audit built lessons for Lithuanian leaks + missing mappings")
    ap_audit.add_argument("--target", required=True, help="Target course code, e.g. ru")

    args = ap.parse_args()

    target = args.target.strip().lower()
    if not target or target == SOURCE_COURSE:
        raise SystemExit("Target must be a non-LT code like ru, pl, etc.")

    if args.cmd == "extract":
        cmd_extract(target)
    elif args.cmd == "build":
        cmd_build(target)
    elif args.cmd == "audit":
        cmd_audit(target)


if __name__ == "__main__":
    main()
