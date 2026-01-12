/* =========================================================
   OpenKalba — app.js (v5.3.5b MULTI-LANG OVERLAYS + COPY)
   - Course Map with locked progression + topic/icon labels
   - Lesson engine (MCQ + type-in)
   - Speak button (Native MP3 first, fallback Web Speech)
   - Mikas emotion switching
   - Account button + Auth modal wiring (works with or without auth_ui.js)

   CHANGE (2026-01-08):
   - Home/Map copy no longer hardcodes Lithuanian; uses selected learnLang/nativeLang.
   - Native overlays affect UI display + gloss:
       - UI strings via overlays/<native>.json -> overlay.ui
       - Choice gloss via overlay.gloss (keeps grading canonical)
   - Choose grading is index-based when possible (overlay-safe), with fallback to canonical string match.
   - Fix: markChoiceButtons uses data-idx (was missing), and wrong highlight is index-safe.

   PATCH (2026-01-08):
   - questions[] can use direct per-question fields:
     prompt_uk / prompt_pl / ...
     choices_uk / choices_pl / ...
     uk / pl / mx / ... (translate source)
   - renderChoices stable order, index-based grading, dataset.idx always set
   - markChoiceButtons highlights via correctIndex and clicked canonical value

   PATCH (2026-01-08) (GLOSS):
   - glossT() now matches lowercase gloss keys
   - renderChoices() uses gloss when no native choices array exists

   PATCH (2026-01-08) (MIKAS BUBBLE):
   - Mikas bubble no longer hardcodes English (Nice/Streak use uiT)

   PATCH (2026-01-09) (PROGRESS PER LANGUAGE/JOURNEY):
   - Fixes cross-language progress bleed caused by fallback to old single-language LT keys.
   - Old-key fallback (lt_progress_v1 / lt_streak_v1 / lt_last_lesson_v1) now ONLY applies when learnLang === "lt".
   - lastLessonKey is now per journey (learnLang + nativeLang) to avoid "Continue" mixing.

   PATCH (2026-01-09) (PROMPT OVERRIDE):
   - Translate questions no longer display "Translate to Lithuanian" from copied lesson prompts.
   - UI forces: "Translate to <current learn language>" (Latvian/Russian/etc).
   ========================================================= */

"use strict";

