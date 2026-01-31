import os
import json
import shutil

BASE = "courses"

def main():
    created = 0
    skipped = 0

    for course in os.listdir(BASE):
        overlay_dir = os.path.join(BASE, course, "overlays")
        en_path = os.path.join(overlay_dir, "en.json")
        gd_path = os.path.join(overlay_dir, "gd.json")

        if not os.path.exists(en_path):
            skipped += 1
            continue

        if os.path.exists(gd_path):
            skipped += 1
            continue

        shutil.copy(en_path, gd_path)
        created += 1

    print(f"✅ Created gd.json overlays in {created} courses. Skipped {skipped} courses.")

if __name__ == "__main__":
    main()
