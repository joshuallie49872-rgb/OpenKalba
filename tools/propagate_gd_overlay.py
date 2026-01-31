import os, shutil, sys

COURSES_DIR = "courses"
SRC = os.path.join("courses", "lt", "overlays", "gd.json")  # source of truth

def main():
    if not os.path.exists(SRC):
        print(f"❌ Source file not found: {SRC}")
        sys.exit(1)

    copied = 0
    skipped = 0

    for course in os.listdir(COURSES_DIR):
        overlays_dir = os.path.join(COURSES_DIR, course, "overlays")
        en_path = os.path.join(overlays_dir, "en.json")
        gd_path = os.path.join(overlays_dir, "gd.json")

        if not os.path.exists(en_path):
            skipped += 1
            continue

        # 🔒 Skip copying onto itself
        if os.path.abspath(gd_path) == os.path.abspath(SRC):
            skipped += 1
            continue

        os.makedirs(overlays_dir, exist_ok=True)
        shutil.copyfile(SRC, gd_path)
        copied += 1

    print(f"✅ Copied gd.json into {copied} courses. Skipped {skipped} courses.")

if __name__ == "__main__":
    main()