/* -----------------------------
   Helpers
----------------------------- */
const el = (id) => document.getElementById(id);
const show = (node, yes = true) => {
  if (!node) return;
  node.style.display = yes ? "" : "none";
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function unique(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function safeStr(x) {
  return typeof x === "string" ? x : (x == null ? "" : String(x));
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAnswer(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”"]/g, '"')
    .replace(/[’]/g, "'");
}

/* Returns overlay key like "prompt_es", "choices_pl", etc */
function overlayKey(base, lang) {
  return `${base}_${lang}`;
}

function pickOverlay(obj, base, lang, fallback) {
  if (!obj || !lang) return fallback;
  const k = overlayKey(base, lang);
  if (Object.prototype.hasOwnProperty.call(obj, k)) {
    const v = obj[k];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") return v;
  }
  return fallback;
}

function flagFileForLang(code){
  const map = { en:"us", uk:"ua" }; // your filenames
  return map[code] || code;
}
function updateFlags(){
  if (DOM.nativeFlag) DOM.nativeFlag.src = `assets/flags/${flagFileForLang(nativeLang)}.svg`;
  if (DOM.learnFlag)  DOM.learnFlag.src  = `assets/flags/${flagFileForLang(learnLang)}.svg`;
}

/* -----------------------------
   SFX
----------------------------- */
const SFX = {
  correct: new Audio("audio/sfx/correct.wav"),
  wrong: new Audio("audio/sfx/wrong.mp3"),
  complete: new Audio("audio/sfx/level-complete.mp3"),
};

Object.values(SFX).forEach((a) => {
  a.preload = "auto";
  a.volume = 0.6;
});

function playSfx(name) {
  const a = SFX[name];
  if (!a) return;
  a.currentTime = 0;
  a.play().catch(() => {});
}

/* -----------------------------
   Storage keys
----------------------------- */
const LS = {
  // NOTE: now per-course/per-native
  progressBase: "ok_progress_v1",
  streakBase: "ok_streak_v1",
  lastLessonBase: "ok_last_lesson_v1",

  // old keys (migration)
  oldProgress: "lt_progress_v1",
  oldStreak: "lt_streak_v1",
  oldLastLesson: "lt_last_lesson_v1",

  user: "lt_user_v1",
  langSettings: "ok_lang_settings_v1",
};

let nativeLang = "en";
let learnLang = "lt";

function progressKey() {
  return `${LS.progressBase}_${learnLang}_${nativeLang}`;
}
function streakKey() {
  return `${LS.streakBase}_${learnLang}_${nativeLang}`;
}
function lastLessonKey() {
  // ✅ per journey (prevents Continue mixing across native)
  return `${LS.lastLessonBase}_${learnLang}_${nativeLang}`;
}

/* -----------------------------
   Language settings helpers
----------------------------- */
function loadLangSettings() {
  try {
    const raw = localStorage.getItem(LS.langSettings);
    const o = raw ? JSON.parse(raw) : null;
    const n = (o && typeof o.nativeLang === "string" && o.nativeLang) ? o.nativeLang : "en";
    const l = (o && typeof o.learnLang === "string" && o.learnLang) ? o.learnLang : "lt";
    return { nativeLang: n, learnLang: l };
  } catch {
    return { nativeLang: "en", learnLang: "lt" };
  }
}

function saveLangSettings(nativeLangArg, learnLangArg) {
  const safeNative = nativeLangArg || "en";
  const safeLearn = learnLangArg || "lt";
  localStorage.setItem(LS.langSettings, JSON.stringify({ nativeLang: safeNative, learnLang: safeLearn }));
}

/* -----------------------------
   Native audio manifest (MP3)
----------------------------- */
function getAudioManifestUrl() {
  return `courses/${learnLang}/audio/manifest.json`;
}

let ltAudioMap = null;   // { slug: "courses/<lang>/audio/<file>" }
let audioPlayer = null;  // HTMLAudioElement

function slugifyLt(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function loadLtAudioManifest(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const m = await res.json();
    return (m && typeof m === "object") ? m : null;
  } catch {
    return null;
  }
}

/* -----------------------------
   App state
----------------------------- */
let manifest = null;            // { lessons: [...] }
let lessonData = null;          // current lesson JSON
let lessonIndex = 0;            // index in manifest.lessons
let qIndex = 0;                 // question index
let streak = 0;
let progress = null;

let currentScreen = "home";     // home|lesson|map|done
let currentQuestion = null;     // active question object
let isAnswered = false;

let catalog = null;
let langNameMap = {};
let overlay = { ui: {}, gloss: {} }; // overlay for current (learnLang, nativeLang)

/* -----------------------------
   DOM refs (expected ids)
----------------------------- */
const DOM = {
  title: el("title"),
  prompt: el("prompt"),
  controls: {
    prevBtn: el("prevBtn"),
    speakBtn: el("speakBtn"),
    speakSlowBtn: el("speakSlowBtn"),
    mapBtn: el("mapBtn"),
    resetBtn: el("resetBtn"),
    accountBtn: el("accountBtn"),
    accountDot: el("accountDot"),
    accountBtnLabel: el("accountBtnLabel"),
  },
  screens: {
    home: el("screenHome"),
    lesson: el("screenLesson"),
    map: el("screenMap"),
    done: el("screenDone"),
  },

  // Home
  startBtn: el("startBtn"),
  continueBtn: el("continueBtn"),
  nativeLangSelect: el("nativeLangSelect"),
  learnLangSelect: el("learnLangSelect"),
  nativeFlag: el("nativeFlag"),
  learnFlag: el("learnFlag"),

  // Lesson UI
  lessonHeader: document.querySelector(".lessonHeader"),
  lessonPromptPretty: el("lessonPromptPretty"),
  answers: el("answers"),
  inputWrap: el("inputWrap"),
  input: el("answerInput"),
  checkBtn: el("checkBtn"),
  nextBtn: el("nextBtn"),
  feedback: el("feedback"),

  // Map
  mapWrap: el("mapWrap"),
  mapNodes: el("mapNodes"),
  mapSvg: el("mapSvg"),

  // Done
  doneTitle: el("doneTitle"),
  doneBody: el("doneBody"),
  doneBtn: el("doneBtn"),

  // Mikas
  mikasImg: el("mikasImg"),
  mikasBubble: el("mikasBubble"),

  // Auth modal
  authModal: el("authModal"),
};

/* -----------------------------
   Mikas emotion images
----------------------------- */
const MIKAS = {
  neutral: "mikas/neutral.png",
  thinking: "mikas/thinking.png",
  happy: "mikas/happy.png",
  sad: "mikas/sad.png",
  proud: "mikas/proud.png",
  celebrate: "mikas/celebrate.png",
};

function setMikas(emotion, bubbleText = "") {
  const src = MIKAS[emotion] || MIKAS.neutral;
  if (DOM.mikasImg) DOM.mikasImg.src = src;
  if (DOM.mikasBubble) {
    DOM.mikasBubble.textContent = bubbleText || "";
    DOM.mikasBubble.style.opacity = bubbleText ? "1" : "0";
    DOM.mikasBubble.style.display = bubbleText ? "block" : "none";
  }
}

/* -----------------------------
   Overlay loading + translate helpers
----------------------------- */
function overlayUrlFor(nativeLangArg, learnLangArg) {
  return `courses/${learnLangArg}/overlays/${nativeLangArg}.json`;
}

async function loadOverlay(nativeLangArg, learnLangArg) {
  overlay = { ui: {}, gloss: {} };
  const url = overlayUrlFor(nativeLangArg, learnLangArg);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return overlay;
    const j = await res.json();
    overlay = {
      ui: (j && typeof j.ui === "object" && j.ui) ? j.ui : {},
      gloss: (j && typeof j.gloss === "object" && j.gloss) ? j.gloss : {},
    };
    return overlay;
  } catch {
    return overlay;
  }
}

function uiT(s) {
  const k = String(s || "");
  return (overlay?.ui && overlay.ui[k]) ? overlay.ui[k] : k;
}

/* ✅ gloss keys are lowercase in your JSON */
function glossT(s) {
  const key = String(s || "").trim().toLowerCase();
  return (overlay?.gloss && overlay.gloss[key]) ? overlay.gloss[key] : String(s || "");
}

function applyUiOverlays() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = uiT(key);
  });
}

/* Apply overlay UI to fixed buttons/labels (so Spanish shows on buttons too) */
function applyStaticUiText() {
  // Controls
  if (DOM.controls.prevBtn) DOM.controls.prevBtn.textContent = uiT("back");
  if (DOM.controls.speakBtn) DOM.controls.speakBtn.textContent = `🔊 ${uiT("hear_it")}`;
  if (DOM.controls.speakSlowBtn) DOM.controls.speakSlowBtn.textContent = `🐢 ${uiT("hear_it_slow")}`;
  if (DOM.controls.mapBtn) DOM.controls.mapBtn.textContent = `🗺️ ${uiT("course_map")}`;
  if (DOM.controls.resetBtn) DOM.controls.resetBtn.textContent = uiT("restart_lesson");
  if (DOM.controls.accountBtnLabel) DOM.controls.accountBtnLabel.textContent = uiT("account");

  // Home buttons
  if (DOM.startBtn) DOM.startBtn.textContent = uiT("start");
  if (DOM.continueBtn) DOM.continueBtn.textContent = uiT("continue");

  // Lesson buttons
  if (DOM.checkBtn) DOM.checkBtn.textContent = uiT("check");
  if (DOM.nextBtn) DOM.nextBtn.textContent = uiT("next");

  // Done screen
  if (DOM.doneTitle) {
    const translated = uiT("complete_title");
    if (translated && translated !== "complete_title") DOM.doneTitle.textContent = translated;
  }
}

