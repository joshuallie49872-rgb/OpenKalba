import json
import shutil
import datetime
from pathlib import Path

UI_PATH = Path("i18n/ui.json")
BACKUP = UI_PATH.with_suffix(UI_PATH.suffix + ".bak_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S"))

langs = ["pt", "hi", "bn", "ur"]
overlay_paths = {c: Path(f"courses/lt/overlays/{c}.json") for c in langs}

# Map i18n key -> overlay phrase key
phrase_map = {
    "pick_correct_meaning": "Pick the correct meaning",
    "type_your_answer": "Type your answer…",
}

translate_to_template = {
    "pt": "Traduzir para {lang}",
    "hi": "{lang} में अनुवाद करें",
    "bn": "{lang} এ অনুবাদ করুন",
    "ur": "{lang} میں ترجمہ کریں",
}

if not UI_PATH.exists():
    raise SystemExit(f"Missing: {UI_PATH}")

# backup
shutil.copy2(UI_PATH, BACKUP)
print(f"Backup created: {BACKUP}")

ui = json.load(open(UI_PATH, encoding="utf-8"))
en = ui.get("en", {})
if not isinstance(en, dict) or not en:
    raise SystemExit("i18n/ui.json missing or empty 'en' block")

for c in langs:
    if c not in ui or not isinstance(ui.get(c), dict):
        ui[c] = {}

    # copy schema from English so every key exists
    for k, v in en.items():
        ui[c].setdefault(k, v)

    # pull translations from LT overlay ui
    op = overlay_paths[c]
    if not op.exists():
        raise SystemExit(f"Missing overlay: {op}")

    o = json.load(open(op, encoding="utf-8"))
    ou = o.get("ui", {})

    # phrase-mapped keys
    for i18n_key, overlay_phrase in phrase_map.items():
        if overlay_phrase in ou and isinstance(ou[overlay_phrase], str) and ou[overlay_phrase].strip():
            ui[c][i18n_key] = ou[overlay_phrase]

    # translate_to as template (kept explicit)
    ui[c]["translate_to"] = translate_to_template[c]

json.dump(ui, open(UI_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("Patched i18n/ui.json with:", ", ".join(langs))
