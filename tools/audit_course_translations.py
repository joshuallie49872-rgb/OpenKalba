#!/usr/bin/env python3
"""
audit_course_translations.py

Usage (from repo root):
  python tools/audit_course_translations.py --target lv

What it does:
- Loads tools/_maps/lt_to_<target>.csv into a map (lt -> target).
- Scans courses/<target>/lessons/*.json
- Reports:
  * questions where target text is missing
  * questions where target text == lt (looks like fallback leakage)
  * any suspicious replacement characters (�) in strings

This does NOT modify files (safe audit only).
"""

import argparse
import csv
import glob
import json
import os
import re
from collections import Counter, defaultdict

REPL = "\ufffd"  # replacement char

def safe_str(x) -> str:
    return "" if x is None else str(x)

def load_map(map_path: str) -> dict[str, str]:
    mp: dict[str, str] = {}
    with open(map_path, "r", encoding="utf-8", newline="") as f:
        for row in csv.reader(f):
            if not row:
                continue
            if len(row) < 2:
                continue
            a = row[0].strip()
            b = row[1].strip()
            if not a:
                continue
            # keep first, but if later is non-blank, prefer it
            if a not in mp or (not mp[a] and b):
                mp[a] = b
    return mp

def walk_strings(obj):
    """Yield all strings nested in obj."""
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for it in obj:
            yield from walk_strings(it)
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from walk_strings(v)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True, help="Target language code (lv, pl, ru, etc)")
    ap.add_argument("--root", default=".", help="Repo root (default: current dir)")
    args = ap.parse_args()

    target = args.target.strip().lower()
    if target == "lt":
        raise SystemExit("Target must be non-LT (lv, ru, pl, etc).")

    root = os.path.abspath(args.root)
    map_path = os.path.join(root, "tools", "_maps", f"lt_to_{target}.csv")
    lessons_glob = os.path.join(root, "courses", target, "lessons", "*.json")

    if not os.path.exists(map_path):
        raise SystemExit(f"Missing map: {map_path}")
    if not glob.glob(lessons_glob):
        raise SystemExit(f"No lesson JSONs found at: {lessons_glob}")

    mp = load_map(map_path)

    missing_target = []   # (file, idx, lt, target_val)
    equals_lt = []        # (file, idx, lt, target_val)
    has_repl = []         # file paths
    suspicious = Counter()

    for p in sorted(glob.glob(lessons_glob)):
        try:
            with open(p, "r", encoding="utf-8") as f:
                d = json.load(f)
        except UnicodeDecodeError as e:
            print(f"DECODE_ERROR\t{p}\t{e}")
            continue

        # replacement-char scan across whole doc
        if any(REPL in s for s in walk_strings(d)):
            has_repl.append(p)

        qs = d.get("questions", []) or []
        for i, q in enumerate(qs):
            if not isinstance(q, dict):
                continue
            lt = (safe_str(q.get("lt"))).strip()
            tv = (safe_str(q.get(target))).strip()

            # If LT exists but target missing -> likely why you still see Lithuanian
            if lt and not tv:
                missing_target.append((p, i, lt, tv))
                suspicious["missing_target"] += 1

            # If target equals lt (fallback leakage)
            if lt and tv and tv == lt:
                equals_lt.append((p, i, lt, tv))
                suspicious["target_equals_lt"] += 1

            # If LT is mojibake-looking, map lookups won't match
            if lt and re.search(r"[ÃÂÄÅÐÑØÞÿ]", lt):
                suspicious["lt_mojibake_like"] += 1

            # If LT exists and map has translation but target doesn't match it
            if lt and lt in mp:
                expected = (mp.get(lt) or "").strip()
                if expected and tv and tv != expected:
                    suspicious["target_diff_from_map"] += 1

    print(f"target={target}")
    print(f"lessons={len(sorted(glob.glob(lessons_glob)))}")
    print("summary:", dict(suspicious))

    if has_repl:
        print("\nFILES_WITH_REPLACEMENT_CHAR (�):")
        for p in has_repl[:25]:
            print("  ", p)
        if len(has_repl) > 25:
            print(f"  ... (+{len(has_repl)-25} more)")

    if missing_target:
        print("\nFIRST_MISSING_TARGET (lt present, target blank):")
        for (p,i,lt,_) in missing_target[:30]:
            print(f"  {os.path.relpath(p, root)} :: q[{i}] lt='{lt}'")
        if len(missing_target) > 30:
            print(f"  ... (+{len(missing_target)-30} more)")
    else:
        print("\nNo missing target fields detected.")

    if equals_lt:
        print("\nFIRST_TARGET_EQUALS_LT (fallback leakage):")
        for (p,i,lt,_) in equals_lt[:30]:
            print(f"  {os.path.relpath(p, root)} :: q[{i}] '{lt}'")
        if len(equals_lt) > 30:
            print(f"  ... (+{len(equals_lt)-30} more)")
    else:
        print("\nNo target==lt cases detected.")

if __name__ == "__main__":
    main()