/* -----------------------------
   Progress (migration safe, per-lang)
----------------------------- */
function loadProgress() {
  // 1) new key (per journey)
  try {
    const raw = localStorage.getItem(progressKey());
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") {
        const ids = Array.isArray(p.completedLessonIds) ? p.completedLessonIds.filter(Boolean) : [];
        const best = p.best && typeof p.best === "object" ? p.best : {};
        return { completedLessonIds: ids, best };
      }
    }
  } catch {}

  // 2) fallback old key (single-language LT save) — ✅ ONLY for Lithuanian course
  if (learnLang === "lt") {
    try {
      const rawOld = localStorage.getItem(LS.oldProgress);
      if (!rawOld) return { completedLessonIds: [], best: {} };

      const p = JSON.parse(rawOld);
      if (!p || typeof p !== "object") return { completedLessonIds: [], best: {} };

      let ids =
        p.completedLessonIds ||
        p.completedLessonsIds ||
        p.completedLessons ||
        p.completedLessonsIds ||
        [];

      if (!Array.isArray(ids)) ids = [];
      ids = ids.map((x) => (typeof x === "string" ? x : (x && x.id ? x.id : ""))).filter(Boolean);

      const best = p.best && typeof p.best === "object" ? p.best : {};
      return { completedLessonIds: ids, best };
    } catch {
      return { completedLessonIds: [], best: {} };
    }
  }

  // 3) default for all other languages (no bleed)
  return { completedLessonIds: [], best: {} };
}

function saveProgress() {
  localStorage.setItem(progressKey(), JSON.stringify(progress));

  // ✅ keep writing legacy key ONLY for Lithuanian (optional but keeps old installs happy)
  if (learnLang === "lt") {
    try { localStorage.setItem(LS.oldProgress, JSON.stringify(progress)); } catch {}
  }
}

function isLessonCompleted(lessonId) {
  return progress.completedLessonIds.includes(lessonId);
}

function unlockIndex() {
  let maxUnlocked = 0;
  for (let i = 0; i < manifest.lessons.length; i++) {
    if (i === 0) {
      maxUnlocked = 0;
      continue;
    }
    const prevId = manifest.lessons[i - 1].id;
    if (isLessonCompleted(prevId)) maxUnlocked = i;
    else break;
  }
  return maxUnlocked;
}

