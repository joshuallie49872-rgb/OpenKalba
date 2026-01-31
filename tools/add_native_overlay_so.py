import os, shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
COURSES_DIR = os.path.join(ROOT, "courses")

def main():
    made = 0
    skipped = 0

    for code in os.listdir(COURSES_DIR):
        overlays_dir = os.path.join(COURSES_DIR, code, "overlays")
        if not os.path.isdir(overlays_dir):
            continue

        en_path = os.path.join(overlays_dir, "en.json")
        so_path = os.path.join(overlays_dir, "so.json")

        if not os.path.exists(en_path):
            # if your project uses a different base overlay name, swap it here
            skipped += 1
            continue

        if os.path.exists(so_path):
            # already exists
            continue

        shutil.copy2(en_path, so_path)
        made += 1

    print(f"✅ Created so.json overlays in {made} courses. Skipped {skipped} courses (no en.json found).")

if __name__ == "__main__":
    main()
