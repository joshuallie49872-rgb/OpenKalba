import os, json, glob, argparse

def looks_mojibake(s: str) -> bool:
    # common mojibake markers when UTF-8 got mangled
    return any(x in s for x in ["Ã", "Ä", "Å", "Â", "\u0081", "\u0091", "\u0092", "\u0093", "\u0094"])

def try_fix_mojibake(s: str) -> str:
    # Best-effort: if string contains mojibake markers, try latin1->utf8 roundtrip
    if not isinstance(s, str) or not s:
        return s
    if not looks_mojibake(s):
        return s

    # attempt 1: latin1 -> utf8
    try:
        b = s.encode("latin-1", errors="ignore")
        s2 = b.decode("utf-8", errors="ignore")
        # keep fix only if it reduces mojibake markers and keeps some content
        if s2 and (not looks_mojibake(s2)) and (len(s2) >= max(1, len(s) // 3)):
            return s2
    except Exception:
        pass

    # attempt 2: cp1252 -> utf8
    try:
        b = s.encode("cp1252", errors="ignore")
        s2 = b.decode("utf-8", errors="ignore")
        if s2 and (not looks_mojibake(s2)) and (len(s2) >= max(1, len(s) // 3)):
            return s2
    except Exception:
        pass

    return s

def walk_fix(obj):
    touched = 0
    if isinstance(obj, str):
        fixed = try_fix_mojibake(obj)
        return fixed, (1 if fixed != obj else 0)

    if isinstance(obj, list):
        out = []
        for x in obj:
            fx, t = walk_fix(x)
            out.append(fx)
            touched += t
        return out, touched

    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            fk, tk = walk_fix(k) if isinstance(k, str) else (k, 0)
            fv, tv = walk_fix(v)
            out[fk] = fv
            touched += tk + tv
        return out, touched

    return obj, 0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True, help="course code like lv, et, uk, etc")
    args = ap.parse_args()

    target = args.target.strip()
    base = os.path.join("courses", target, "lessons")
    files = sorted(glob.glob(os.path.join(base, "*.json")))

    if not files:
        raise SystemExit(f"No lesson json files found in: {base}")

    total_files = 0
    total_touched = 0

    for p in files:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)

        fixed, touched = walk_fix(data)
        if touched:
            with open(p, "w", encoding="utf-8", newline="\n") as f:
                json.dump(fixed, f, ensure_ascii=False, indent=2)
                f.write("\n")
            total_files += 1
            total_touched += touched

    print(f"target={target}")
    print(f"files_scanned={len(files)}")
    print(f"files_modified={total_files}")
    print(f"strings_fixed={total_touched}")

if __name__ == "__main__":
    main()