/* -----------------------------
   Streak (per-lang, migration-safe)
----------------------------- */
function loadStreak() {
  const raw = localStorage.getItem(streakKey());
  if (raw != null) {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }

  // ✅ Old streak fallback ONLY for Lithuanian (prevents cross-language streak bleed)
  if (learnLang === "lt") {
    const old = localStorage.getItem(LS.oldStreak);
    if (old != null) {
      const n = parseInt(old, 10);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}
function saveStreak() {
  localStorage.setItem(streakKey(), String(streak));

  // ✅ legacy write only for Lithuanian
  if (learnLang === "lt") {
    try { localStorage.setItem(LS.oldStreak, String(streak)); } catch {}
  }
}

/* -----------------------------
   User/account (lightweight)
----------------------------- */
function getUser() {
  try {
    const raw = localStorage.getItem(LS.user);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function setUser(u) {
  localStorage.setItem(LS.user, JSON.stringify(u));
  refreshAccountDot();
}
function refreshAccountDot() {
  const u = getUser();
  if (DOM.controls.accountDot) DOM.controls.accountDot.style.opacity = u ? "1" : "0";
}

/* -----------------------------
   Screens
----------------------------- */
function setScreen(name) {
  currentScreen = name;
  if (DOM.screens.home) show(DOM.screens.home, name === "home");
  if (DOM.screens.lesson) show(DOM.screens.lesson, name === "lesson");
  if (DOM.screens.map) show(DOM.screens.map, name === "map");
  if (DOM.screens.done) show(DOM.screens.done, name === "done");
}

/* -----------------------------
   Catalog + selects
----------------------------- */
async function loadCatalog() {
  const res = await fetch("./courses/catalog.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load courses/catalog.json");
  const j = await res.json();
  if (!j || !Array.isArray(j.courses)) throw new Error("catalog.json missing courses[]");
  return j;
}

function buildLangNameMap(cat) {
  const map = {};
  for (const c of cat.courses) {
    if (c && c.code) map[c.code] = c.name || c.code.toUpperCase();
  }
  if (!map.en) map.en = "English";
  return map;
}

function langName(code) {
  return langNameMap[code] || (code ? code.toUpperCase() : "");
}

/* Course-aware native dropdown */
function populateLanguageSelects(cat) {
  const nameMap = buildLangNameMap(cat);

  // Find selected learn course
  const learnCourse = (cat.courses || []).find((c) => c.code === learnLang) || (cat.courses || [])[0];

  // Native options = English + overlays supported by selected learn course
  const nativeCodes = unique(["en", ...(learnCourse?.nativeOverlays || [])]);

  // Learn options = courses list (disable if not ready)
  const learnCourses = (cat.courses || []).slice();

  if (DOM.nativeLangSelect) {
    DOM.nativeLangSelect.innerHTML = "";
    for (const code of nativeCodes) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = nameMap[code] || code.toUpperCase();
      DOM.nativeLangSelect.appendChild(opt);
    }
  }

  if (DOM.learnLangSelect) {
    DOM.learnLangSelect.innerHTML = "";
    for (const c of learnCourses) {
      const opt = document.createElement("option");
      opt.value = c.code;
      opt.textContent = c.name || c.code.toUpperCase();
      if (!c.ready) opt.disabled = true;
      DOM.learnLangSelect.appendChild(opt);
    }
  }

  const saved = loadLangSettings();
  nativeLang = saved.nativeLang || "en";
  learnLang = saved.learnLang || (learnCourse?.code || "lt");

  const isLearnReady = learnCourses.some((c) => c.code === learnLang && c.ready);
  if (!isLearnReady) {
    const firstReady = learnCourses.find((c) => c.ready);
    learnLang = firstReady ? firstReady.code : (learnCourses[0]?.code || "lt");
  }

  const finalLearnCourse = learnCourses.find((c) => c.code === learnLang) || learnCourses[0];

  const allowedNative = unique(["en", ...(finalLearnCourse?.nativeOverlays || [])]);
  if (!allowedNative.includes(nativeLang)) nativeLang = "en";

  if (DOM.learnLangSelect) DOM.learnLangSelect.value = learnLang;
  if (DOM.nativeLangSelect) DOM.nativeLangSelect.value = nativeLang;

  saveLangSettings(nativeLang, learnLang);
  langNameMap = nameMap;
}

/* -----------------------------
   Manifest + lesson loading
----------------------------- */
async function loadManifest() {
  const res = await fetch(`./courses/${learnLang}/lessons/manifest.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load courses/${learnLang}/lessons/manifest.json`);

  const m = await res.json();
  if (!m || !Array.isArray(m.lessons) || m.lessons.length === 0) {
    throw new Error(`courses/${learnLang}/lessons/manifest.json missing lessons[]`);
  }

  m.lessons = m.lessons.map((x) => ({
    id: x.id,
    title: x.title || x.id,
    topic: x.topic || "",
    icon: x.icon || "",
    file: x.file || `courses/${learnLang}/lessons/${x.id}.json`,
  }));

  return m;
}

/* Normalize lesson:
   - supports {questions:[...]} or {items:[...]}
   - ensures choose questions get correctIndex when possible
*/
function normalizeLessonToQuestions(data) {
  if (!data || typeof data !== "object") return data;

  // If already questions, still ensure correctIndex exists when possible
  if (Array.isArray(data.questions) && data.questions.length > 0) {
    const qs = data.questions.map((q) => normalizeQuestion(q));
    return { ...data, questions: qs };
  }

  if (Array.isArray(data.items) && data.items.length > 0) {
    const questions = data.items.map((it) => {
      const type = it.type || "";

      if (type === "choose") {
        const choicesBase = Array.isArray(it.choices) ? it.choices.slice() : [];
        const idx = Number.isFinite(it.answerIndex) ? it.answerIndex : -1;

        const fallbackAnswer =
          (idx >= 0 && idx < choicesBase.length)
            ? choicesBase[idx]
            : (it.answer || it.correctAnswer || "");

        const promptBase = safeStr(it.prompt) || "Pick the correct meaning";
        const promptNative = safeStr(pickOverlay(it, "prompt", nativeLang, ""));

        const targetKey = getTargetKey();
        const targetText = safeStr(it?.[targetKey] || it.lt || "");

        const out = {
          type: "choose",
          prompt: promptBase,
          prompt_native: promptNative,

          // ✅ correct target key for the course
          [targetKey]: targetText,

          // optional: keep lt for old content fallback (harmless)
          lt: safeStr(it.lt || ""),

          choices: choicesBase,

          correctIndex: idx,
          correct: [fallbackAnswer].filter(Boolean),

          tts: it.tts || (targetText ? { lang: `${targetKey}-${targetKey.toUpperCase()}`, text: targetText } : ""),
        };

        return normalizeQuestion(out);
      }

      if (type === "translate") {
        const promptBase = safeStr(it.prompt) || "Translate to Lithuanian";
        const promptNative = safeStr(pickOverlay(it, "prompt", nativeLang, ""));

        const correctList = Array.isArray(it.answers)
          ? it.answers.slice()
          : (it.answer ? [it.answer] : []);

        const nativeText = safeStr(it[nativeLang] || it.en || "");
        const enText = safeStr(it.en || "");

        const targetKey = getTargetKey();
        const targetText = safeStr(it?.[targetKey] || it.lt || "");

        return normalizeQuestion({
          type: "translate",
          prompt: promptBase,
          prompt_native: promptNative,

          native: nativeText,
          en: enText,

          // ✅ correct target key for the course
          [targetKey]: targetText,

          // optional fallback
          lt: safeStr(it.lt || ""),

          correct: correctList.filter(Boolean),
          placeholder: "Type your answer…",

          tts: it.tts || (targetText ? { lang: `${targetKey}-${targetKey.toUpperCase()}`, text: targetText } : ""),
        });
      }

      return normalizeQuestion({
        type: type || "",
        prompt: safeStr(it.prompt || "Question"),
        prompt_native: safeStr(pickOverlay(it, "prompt", nativeLang, "")),
        lt: safeStr(it.lt || ""),
        en: safeStr(it.en || ""),
        native: safeStr(it[nativeLang] || it.en || ""),
        choices: Array.isArray(it.choices) ? it.choices.slice() : [],
        correct: Array.isArray(it.answers) ? it.answers.slice() : (it.answer ? [it.answer] : []),
        tts: it.tts || "",
      });
    });

    return { ...data, questions };
  }

  return data;
}

/* Ensure choose has correctIndex if possible */
function normalizeQuestion(q) {
  const out = { ...(q || {}) };
  const type = out.type || "";

  if (type === "choose") {
    const choices = Array.isArray(out.choices) ? out.choices : [];
    const correctArr = Array.isArray(out.correct) ? out.correct : [];

    if (!Number.isFinite(out.correctIndex) || out.correctIndex < 0) {
      const c0 = correctArr[0];
      if (typeof c0 === "string" && c0 && choices.length) {
        const idx = choices.findIndex((x) => normalizeAnswer(x) === normalizeAnswer(c0));
        if (idx >= 0) out.correctIndex = idx;
      }
    }
  }

  if (type === "translate") {
    if (!("native" in out)) out.native = safeStr(out[nativeLang] || out.en || "");
  }

  return out;
}

async function loadLessonByIndex(i) {
  lessonIndex = clamp(i, 0, manifest.lessons.length - 1);
  const meta = manifest.lessons[lessonIndex];

  const res = await fetch(meta.file, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${meta.file}`);

  let data = await res.json();
  data = normalizeLessonToQuestions(data);

  if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error(`Lesson ${meta.id} has no questions[] (or items[])`);
  }

  lessonData = data;
  qIndex = 0;
  streak = loadStreak();

  localStorage.setItem(lastLessonKey(), meta.id);

  // ✅ legacy last-lesson fallback ONLY for Lithuanian
  if (learnLang === "lt") {
    try { localStorage.setItem(LS.oldLastLesson, meta.id); } catch {}
  }

  return data;
}

/* -----------------------------
   Lesson rendering helpers
----------------------------- */
function setControlsForQuestion(hasPrev) {
  show(DOM.controls.prevBtn, hasPrev);
  show(DOM.controls.resetBtn, true);
  show(DOM.controls.mapBtn, true);

  if (DOM.controls.speakBtn) DOM.controls.speakBtn.style.display = "none";
  if (DOM.controls.speakSlowBtn) DOM.controls.speakSlowBtn.style.display = "none";
}

function getSpeakText(q) {
  if (!q) return "";
  if (q.tts && typeof q.tts === "object" && q.tts.text) return String(q.tts.text);
  if (typeof q.tts === "string" && q.tts.trim()) return q.tts;

  // ✅ course-aware target (ru/pl/lt/...)
  const target = getTargetText(q);
  if (target) return target;

  if (Array.isArray(q.correct) && q.correct[0]) return String(q.correct[0]);
  return "";
}

function ensureLessonHeaderVisible() {
  const header = document.querySelector(".lessonHeader");
  if (header) header.style.display = "block";
}

/* =========================================================
   PATCHED FUNCTIONS
========================================================= */

function getPromptForNative(q) {
  const direct = safeStr(q?.[overlayKey("prompt", nativeLang)] || "").trim();
  const pn = safeStr(q?.prompt_native || "").trim();
  if (direct) return direct;
  if (pn) return pn;
  return safeStr(q?.prompt || "");
}

/* ✅ PATCH: ONLY return native arrays if they truly exist (no fallback to canonical) */
function getChooseChoicesForNative(q) {
  // ONLY return native arrays if they truly exist.
  const direct = q?.[overlayKey("choices", nativeLang)];
  if (Array.isArray(direct) && direct.length) return direct;

  const cn = Array.isArray(q?.choices_native) ? q.choices_native : [];
  if (cn.length) return cn;

  // IMPORTANT: do NOT fallback to q.choices here
  return [];
}

function getTranslateSourceForNative(q) {
  const direct = safeStr(q?.[nativeLang] || "").trim();
  if (direct) return direct;

  const n = safeStr(q?.native || "").trim();
  if (n) return n;

  return safeStr(q?.en || "");
}

function getTargetKey() {
  return learnLang; // "lt", "ru", "pl", etc
}

function getTargetText(q) {
  const k = getTargetKey();
  // NEW way (correct)
  const v = safeStr(q?.[k] || "").trim();
  if (v) return v;

  // BACKCOMPAT (old Lithuanian-only lessons)
  const ltFallback = safeStr(q?.lt || "").trim();
  if (ltFallback) return ltFallback;

  return "";
}

/* ✅ PATCH: renderChoices uses native choices if present; else overlay gloss on canonical */
function renderChoices(q) {
  show(DOM.inputWrap, false);

  // canonical for grading (always)
  const canonical = Array.isArray(q.choices) ? q.choices.slice() : [];

  // true native choices only (choices_uk etc) — otherwise []
  const nativeChoices = getChooseChoicesForNative(q);
  const hasNativeChoices = nativeChoices.length === canonical.length && nativeChoices.length > 0;

  for (let i = 0; i < canonical.length; i++) {
    const b = document.createElement("button");
    b.className = "choice btn btn-ghost";

    b.dataset.value = canonical[i];
    b.dataset.idx = String(i);

    // If lesson provides choices_uk, use those.
    // Otherwise use overlay gloss on the canonical English token.
    b.textContent = hasNativeChoices
      ? String(nativeChoices[i])
      : glossT(canonical[i]);

    b.onclick = () => {
      if (isAnswered) return;
      checkAnswer({ userValue: b.dataset.value || "", userIndex: i });
    };

    DOM.answers.appendChild(b);
  }
}

/* Fix highlighting (index-safe) */
function markChoiceButtons({ userValue, wasCorrect }) {
  if (!DOM.answers) return;
  const btns = Array.from(DOM.answers.querySelectorAll("button.choice"));
  if (btns.length === 0) return;

  const q = currentQuestion;
  const ci = Number.isFinite(q.correctIndex) ? q.correctIndex : -1;

  for (const b of btns) {
    b.disabled = true;

    const idx = parseInt(b.dataset.idx || "-1", 10);
    if (idx === ci) b.classList.add("choice-correct");

    if (!wasCorrect) {
      if (normalizeAnswer(userValue) === normalizeAnswer(b.dataset.value)) {
        b.classList.add("choice-wrong");
      }
    }
  }
}

/* =========================================================
   END PATCHED FUNCTIONS
========================================================= */

function renderQuestion() {
  isAnswered = false;
  currentQuestion = lessonData.questions[qIndex];
  if (!currentQuestion) return;

  setControlsForQuestion(qIndex > 0);

  const meta = manifest.lessons[lessonIndex];

  if (DOM.title) {
    DOM.title.textContent = `${meta.icon ? meta.icon + " " : ""}${meta.title || ""}`.trim();
  }

  ensureLessonHeaderVisible();

  // In-card prompt
  if (DOM.lessonHeader && DOM.lessonPromptPretty) {
    show(DOM.lessonHeader, true);

    const type = currentQuestion.type || "";
    const promptText = uiT(getPromptForNative(currentQuestion));

    // ✅ FIX: Force translate prompt to current learn language (no LT hardcode)
    let promptTextFixed = promptText;
    if (type === "translate") {
      promptTextFixed = `Translate to ${langName(learnLang)}`;
    }

    let main = "";
    let sub = promptTextFixed;

    if (type === "choose") {
      main = getTargetText(currentQuestion);
    } else if (type === "translate") {
      main = getTranslateSourceForNative(currentQuestion);
    } else {
      main = safeStr(currentQuestion.lt || currentQuestion.en || "");
    }

    DOM.lessonPromptPretty.innerHTML = `
      <div class="lpMain">${escapeHtml(main)}</div>
      <div class="lpSub">${escapeHtml(sub)}</div>
    `.trim();
  }

  // Top prompt line
  const type = currentQuestion.type || "";
  const promptText = uiT(getPromptForNative(currentQuestion));

  // ✅ FIX: Force translate prompt to current learn language (no LT hardcode)
  let promptTextFixed = promptText;
  if (type === "translate") {
    promptTextFixed = `Translate to ${langName(learnLang)}`;
  }

  let line = promptTextFixed;

  if (type === "choose") {
    const tgt = getTargetText(currentQuestion).trim();
    line = tgt ? `${tgt} — ${promptTextFixed}` : promptTextFixed;
  } else if (type === "translate") {
    const src = getTranslateSourceForNative(currentQuestion).trim();
    line = src ? `${src} — ${promptTextFixed}` : promptTextFixed;
  }

  if (DOM.prompt) DOM.prompt.textContent = line;

  if (DOM.feedback) DOM.feedback.textContent = "";
  show(DOM.nextBtn, false);

  // Voice buttons
  const speakText = getSpeakText(currentQuestion);

  if (DOM.controls.speakBtn) {
    if (speakText) {
      DOM.controls.speakBtn.style.display = "";
      DOM.controls.speakBtn.onclick = () => speakTarget(speakText, false);
    } else {
      DOM.controls.speakBtn.style.display = "none";
      DOM.controls.speakBtn.onclick = null;
    }
  }

  if (DOM.controls.speakSlowBtn) {
    if (speakText) {
      DOM.controls.speakSlowBtn.style.display = "";
      DOM.controls.speakSlowBtn.onclick = () => speakTarget(speakText, true);
    } else {
      DOM.controls.speakSlowBtn.style.display = "none";
      DOM.controls.speakSlowBtn.onclick = null;
    }
  }

  setMikas("neutral");

  if (DOM.answers) DOM.answers.className = "choices";
  if (DOM.answers) DOM.answers.innerHTML = "";
  show(DOM.inputWrap, false);

  /* ✅ IMPORTANT with new getChooseChoicesForNative(): use canonical choices to decide */
  const hasChoices = (type === "choose") && Array.isArray(currentQuestion.choices) && currentQuestion.choices.length > 0;

  if (hasChoices) renderChoices(currentQuestion);
  else renderTextInput(currentQuestion);
}

function renderTextInput(q) {
  show(DOM.inputWrap, true);

  if (DOM.input) {
    DOM.input.value = "";
    DOM.input.placeholder = q.placeholder || uiT("Type your answer…");
    DOM.input.oninput = () => {
      if (!isAnswered) setMikas("thinking");
    };
    DOM.input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!isAnswered) checkAnswer({ userValue: (DOM.input.value || "").trim(), userIndex: null });
      }
    };
  }

  if (DOM.checkBtn) {
    DOM.checkBtn.onclick = () => {
      if (isAnswered) return;
      checkAnswer({ userValue: (DOM.input?.value || "").trim(), userIndex: null });
    };
  }
}

function setFeedback(text, kind) {
  if (!DOM.feedback) return;
  DOM.feedback.textContent = text;
  DOM.feedback.className =
    "feedback " + (kind === "ok" ? "feedback-ok" : kind === "bad" ? "feedback-bad" : "");
}

function checkAnswer({ userValue, userIndex }) {
  isAnswered = true;

  const q = currentQuestion;
  const type = q.type || "";

  let ok = false;
  let showCorrect = "";
  let correctIndex = Number.isFinite(q.correctIndex) ? q.correctIndex : -1;

  if (type === "choose") {
    // Prefer index compare
    if (correctIndex >= 0 && Number.isFinite(userIndex)) {
      ok = (userIndex === correctIndex);
    } else {
      // fallback: compare canonical strings
      const correctArr = Array.isArray(q.correct) ? q.correct : [];
      const userN = normalizeAnswer(userValue);
      const correctList = correctArr.map(normalizeAnswer);
      ok = correctList.includes(userN);

      // try infer correctIndex for highlighting
      if (correctIndex < 0 && Array.isArray(q.choices) && correctArr[0]) {
        const idx = q.choices.findIndex((x) => normalizeAnswer(x) === normalizeAnswer(correctArr[0]));
        if (idx >= 0) correctIndex = idx;
      }
    }

    // show correct label in UI language:
    // if we have native choices in-question, use those; otherwise show canonical
    const canonicalChoices = Array.isArray(q.choices) ? q.choices : [];
    const nativeChoices = getChooseChoicesForNative(q);

    if (correctIndex >= 0 && correctIndex < canonicalChoices.length) {
      if (nativeChoices.length === canonicalChoices.length && nativeChoices.length) {
        showCorrect = String(nativeChoices[correctIndex] || "");
      } else {
        showCorrect = String(canonicalChoices[correctIndex] || "");
      }
    }
  } else {
    const correct =
      Array.isArray(q.correct)
        ? q.correct
        : (q.answer != null ? [q.answer] : (q.correctAnswer != null ? [q.correctAnswer] : []));

    const userN = normalizeAnswer(userValue);
    const correctList = correct.map(normalizeAnswer);
    ok = correctList.includes(userN);
    showCorrect = correct[0] != null ? String(correct[0]) : "";
  }

  if (ok) {
    playSfx("correct");

    streak += 1;
    saveStreak();

    /* ✅ PATCH: stop hardcoding English in Mikas bubble */
    if (streak === 5 || streak === 10 || streak === 15) {
      setMikas("proud", `🔥 ${uiT("Streak")} ${streak}!`);
    } else {
      setMikas("happy", streak >= 2 ? `${uiT("Nice!")} 🔥${streak}` : uiT("Nice!"));
    }

    setFeedback("✅ " + uiT("Correct!"), "ok");
    markChoiceButtons({ userValue, wasCorrect: true });
  } else {
    playSfx("wrong");

    streak = 0;
    saveStreak();

    setMikas("sad", uiT("Oops…"));

    setFeedback(`❌ ${uiT("Not quite.")}${showCorrect ? " " + uiT("Answer:") + " " + showCorrect : ""}`, "bad");
    markChoiceButtons({ userValue, wasCorrect: false });
  }

  show(DOM.nextBtn, true);
  if (DOM.nextBtn) DOM.nextBtn.onclick = () => nextQuestion();
}

/* -----------------------------
   Next / prev / reset
----------------------------- */
function prevQuestion() {
  if (qIndex <= 0) return;
  qIndex -= 1;
  renderQuestion();
}
function nextQuestion() {
  if (qIndex < lessonData.questions.length - 1) {
    qIndex += 1;
    renderQuestion();
    return;
  }
  onLessonComplete();
}
function resetLesson() {
  qIndex = 0;
  streak = 0;
  saveStreak();
  renderQuestion();
}

/* -----------------------------
   Lesson complete
----------------------------- */
function onLessonComplete() {
  const meta = manifest.lessons[lessonIndex];

  if (!isLessonCompleted(meta.id)) {
    progress.completedLessonIds.push(meta.id);
  }
  saveProgress();

  playSfx("complete");

  setMikas("celebrate", uiT("Lesson complete!"));
  setScreen("done");

  if (DOM.doneTitle) DOM.doneTitle.textContent = uiT("complete_title");
  if (DOM.doneBody) {
    const nextMeta = manifest.lessons[clamp(lessonIndex + 1, 0, manifest.lessons.length - 1)];
    DOM.doneBody.textContent =
      lessonIndex < manifest.lessons.length - 1
        ? `${uiT("complete_body_next")} ${nextMeta.icon ? nextMeta.icon + " " : ""}${nextMeta.title}`
        : uiT("complete_body_done");
  }

  if (DOM.doneBtn) {
    DOM.doneBtn.onclick = () => {
      setScreen("map");
      renderMap();
    };
  }
}

/* -----------------------------
   Map rendering
----------------------------- */
function setControlsForMap() {
  show(DOM.controls.prevBtn, false);
  show(DOM.controls.resetBtn, false);
  show(DOM.controls.mapBtn, false);
  if (DOM.controls.speakBtn) DOM.controls.speakBtn.style.display = "none";
  if (DOM.controls.speakSlowBtn) DOM.controls.speakSlowBtn.style.display = "none";
}

function renderMap() {
  setControlsForMap();

  if (DOM.title) DOM.title.textContent = `${langName(learnLang)} ${uiT("course_map")}`;

  const baseMapLine = "Tap a node to play. 🔒 lessons unlock in order.";
  const line = uiT(baseMapLine);
  if (DOM.prompt) DOM.prompt.textContent = line;

  setScreen("map");

  const wrap = DOM.mapWrap;
  const nodesEl = DOM.mapNodes;
  const svg = DOM.mapSvg;
  if (!wrap || !nodesEl || !svg) return;

  nodesEl.innerHTML = "";
  svg.innerHTML = "";

  svg.style.pointerEvents = "none";

  const W = Math.max(320, wrap.clientWidth);
  const topPad = 40;
  const stepY = 86;
  const nodeR = 35;

  const lessonCount = manifest.lessons.length;
  const H = topPad * 2 + (lessonCount - 1) * stepY + 120;

  svg.style.height = `${H}px`;
  nodesEl.style.height = `${H}px`;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const xs = [
    Math.round(W * 0.30),
    Math.round(W * 0.70),
    Math.round(W * 0.35),
    Math.round(W * 0.65),
  ];

  const maxUnlocked = unlockIndex();

  for (let i = 0; i < lessonCount - 1; i++) {
    const x1 = xs[i % xs.length];
    const y1 = topPad + i * stepY;
    const x2 = xs[(i + 1) % xs.length];
    const y2 = topPad + (i + 1) * stepY;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const midY = (y1 + y2) / 2;
    path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-width", "6");

    const unlockedEdge = i < maxUnlocked;
    path.setAttribute("stroke", unlockedEdge ? "currentColor" : "rgba(0,0,0,0.12)");
    path.setAttribute("opacity", unlockedEdge ? "0.35" : "0.18");
    svg.appendChild(path);
  }

  for (let i = 0; i < lessonCount; i++) {
    const meta = manifest.lessons[i];
    const x = xs[i % xs.length];
    const y = topPad + i * stepY;

    const unlocked = i === 0 || (i <= maxUnlocked);
    const completed = isLessonCompleted(meta.id);

    const btn = document.createElement("button");
    btn.className = "mapNode";
    btn.dataset.idx = String(i);
    btn.style.left = `${x - nodeR}px`;
    btn.style.top = `${y - nodeR}px`;
    btn.style.width = `${nodeR * 2}px`;
    btn.style.height = `${nodeR * 2}px`;

    const icon = meta.icon || (completed ? "✅" : unlocked ? "▶️" : "🔒");
    btn.innerHTML = `<div class="mapNodeInner">
        <div class="mapNodeIcon">${icon}</div>
        <div class="mapNodeNum">${i + 1}</div>
      </div>`;

    if (!unlocked) {
      btn.disabled = true;
      btn.classList.add("mapNode-locked");
    }
    if (completed) btn.classList.add("mapNode-done");

    const label = document.createElement("div");
    label.className = "mapLabel";
    const topicText = meta.topic ? ` — ${meta.topic}` : "";
    label.textContent = `${meta.title}${topicText}`;
    label.style.left = `${x}px`;
    label.style.top = `${y + nodeR + 10}px`;
    label.style.transform = "translateX(-50%)";
    label.style.opacity = unlocked ? "0.92" : "0.35";

    nodesEl.appendChild(btn);
    nodesEl.appendChild(label);
  }

  nodesEl.onclick = async (e) => {
    const btn = e.target.closest?.("button.mapNode");
    if (!btn || btn.disabled) return;
    const idx = parseInt(btn.dataset.idx || "-1", 10);
    if (!Number.isFinite(idx) || idx < 0) return;
    await startLesson(idx);
  };
}

/* -----------------------------
   Start/continue logic
----------------------------- */
async function startLesson(i) {
  try {
    await loadLessonByIndex(i);
    setScreen("lesson");
    renderQuestion();
  } catch (err) {
    console.error(err);
    alert(String(err?.message || "Lesson data is missing or failed to load."));
  }
}

async function startFromContinue() {
  // ✅ per journey key
  const lastId = localStorage.getItem(lastLessonKey())
    // legacy fallback ONLY for Lithuanian
    || (learnLang === "lt" ? localStorage.getItem(LS.oldLastLesson) : null);

  if (!lastId) return startLesson(0);

  const idx = manifest.lessons.findIndex((l) => l.id === lastId);
  return startLesson(idx >= 0 ? idx : 0);
}

/* -----------------------------
   Speak (Native MP3 first, fallback Web Speech)
----------------------------- */
function speakTarget(text, slow = false) {
  try {
    const raw = String(text || "").trim();
    if (!raw) return;

    // 1) Native MP3 (only if course has audio)
    const key = slugifyLt(raw);
    const src = ltAudioMap && (ltAudioMap[key] || ltAudioMap[raw]);

    if (src) {
      if (!audioPlayer) audioPlayer = new Audio();
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
      audioPlayer.src = src;
      audioPlayer.playbackRate = slow ? 0.85 : 1.0;
      audioPlayer.play().catch(() => {});
      return;
    }

    // 2) Web Speech fallback — USE LEARN LANGUAGE
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(raw);

    // 🔑 language map
    const langMap = {
      lt: "lt-LT",
      ru: "ru-RU",
      pl: "pl-PL",
      uk: "uk-UA",
      et: "et-EE",
      lv: "lv-LV",
      is: "is-IS",
      fr: "fr-FR",
      fi: "fi-FI",
      se: "sv-SE",
      no: "nb-NO",
      de: "de-DE",
      mx: "es-ES",
      en: "en-US"
    };

    u.lang = langMap[learnLang] || "en-US";
    u.rate = slow ? 0.85 : 0.95;

    const voices = window.speechSynthesis.getVoices?.() || [];
    const match = voices.find(v =>
      (v.lang || "").toLowerCase().startsWith(u.lang.split("-")[0])
    );
    if (match) u.voice = match;

    window.speechSynthesis.speak(u);
  } catch {
    // silent fail
  }
}


/* -----------------------------
   Auth modal wiring
----------------------------- */
function openAuth() {
  if (window.AuthUI && typeof window.AuthUI.open === "function") {
    window.AuthUI.open();
    return;
  }

  if (!DOM.authModal) return;

  DOM.authModal.style.display = "";
  DOM.authModal.setAttribute("aria-hidden", "false");

  const backdrop = DOM.authModal.querySelector(".modal-backdrop");
  const closeBtns = DOM.authModal.querySelectorAll("[data-close='1'], .modal-close");

  const close = () => {
    DOM.authModal.style.display = "none";
    DOM.authModal.setAttribute("aria-hidden", "true");
  };

  if (backdrop) backdrop.onclick = close;
  closeBtns.forEach((b) => (b.onclick = close));
}

/* -----------------------------
   Home copy (no Lithuanian hardcode)
----------------------------- */
function setHomeCopy() {
  if (DOM.title) DOM.title.textContent = "OpenKalba";

  if (DOM.prompt) {
    DOM.prompt.textContent = `Native: ${langName(nativeLang)} • Learning: ${langName(learnLang)}`;
  }

  const kicker = document.querySelector(".homeKicker");
  if (kicker) kicker.textContent = "OpenKalba";

  const mapTitle = document.querySelector(".map-title");
  if (mapTitle) mapTitle.textContent = uiT("course_map") || "Course Map";
}

/* -----------------------------
   Events / init
----------------------------- */
function wireEvents() {
  if (DOM.controls.prevBtn) DOM.controls.prevBtn.onclick = () => prevQuestion();
  if (DOM.controls.mapBtn) DOM.controls.mapBtn.onclick = () => {
    setScreen("map");
    renderMap();
  };
  if (DOM.controls.resetBtn) DOM.controls.resetBtn.onclick = () => resetLesson();

  if (DOM.controls.accountBtn) {
    if (!(window.AuthUI && typeof window.AuthUI.open === "function")) {
      DOM.controls.accountBtn.onclick = () => openAuth();
    }
  }

  if (DOM.startBtn) DOM.startBtn.onclick = () => startLesson(0);
  if (DOM.continueBtn) DOM.continueBtn.onclick = () => startFromContinue();

  // Native change: reload overlay + refresh text
  if (DOM.nativeLangSelect) {
    DOM.nativeLangSelect.onchange = async () => {
      nativeLang = DOM.nativeLangSelect.value || "en";
      updateFlags();
      saveLangSettings(nativeLang, learnLang);

      await loadOverlay(nativeLang, learnLang);
      applyUiOverlays();

      if (DOM.controls.speakSlowBtn) DOM.controls.speakSlowBtn.textContent = `🐢 ${uiT("hear_it_slow")}`;
      if (DOM.controls.speakBtn) DOM.controls.speakBtn.textContent = `🔊 ${uiT("hear_it")}`;

      applyStaticUiText();

      progress = loadProgress();
      streak = loadStreak();

      if (lessonData) lessonData = normalizeLessonToQuestions(lessonData);

      if (currentScreen === "lesson") renderQuestion();
      if (currentScreen === "map") renderMap();
      setHomeCopy();
    };
  }

  // Learn change: repopulate selects (course-aware) + reload manifest/audio/overlay
  if (DOM.learnLangSelect) {
    DOM.learnLangSelect.onchange = async () => {
      learnLang = DOM.learnLangSelect.value || "lt";
      updateFlags();
      saveLangSettings(nativeLang, learnLang);

      if (catalog) populateLanguageSelects(catalog);

      progress = loadProgress();
      streak = loadStreak();

      manifest = await loadManifest();
      ltAudioMap = await loadLtAudioManifest(getAudioManifestUrl());

      await loadOverlay(nativeLang, learnLang);
      applyUiOverlays();

      if (DOM.controls.speakSlowBtn) DOM.controls.speakSlowBtn.textContent = `🐢 ${uiT("hear_it_slow")}`;
      if (DOM.controls.speakBtn) DOM.controls.speakBtn.textContent = `🔊 ${uiT("hear_it")}`;

      applyStaticUiText();

      setHomeCopy();
      setScreen("map");
      renderMap();
    };
  }

  if (DOM.doneBtn) DOM.doneBtn.onclick = () => {
    setScreen("map");
    renderMap();
  };

  window.addEventListener("resize", () => {
    if (currentScreen === "map") renderMap();
  });
}

async function init() {
  try {
    const saved = loadLangSettings();
    nativeLang = saved.nativeLang || "en";
    learnLang = saved.learnLang || "lt";

    catalog = await loadCatalog();
    populateLanguageSelects(catalog);
    updateFlags();

    await loadOverlay(nativeLang, learnLang);
    applyUiOverlays();

    if (DOM.controls.speakSlowBtn) DOM.controls.speakSlowBtn.textContent = `🐢 ${uiT("hear_it_slow")}`;
    if (DOM.controls.speakBtn) DOM.controls.speakBtn.textContent = `🔊 ${uiT("hear_it")}`;

    applyStaticUiText();

    progress = loadProgress();
    streak = loadStreak();

    manifest = await loadManifest();

    ltAudioMap = await loadLtAudioManifest(getAudioManifestUrl());

    refreshAccountDot();
    wireEvents();

    setScreen("home");
    setHomeCopy();

    if ("speechSynthesis" in window) {
      await sleep(50);
      window.speechSynthesis.getVoices?.();
    }

    if (!DOM.screens.home && DOM.screens.map) {
      setScreen("map");
      renderMap();
    }
  } catch (err) {
    console.error(err);
    if (DOM.title) DOM.title.textContent = "Error";
    if (DOM.prompt) DOM.prompt.textContent = String(err?.message || err);
  }
}

init();
