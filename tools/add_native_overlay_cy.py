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
        cy_path = os.path.join(overlays_dir, "cy.json")

        if not os.path.exists(en_path):
            skipped += 1
            continue
        if os.path.exists(cy_path):
            continue

        shutil.copy2(en_path, cy_path)
        made += 1

    print(f"✅ Created cy.json overlays in {made} courses. Skipped {skipped} courses (no en.json).")

if __name__ == "__main__":
    main()
