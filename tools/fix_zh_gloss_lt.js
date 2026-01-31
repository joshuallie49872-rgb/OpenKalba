/**
 * tools/fix_zh_gloss_lt.js
 *
 * Scans courses/lt/lessons/*.json, collects all "meaning strings" (mostly English)
 * that appear in:
 *  - choose: choices[]
 *  - translate: source text (q.native/q.en or q[nativeLang]) if you want it (optional)
 *
 * Compares against courses/lt/overlays/zh.json -> gloss
 * Outputs:
 *  - tools/zh_missing_gloss_lt.txt  (list of missing keys)
 *  - tools/zh_overlay_lt_UPDATED.json (overlay with missing keys stubbed)
 *
 * NOTE: This does NOT auto-translate. It prepares the keys so you can translate.
 */

const fs = require("fs");
const path = require("path");

const LEARN_LANG = "lt";
const NATIVE_LANG = "zh";

const LESSONS_DIR = path.join("courses", LEARN_LANG, "lessons");
const OVERLAY_PATH = path.join("courses", LEARN_LANG, "overlays", `${NATIVE_LANG}.json`);

const OUT_MISSING_TXT = path.join("tools", `zh_missing_gloss_${LEARN_LANG}.txt`);
const OUT_UPDATED_JSON = path.join("tools", `zh_overlay_${LEARN_LANG}_UPDATED.json`);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeText(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, "utf8");
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}
function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

// IMPORTANT: must match app.js glossT() behavior: lowercased keys
function glossKey(s) {
  return String(s || "").trim().toLowerCase();
}

// Heuristic: ignore empty/too short noise; keep normal strings
function shouldKeep(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  // ignore pure numbers or 1-char
  if (/^\d+$/.test(t)) return false;
  if (t.length <= 1) return false;
  return true;
}

function listLessonFiles(dir) {
  if (!fs.existsSync(dir)) throw new Error(`Missing lessons dir: ${dir}`);
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .map((f) => path.join(dir, f));
}

function normalizeLesson(data) {
  // matches your app’s normalizeLessonToQuestions style: questions[] or items[]
  if (!isObject(data)) return { questions: [] };

  if (Array.isArray(data.questions)) return { questions: data.questions };
  if (Array.isArray(data.items)) return { questions: data.items };
  return { questions: [] };
}

function collectMeaningStringsFromQuestion(q) {
  const out = [];

  if (!isObject(q)) return out;
  const type = String(q.type || "").toLowerCase();

  // ✅ CHOOSE: meanings are in choices[] (canonical English meanings)
  if (type === "choose") {
    if (Array.isArray(q.choices)) {
      for (const c of q.choices) {
        if (typeof c === "string" && shouldKeep(c)) out.push(c);
      }
    }
    // Sometimes people stash gloss-like strings elsewhere; keep conservative.
    return out;
  }

  // ✅ TRANSLATE: you normally show "source" as native/en, not gloss.
  // BUT: Some lessons may put English chunks in fields used as prompt/choices.
  // We keep this optional: if translate has a "native" or "en" that is English
  // and you want Chinese display for it, you'd do it elsewhere, not gloss.
  // So we do NOTHING here by default.
  return out;
}

function main() {
  // Load overlay (or create)
  let overlay = { ui: {}, gloss: {} };
  if (fs.existsSync(OVERLAY_PATH)) {
    const j = readJson(OVERLAY_PATH);
    overlay.ui = isObject(j.ui) ? j.ui : {};
    overlay.gloss = isObject(j.gloss) ? j.gloss : {};
  } else {
    console.warn(`Overlay not found, will create: ${OVERLAY_PATH}`);
  }

  // Existing gloss keys
  const existing = new Set(Object.keys(overlay.gloss || {}).map((k) => glossKey(k)));

  // Scan lessons
  const files = listLessonFiles(LESSONS_DIR);
  const needed = new Map(); // keyLower -> originalExample

  for (const file of files) {
    let data;
    try {
      data = readJson(file);
    } catch (e) {
      console.warn(`Skipping unreadable JSON: ${file}`);
      continue;
    }

    const { questions } = normalizeLesson(data);
    for (const q of questions) {
      const strings = collectMeaningStringsFromQuestion(q);
      for (const s of strings) {
        const k = glossKey(s);
        if (!k) continue;
        if (!needed.has(k)) needed.set(k, s);
      }
    }
  }

  // Missing = needed - existing
  const missingKeys = [...needed.keys()].filter((k) => !existing.has(k)).sort();

  // Output list for translation
  const lines = missingKeys.map((k) => needed.get(k));
  writeText(
    OUT_MISSING_TXT,
    lines.length
      ? lines.join("\n") + "\n"
      : "(none)\n"
  );

  // Build updated overlay with stub entries
  const updated = {
    ui: overlay.ui || {},
    gloss: { ...(overlay.gloss || {}) },
  };

  // Add missing stubs as empty string (so it’s obvious what needs translation)
  for (const kLower of missingKeys) {
    const example = needed.get(kLower);
    // Store with LOWERCASE key to match glossT()
    const keyToStore = glossKey(example);
    if (!(keyToStore in updated.gloss)) {
      updated.gloss[keyToStore] = "";
    }
  }

  writeJson(OUT_UPDATED_JSON, updated);

  console.log(`\nDONE (${LEARN_LANG} / ${NATIVE_LANG})`);
  console.log(`Lessons scanned: ${files.length}`);
  console.log(`Needed gloss entries: ${needed.size}`);
  console.log(`Missing gloss entries: ${missingKeys.length}`);
  console.log(`\nWrote: ${OUT_MISSING_TXT}`);
  console.log(`Wrote: ${OUT_UPDATED_JSON}`);
  console.log(`\nNext: translate the keys in ${OUT_UPDATED_JSON} (empty values) and then replace:`);
  console.log(`  ${OVERLAY_PATH}`);
}

main();
