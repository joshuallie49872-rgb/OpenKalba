import json
import re
from pathlib import Path
from typing import Any, Set, Tuple

COURSES_DIR = Path("courses")

# "vocab-ish" filter:
# - allow letters, spaces, apostrophes, slashes, hyphens
# - reject strings with non-latin chars (those are already translated)
# - reject very long sentences (usually UI/prompts)
VOCAB_RE = re.compile(r"^[A-Za-z][A-Za-z\s'’/\-]{0,48}$")

def iter_strings(obj: Any) -> Set[str]:
    out: Set[str] = set()
    if isinstance(obj, str):
        s = obj.strip()
        if s:
            out.add(s)
    elif isinstance(obj, list):
        for x in obj:
            out |= iter_strings(x)
    elif isinstance(obj, dict):
        for v in obj.values():
            out |= iter_strings(v)
    return out

def looks_like_vocab(s: str) -> bool:
    # Skip obvious UI-ish sentences
    if len(s) > 50:
        return False
    # If it contains non-ascii letters, it's probably already translated content
    # (We only want keys like "wine", "workday", "excuse me / sorry", etc.)
    if any(ord(ch) > 127 for ch in s):
        return False
    return bool(VOCAB_RE.match(s))

def collect_course_vocab(course_dir: Path) -> Set[str]:
    vocab: Set[str] = set()
    lessons_dir = course_dir / "lessons"
    if not lessons_dir.exists():
        return vocab

    # read all json files under lessons/
    for p in lessons_dir.rglob("*.json"):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue

        for s in iter_strings(data):
            # normalize spaces
            s2 = re.sub(r"\s+", " ", s).strip()
            if looks_like_vocab(s2):
                vocab.add(s2)

    return vocab

def load_overlay(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"ui": {}, "gloss": {}}

def write_overlay(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def main(overlay_code: str) -> None:
    if not COURSES_DIR.exists():
        raise SystemExit("ERROR: 'courses/' folder not found. Run this from your OpenKalba repo root.")

    total_added = 0
    total_candidates = 0

    for course_dir in sorted([p for p in COURSES_DIR.iterdir() if p.is_dir()]):
        course_code = course_dir.name
        overlays_dir = course_dir / "overlays"
        overlay_path = overlays_dir / f"{overlay_code}.json"

        vocab = collect_course_vocab(course_dir)
        if not vocab:
            continue

        data = load_overlay(overlay_path)
        data.setdefault("ui", {})
        data.setdefault("gloss", {})

        before = set(data["gloss"].keys())

        # Add missing keys with empty translations (prevents English leak)
        for k in sorted(vocab):
            if k not in data["gloss"]:
                data["gloss"][k] = ""

        after = set(data["gloss"].keys())
        added = len(after - before)

        if added > 0:
            # optional: keep gloss sorted for sanity
            data["gloss"] = dict(sorted(data["gloss"].items(), key=lambda kv: kv[0].lower()))
            write_overlay(overlay_path, data)

        total_added += added
        total_candidates += len(vocab)

        print(f"[{course_code}] candidates={len(vocab)} added={added} -> {overlay_path.as_posix()}")

    print("\nDONE")
    print(f"Total vocab candidates scanned: {total_candidates}")
    print(f"Total new gloss keys added: {total_added}")
    print("Note: values are empty strings \"\" by design (no fake translations).")

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        raise SystemExit("Usage: py tools/build_overlay_from_lessons.py <overlay_code>\nExample: py tools/build_overlay_from_lessons.py zh")
    main(sys.argv[1].strip())
