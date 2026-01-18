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

   PATCH (2026-01-13) (HOME BTN + HELPER TOGGLE + CUSTOM LANG MODAL):
   - Adds Home button visibility rules (home hidden on home, shown on map/lesson)
   - Adds Mikas helper toggle w/ preference (hidden on small screens by default)
   - Adds custom language picker modal (native/learn) with flags + coming soon badges

   PATCH (2026-01-13) (START vs CONTINUE AUTO TOGGLE):
   - Hides Start when returning user has progress; shows Continue instead.

   PATCH (2026-01-14) (LESSON PROGRESS BAR WIRING):
   - Adds DOM refs for lesson progress elements
   - Adds setLessonProgressUI()
   - Updates progress each renderQuestion() + resetLesson()

   FIX (2026-01-14) (HELPER TOGGLE PREF CONSISTENCY):
   - One source of truth: reads/writes BOTH "mikas_hidden" and LS.helperHidden
   - applyHelperVisibility also sets aria-hidden to match state
   - toggle click uses applyHelperVisibility() so UI never desyncs
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

function stripMinorPunct(s) {
  return (s || "")
    .replace(/[.,!?;:]/g, "")
    .replace(/[()\[\]{}]/g, "")
    .replace(/[\/\\]/g, " ")
    .replace(/[–—]/g, "-");
}

function removeDiacritics(s) {
  try {
    return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  } catch {
    return s || "";
  }
}

function normalizeStrictAnswer(s) {
  // strict = keep diacritics, but ignore case/spacing/punct
  return normalizeAnswer(stripMinorPunct(s));
}

function normalizeLooseAnswer(s) {
  // loose = strict + diacritics removed
  return normalizeAnswer(removeDiacritics(stripMinorPunct(s)));
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

function flagFileForLang(code) {
  const map = { en: "us", uk: "ua" }; // your filenames
  return map[code] || code;
}

/* ✅ single source of truth for flag src */
function flagSrc(code) {
  const c = String(code || "en").toLowerCase();
  return `assets/flags/${flagFileForLang(c)}.svg`;
}

function getCharSetForLang(code) {
  const map = {
    lt: ["ą","č","ę","ė","į","š","ų","ū","ž"],
    pl: ["ą","ć","ę","ł","ń","ó","ś","ź","ż"],
    lv: ["ā","č","ē","ģ","ī","ķ","ļ","ņ","š","ū","ž"],
    et: ["ä","ö","õ","ü"],
    fr: ["à","â","ç","é","è","ê","ë","î","ï","ô","ù","û","ü","ÿ"],
    de: ["ä","ö","ü","ß"],
    is: ["á","ð","é","í","ó","ú","ý","þ","æ","ö"],
    es: ["á","é","í","ñ","ó","ú","ü","¿","¡"],
    fi: ["ä","ö"],
    se: ["å","ä","ö"],
    no: ["å","æ","ø"],
    uk: ["а","б","в","г","ґ","д","е","є","ж","з","и","і","ї","й","к","л","м","н","о","п","р","с","т","у","ф","х","ц","ч","ш","щ","ь","ю","я"],
    ru: ["а","б","в","г","д","е","ё","ж","з","и","й","к","л","м","н","о","п","р","с","т","у","ф","х","ц","ч","ш","щ","ъ","ы","ь","э","ю","я"],
  };
  return map[code] || [];
}

function updateFlags() {
  if (DOM.nativeFlag) DOM.nativeFlag.src = flagSrc(nativeLang);
  if (DOM.learnFlag) DOM.learnFlag.src = flagSrc(learnLang);
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

  // helper hide/show preference
  helperHidden: "ok_helper_hidden_v1",
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
  // per journey (prevents Continue mixing across native)
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

let lessonRun = null; // per-lesson scoring

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

    trophyBtn: el("trophyBtn"),

    homeBtn: el("homeBtn"),
    helperToggleBtn: el("helperToggleBtn"),
    helperToggleText: el("helperToggleText"),

    accountBtn: el("accountBtn"),
    accountDot: el("accountDot"),
    accountBtnLabel: el("accountBtnLabel"),
  },

  // ✅ top-level aliases for patches (safe)
  helperToggleBtn: el("helperToggleBtn"),
  helperToggleText: el("helperToggleText"),
  helperToggleIcon: el("helperToggleIcon"),

  screens: {
    home: el("screenHome"),
    lesson: el("screenLesson"),
    map: el("screenMap"),
    done: el("screenDone"),
    achievements: el("screenAchievements"),
  },

  // Home
  startBtn: el("startBtn"),
  continueBtn: el("continueBtn"),
  nativeLangSelect: el("nativeLangSelect"),
  learnLangSelect: el("learnLangSelect"),
  nativeFlag: el("nativeFlag"),
  learnFlag: el("learnFlag"),

  // Home (custom pickers)
  nativeLangBtn: el("nativeLangBtn"),
  learnLangBtn: el("learnLangBtn"),
  nativeLangLabel: el("nativeLangLabel"),
  learnLangLabel: el("learnLangLabel"),

  // Language modal
  langModal: el("langModal"),
  langModalTitle: el("langModalTitle"),
  langModalSub: el("langModalSub"),
  langModalClose: el("langModalClose"),
  langList: el("langList"),

  // Lesson UI
  lessonHeader: document.querySelector(".lessonHeader"),
  lessonPromptPretty: el("lessonPromptPretty"),
  answers: el("answers"),
  inputWrap: el("inputWrap"),
  input: el("answerInput"),
  charBar: el("charBar"),
  checkBtn: el("checkBtn"),
  nextBtn: el("nextBtn"),
  feedback: el("feedback"),

  // ✅ Lesson progress UI (NEW)
  lessonProgress: el("lessonProgress"),
  lessonProgressFill: el("lessonProgressFill"),
  lessonProgressText: el("lessonProgressText"),

  // Map
  mapWrap: el("mapWrap"),
  mapNodes: el("mapNodes"),
  mapSvg: el("mapSvg"),

  // Achievements (map panel + screen)
  achPanel: el("achievementsPanel"),
  achTotalXp: el("achTotalXp"),
  achCourseXp: el("achCourseXp"),
  achCourseList: el("achCourseList"),
  achBadges: el("achBadges"),
  achCloseBtn: el("achCloseBtn"),

  achTotalXp2: el("achTotalXp2"),
  achJourneyXp2: el("achJourneyXp2"),
  achCourseList2: el("achCourseList2"),
  achBadges2: el("achBadges2"),

  // Done
  doneTitle: el("doneTitle"),
  doneBody: el("doneBody"),
  doneBtn: el("doneBtn"),

  // Mikas
  mikasImg: el("mikasImg"),
  mikasBubble: el("mikasBubble"),

  // Mikas dock wrapper
  mikasDock: el("mikasDock"),

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

/* gloss keys are lowercase in your JSON */
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

/* helper: set text into .btnText if present (preserves icon-only markup) */
function setBtnLabel(btn, text) {
  if (!btn) return;
  const t = btn.querySelector(".btnText");
  if (t) t.textContent = text;
  else btn.textContent = text;
}

/* Apply overlay UI to fixed buttons/labels (so Spanish shows on buttons too) */
function applyStaticUiText() {
  // Controls
  if (DOM.controls.prevBtn) setBtnLabel(DOM.controls.prevBtn, uiT("back"));
  if (DOM.controls.speakBtn) setBtnLabel(DOM.controls.speakBtn, uiT("hear_it"));
  if (DOM.controls.speakSlowBtn) setBtnLabel(DOM.controls.speakSlowBtn, uiT("hear_it_slow"));
  if (DOM.controls.mapBtn) setBtnLabel(DOM.controls.mapBtn, uiT("course_map"));
  if (DOM.controls.resetBtn) setBtnLabel(DOM.controls.resetBtn, uiT("restart_lesson"));
  if (DOM.controls.accountBtnLabel) DOM.controls.accountBtnLabel.textContent = uiT("account");

  // Home buttons
  if (DOM.startBtn) setBtnLabel(DOM.startBtn, uiT("start"));
  if (DOM.continueBtn) setBtnLabel(DOM.continueBtn, uiT("continue"));

  // Lesson buttons
  if (DOM.checkBtn) setBtnLabel(DOM.checkBtn, uiT("check"));
  if (DOM.nextBtn) setBtnLabel(DOM.nextBtn, uiT("next"));

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
        return { completedLessonIds: ids, best, xpTotal: Number(p.xpTotal||0) };
      }
    }
  } catch {}

  // 2) fallback old key (single-language LT save) — ONLY for Lithuanian course
  if (learnLang === "lt") {
    try {
      const rawOld = localStorage.getItem(LS.oldProgress);
      if (!rawOld) return { completedLessonIds: [], best: {}, xpTotal: 0 };

      const p = JSON.parse(rawOld);
      if (!p || typeof p !== "object") return { completedLessonIds: [], best: {}, xpTotal: 0 };

      let ids =
        p.completedLessonIds ||
        p.completedLessonsIds ||
        p.completedLessons ||
        p.completedLessonsIds ||
        [];

      if (!Array.isArray(ids)) ids = [];
      ids = ids.map((x) => (typeof x === "string" ? x : (x && x.id ? x.id : ""))).filter(Boolean);

      const best = p.best && typeof p.best === "object" ? p.best : {};
      return { completedLessonIds: ids, best, xpTotal: Number(p.xpTotal||0) };
    } catch {
      return { completedLessonIds: [], best: {}, xpTotal: 0 };
    }
  }

  // 3) default for all other languages (no bleed)
  return { completedLessonIds: [], best: {}, xpTotal: 0 };
}

function saveProgress() {
  localStorage.setItem(progressKey(), JSON.stringify(progress));

  // keep writing legacy key ONLY for Lithuanian (optional but keeps old installs happy)
  if (learnLang === "lt") {
    try { localStorage.setItem(LS.oldProgress, JSON.stringify(progress)); } catch {}
  }
}


/* -----------------------------
   Global XP + achievements meta (across courses)
----------------------------- */
const GLOBAL_META_KEY = "openkalba_global_meta_v1";

function loadGlobalMeta() {
  try {
    const raw = localStorage.getItem(GLOBAL_META_KEY);
    if (!raw) return { xpByCourse: {}, lessonsCompletedByCourse: {}, repeatsByCourse: {}, xpByPair: {}, lessonsCompletedByPair: {}, repeatsByPair: {} };
    const j = JSON.parse(raw);
    return {
      xpByCourse: (j && typeof j.xpByCourse === "object" && j.xpByCourse) ? j.xpByCourse : {},
      lessonsCompletedByCourse: (j && typeof j.lessonsCompletedByCourse === "object" && j.lessonsCompletedByCourse) ? j.lessonsCompletedByCourse : {},
      repeatsByCourse: (j && typeof j.repeatsByCourse === "object" && j.repeatsByCourse) ? j.repeatsByCourse : {},
      xpByPair: (j && typeof j.xpByPair === "object" && j.xpByPair) ? j.xpByPair : {},
      lessonsCompletedByPair: (j && typeof j.lessonsCompletedByPair === "object" && j.lessonsCompletedByPair) ? j.lessonsCompletedByPair : {},
      repeatsByPair: (j && typeof j.repeatsByPair === "object" && j.repeatsByPair) ? j.repeatsByPair : {},
    };
  } catch {
    return { xpByCourse: {}, lessonsCompletedByCourse: {}, repeatsByCourse: {}, xpByPair: {}, lessonsCompletedByPair: {}, repeatsByPair: {} };
  }
}

function saveGlobalMeta(meta) {
  try { localStorage.setItem(GLOBAL_META_KEY, JSON.stringify(meta)); } catch {}
}

function totalGlobalXp(meta) {
  const m = (meta && meta.xpByPair && Object.keys(meta.xpByPair).length) ? meta.xpByPair : (meta && meta.xpByCourse ? meta.xpByCourse : {});
  let t = 0;
  for (const k of Object.keys(m)) t += Number(m[k] || 0);
  return t;
}

function computeBadgesForCourse(courseCode, meta) {
  const done = Number((meta.lessonsCompletedByCourse || {})[courseCode] || 0);
  const xp = Number((meta.xpByCourse || {})[courseCode] || 0);
  const reps = Number((meta.repeatsByCourse || {})[courseCode] || 0);

  const badges = [];
  if (xp > 0) badges.push("First Course Started");
  if (done >= 10) badges.push("10 Lessons Completed");
  if (done >= 50) badges.push("50 Lessons Completed");
  if (reps >= 1) badges.push("Retry badge");
  return badges;
}

function computeBadgesForPair(pairKey, meta) {
  const done = Number((meta.lessonsCompletedByPair || {})[pairKey] || 0);
  const xp = Number((meta.xpByPair || {})[pairKey] || 0);
  const reps = Number((meta.repeatsByPair || {})[pairKey] || 0);

  const badges = [];
  if (xp > 0) badges.push("First Course Started");
  if (done >= 10) badges.push("10 Lessons Completed");
  if (done >= 50) badges.push("50 Lessons Completed");
  if (reps >= 1) badges.push("Retry badge");
  return badges;
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

  // Old streak fallback ONLY for Lithuanian (prevents cross-language streak bleed)
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

  // legacy write only for Lithuanian
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
   Home button + Helper toggle + Custom language modal helpers
----------------------------- */
function isSmallScreen() {
  return window.matchMedia && window.matchMedia("(max-width: 560px)").matches;
}

function homeLangShortLabel(code) {
  // Default to full language name.
  // If the home pill runs out of space on smaller screens, we will swap to 2-letter codes
  // *only for the side(s) that actually overflow*.
  return langName(code);
}

// ✅ Home pill overflow handling:
// Keep full names unless the text would collide/clip, then swap that side to 2-letter code.
function applyHomePillFit() {
  if (!DOM?.prompt) return;
  const root = DOM.prompt.querySelector(".promptMeta--home");
  if (!root) return;

  const items = Array.from(root.querySelectorAll(".homeLangItem"));
  if (!items.length) return;

  items.forEach((item) => {
    const txt = item.querySelector(".homeLangText");
    if (!txt) return;
    const full = txt.getAttribute("data-full") || txt.textContent || "";
    const code = txt.getAttribute("data-code") || "";

    // Reset to full first
    txt.textContent = full;

    // If it overflows (ellipsized), swap to 2-letter code
    // Use a rAF so layout settles (fonts/images loaded).
    requestAnimationFrame(() => {
      try {
        const overflow = txt.scrollWidth > txt.clientWidth + 1;
        if (overflow && code) txt.textContent = String(code).toUpperCase();
      } catch {}
    });
  });
}

/* ✅ unified read of helper pref */
function getHelperHiddenPref() {
  // Prefer "mikas_hidden" (new key) if present
  try {
    const mk = localStorage.getItem("mikas_hidden");
    if (mk === "1" || mk === "0") return mk === "1";
  } catch {}

  // Fallback to LS.helperHidden
  try {
    const raw = localStorage.getItem(LS.helperHidden);
    if (raw === "1" || raw === "0") return raw === "1";
  } catch {}

  // default: hidden on small screens, visible on desktop
  return isSmallScreen();
}

/* ✅ unified write of helper pref */
function setHelperHiddenPref(hidden) {
  try { localStorage.setItem("mikas_hidden", hidden ? "1" : "0"); } catch {}
  try { localStorage.setItem(LS.helperHidden, hidden ? "1" : "0"); } catch {}
}

function updateHelperToggleIcon(isHidden) {
  // isHidden=true means Mikas is OFF -> show mikas_off icon
  if (!DOM?.helperToggleIcon) return;
  DOM.helperToggleIcon.src = isHidden ? "assets/icons/mikas_off.png" : "assets/icons/mikas_on.png";
}

function applyHelperVisibility(hidden) {
  // Hide/show Mikas dock + keep aria-hidden consistent
  if (DOM.mikasDock) {
    DOM.mikasDock.style.display = hidden ? "none" : "";
    DOM.mikasDock.setAttribute("aria-hidden", hidden ? "true" : "false");
  }

  // Update button icon + label (legacy emoji icon)
  if (DOM.controls.helperToggleBtn) {
    const icon = DOM.controls.helperToggleBtn.querySelector(".btnIcon");
    if (icon) icon.textContent = hidden ? "👀" : "🙈"; // show vs hide
  }

  // Keep the new image icon in sync
  updateHelperToggleIcon(hidden);

  // Label (desktop)
  if (DOM.controls.helperToggleText) {
    DOM.controls.helperToggleText.textContent = hidden ? uiT("Show") : uiT("Hide");
  }
  if (DOM.helperToggleText) {
    DOM.helperToggleText.textContent = hidden ? uiT("Show") : uiT("Hide");
  }
}

/* =========================================================
   PATCH 1 — Viewport + icon-only helpers (above init())
========================================================= */
function isNarrowMobile() {
  return window.matchMedia && window.matchMedia("(max-width: 560px)").matches;
}

function applyControlsIconOnlyMode() {
  const controls = document.querySelector(".controls");
  if (!controls) return;

  // Add/remove a class so CSS can center properly in icon-only mode
  controls.classList.toggle("iconOnly", isNarrowMobile());
}

function setBtnTextVisible(btn, visible) {
  if (!btn) return;
  const t = btn.querySelector(".btnText");
  if (t) t.style.display = visible ? "" : "none";
}

function updateControlsForViewport() {
  applyControlsIconOnlyMode();

  const iconOnly = isNarrowMobile();

  // Hide button text on mobile *even if CSS fails/gets overridden*
  setBtnTextVisible(DOM?.controls?.speakBtn, !iconOnly);
  setBtnTextVisible(DOM?.controls?.speakSlowBtn, !iconOnly);
  setBtnTextVisible(DOM?.controls?.mapBtn, !iconOnly);
  setBtnTextVisible(DOM?.controls?.homeBtn, !iconOnly);
  setBtnTextVisible(DOM?.controls?.helperToggleBtn, !iconOnly);
  setBtnTextVisible(DOM?.controls?.accountBtn, !iconOnly);
  setBtnTextVisible(DOM?.controls?.prevBtn, !iconOnly); // doesn’t matter if you hide prev anyway
}

/* =========================================================
   Custom language modal wiring (copy/paste blocks)
========================================================= */
let langPickerKind = "native"; // "native" | "learn"

function openLangModal(kind) {
  langPickerKind = kind;

  if (!DOM.langModal || !DOM.langList) return;

  const isNative = (kind === "native");
  const selectEl = isNative ? DOM.nativeLangSelect : DOM.learnLangSelect;

  if (!selectEl) return;

  if (DOM.langModalTitle) DOM.langModalTitle.textContent = isNative ? uiT("i_speak") : uiT("i_want_to_learn");
  if (DOM.langModalSub) DOM.langModalSub.textContent = isNative ? uiT("Pick your native language") : uiT("Pick a course");

  // Build list from the REAL <select> options (so disabled/ready logic stays correct)
  DOM.langList.innerHTML = "";
  [...selectEl.options].forEach((opt) => {
    const code = opt.value;
    const name = opt.textContent || code.toUpperCase();
    const disabled = !!opt.disabled;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "langItem";
    btn.setAttribute("aria-disabled", disabled ? "true" : "false");
    btn.disabled = disabled;

    btn.innerHTML = `
      <img class="flagIcon" src="${flagSrc(code)}" alt="" aria-hidden="true" />
      <span class="langName">${escapeHtml(name)}</span>
      
    `;

    btn.onclick = () => {
      // update select -> trigger existing onchange logic
      selectEl.value = code;
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      closeLangModal();
    };

    DOM.langList.appendChild(btn);
  });

  DOM.langModal.style.display = "flex";
  DOM.langModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeLangModal() {
  if (!DOM.langModal) return;
  DOM.langModal.style.display = "none";
  DOM.langModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function syncLangPickButtons() {
  // keep the pretty buttons in sync with current selects
  if (DOM.nativeLangLabel) DOM.nativeLangLabel.textContent = langName(nativeLang);
  if (DOM.learnLangLabel) DOM.learnLangLabel.textContent = langName(learnLang);

  if (DOM.nativeFlag) DOM.nativeFlag.src = flagSrc(nativeLang);
  if (DOM.learnFlag) DOM.learnFlag.src = flagSrc(learnLang);
}

/* (compat helper used elsewhere) */
function updateLangPickerLabels() {
  syncLangPickButtons();
}

/* ✅ FIXED: hide Map + Mikas toggle ONLY on Home */
function setControlsForHome() {
  // Home page should NOT show Back or Home
  show(DOM.controls.prevBtn, false);
  show(DOM.controls.homeBtn, false);

  // Speak buttons only matter in lesson
  if (DOM.controls.speakBtn) DOM.controls.speakBtn.style.display = "none";
  if (DOM.controls.speakSlowBtn) DOM.controls.speakSlowBtn.style.display = "none";

  // Hide Map on Home
  show(DOM.controls.mapBtn, false);

  // Hide helper toggle on Home ONLY
  show(DOM.controls.helperToggleBtn, false);

  // Hide Achievements button on Home
  if (DOM.controls.trophyBtn) show(DOM.controls.trophyBtn, false);

  // Account still allowed
  show(DOM.controls.accountBtn, true);

  updateControlsForViewport();
}

function setControlsForAchievements() {
  // Achievements screen behaves like a “page”
  show(DOM.controls.prevBtn, false);
  show(DOM.controls.mapBtn, true);
  show(DOM.controls.homeBtn, true);
  show(DOM.controls.resetBtn, false);
  show(DOM.controls.helperToggleBtn, false);
  // Trophy button is only for Course Map entry
  if (DOM.controls.trophyBtn) show(DOM.controls.trophyBtn, false);
  show(DOM.controls.accountBtn, true);

  if (DOM.controls.speakBtn) DOM.controls.speakBtn.style.display = "none";
  if (DOM.controls.speakSlowBtn) DOM.controls.speakSlowBtn.style.display = "none";

  updateControlsForViewport();
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
  if (DOM.screens.achievements) show(DOM.screens.achievements, name === "achievements");

  // Controls behavior by screen
  if (name === "home") setControlsForHome();
  if (name === "lesson") show(DOM.controls.homeBtn, true);
  if (name === "map") show(DOM.controls.homeBtn, true);
  if (name === "achievements") setControlsForAchievements();
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

  // All-to-all pairing (native <-> learning): any language can be native OR learning.
  // Only constraint: you cannot pick the same language for both.

  const courses = (cat && Array.isArray(cat.courses)) ? cat.courses.slice() : [];
  const courseByCode = new Map(courses.map((c) => [c.code, c]));

  // Ensure English exists as a selectable target (even if not built yet)
  if (!courseByCode.has("en")) {
    courses.unshift({ code: "en", name: "English", ready: false, nativeOverlays: [] });
    courseByCode.set("en", courses[0]);
  }

  const allCodes = unique(["en", ...courses.map((c) => c.code)]);

  // Load saved selections first (so filtering respects user's current choice)
  const saved = loadLangSettings();
  nativeLang = (saved.nativeLang && allCodes.includes(saved.nativeLang)) ? saved.nativeLang : "en";
  learnLang = (saved.learnLang && allCodes.includes(saved.learnLang)) ? saved.learnLang : (courses.find((c) => c.ready)?.code || courses[0]?.code || "lt");

  // Enforce "cannot be the same" by nudging learnLang off nativeLang when necessary
  if (learnLang === nativeLang) {
    const alt = allCodes.find((c) => c !== nativeLang && (courseByCode.get(c)?.ready || c === "en"));
    learnLang = alt || learnLang;
  }

  // Build native options
  if (DOM.nativeLangSelect) {
    DOM.nativeLangSelect.innerHTML = "";
    for (const code of allCodes) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = nameMap[code] || code.toUpperCase();
      // Disallow selecting same as learn
      if (code === learnLang) opt.disabled = true;
      DOM.nativeLangSelect.appendChild(opt);
    }
  }

  // Build learning options
  if (DOM.learnLangSelect) {
    DOM.learnLangSelect.innerHTML = "";
    for (const code of allCodes) {
      const c = courseByCode.get(code) || { code, name: nameMap[code] || code.toUpperCase(), ready: false };
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = c.name || nameMap[code] || code.toUpperCase();
      // Disallow selecting same as native
      if (code === nativeLang) opt.disabled = true;
      // If course isn't ready, keep it selectable but disabled (shows "coming soon" in your custom modal)
      if (c.ready === false) opt.disabled = true;
      DOM.learnLangSelect.appendChild(opt);
    }
  }

  // Final sanity: if selected learn isn't ready, fall back to first ready
  const selCourse = courseByCode.get(learnLang);
  if (!selCourse || selCourse.ready === false) {
    const firstReady = courses.find((c) => c.ready);
    if (firstReady) learnLang = firstReady.code;
  }

  // Re-enforce "cannot be the same" after fallback
  if (learnLang === nativeLang) {
    const alt = courses.find((c) => c.code !== nativeLang && c.ready);
    learnLang = alt ? alt.code : learnLang;
  }

  if (DOM.learnLangSelect) DOM.learnLangSelect.value = learnLang;
  if (DOM.nativeLangSelect) DOM.nativeLangSelect.value = nativeLang;

  saveLangSettings(nativeLang, learnLang);
  langNameMap = nameMap;

  // sync visible labels + flags after selects are populated
  updateLangPickerLabels();
  updateFlags();
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

          // correct target key for the course
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

          // correct target key for the course
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

  lessonRun = { total: (data.questions || []).length, answered: 0, wrong: 0, strictPerfect: 0 };

  localStorage.setItem(lastLessonKey(), meta.id);

  // legacy last-lesson fallback ONLY for Lithuanian
  if (learnLang === "lt") {
    try { localStorage.setItem(LS.oldLastLesson, meta.id); } catch {}
  }

  return data;
}

/* -----------------------------
   Lesson rendering helpers
----------------------------- */
function setControlsForQuestion(hasPrev) {
  // You do NOT want backtracking (XP anti-cheat), so ALWAYS hide Back.
  show(DOM.controls.prevBtn, false);

  // If you still have a reset/restart button in your DOM refs, keep it;
  // otherwise this line is harmless if DOM.controls.resetBtn is undefined.
  show(DOM.controls.resetBtn, true);

  // Map button in lesson is OK
  show(DOM.controls.mapBtn, true);

  // Home button should be visible in lesson
  show(DOM.controls.homeBtn, true);

  // ✅ FIX: helper toggle should be visible in lesson (NOT home)
  show(DOM.controls.helperToggleBtn, true);

  // Account should be visible
  show(DOM.controls.accountBtn, true);

  if (DOM.controls.trophyBtn) show(DOM.controls.trophyBtn, false);

  // Enforce icon-only behavior on mobile every question render
  updateControlsForViewport();
}

/* ✅ NEW: lesson progress updater (question-by-question) */
function setLessonProgressUI(currentIndex, totalCount) {
  const wrap = DOM.lessonProgress;
  const fill = DOM.lessonProgressFill;
  const text = DOM.lessonProgressText;

  if (!wrap || !fill) return;

  const total = Math.max(1, Number(totalCount || 1));
  const cur = clamp(Number(currentIndex || 0), 0, total);

  // "Question 1 of N" shows progress immediately
  const pct = clamp((cur / total) * 100, 0, 100);

  fill.style.width = pct.toFixed(0) + "%";
  //if (text) text.textContent = `${pct.toFixed(0)}%`;
}

function getSpeakText(q) {
  if (!q) return "";

  // explicit tts override always wins
  if (q.tts && typeof q.tts === "object" && q.tts.text) return String(q.tts.text);
  if (typeof q.tts === "string" && q.tts.trim()) return q.tts.trim();

  // course-aware target (ru/pl/lt/...)
  const target = safeStr(getTargetText(q) || "").trim();
  if (target) return target;

  // fallback (older format)
  if (Array.isArray(q.correct) && q.correct[0]) return String(q.correct[0]);

  return "";
}

function updateSpeakControlsForQuestion(q) {
  const text = getSpeakText(q);

  // no text => hide both
  if (!text) {
    if (DOM.controls.speakBtn) DOM.controls.speakBtn.style.display = "none";
    if (DOM.controls.speakSlowBtn) DOM.controls.speakSlowBtn.style.display = "none";
    return;
  }

  // show both buttons
  if (DOM.controls.speakBtn) DOM.controls.speakBtn.style.display = "";
  if (DOM.controls.speakSlowBtn) DOM.controls.speakSlowBtn.style.display = "";

  // wire clicks
  if (DOM.controls.speakBtn) {
    DOM.controls.speakBtn.onclick = () => speakTarget(text, false);
  }
  if (DOM.controls.speakSlowBtn) {
    DOM.controls.speakSlowBtn.onclick = () => speakTarget(text, true);
  }
}

function ensureLessonHeaderVisible() {
  // prefer cached DOM ref if you have it, fallback to querySelector
  const header = DOM.lessonHeader || document.querySelector(".lessonHeader");
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

/* ONLY return native arrays if they truly exist (no fallback to canonical) */
function getChooseChoicesForNative(q) {
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

/* -----------------------------
   Target text helpers
----------------------------- */
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

/* renderChoices uses native choices if present; else overlay gloss on canonical */
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

function renderQuestion() {
  isAnswered = false;
  currentQuestion = lessonData.questions[qIndex];
  if (!currentQuestion) return;

  // ✅ update lesson progress bar (Question-based)
  setLessonProgressUI(qIndex + 1, lessonData.questions.length);

  // Keep speak controls in sync for this question
  updateSpeakControlsForQuestion(currentQuestion);

  // Lock lesson navigation: no Back during lessons
  if (DOM.controls.prevBtn) DOM.controls.prevBtn.style.display = "none";

  const meta = manifest.lessons[lessonIndex] || {};

  // Title (keeps your existing behavior)
  if (DOM.title) {
    DOM.title.textContent = `${meta.icon ? meta.icon + " " : ""}${meta.title || ""}`.trim();
  }

  ensureLessonHeaderVisible();

  // ✅ Top pill should be COURSE CONTEXT (not the question)
  // Example: 🇱🇹 Lithuanian — Basics 1
  if (DOM.prompt) {
    const lang = langName(learnLang);
    const courseTitle = meta.title || "";
    DOM.prompt.innerHTML = `
      <span class="promptPill">
        <img class="promptFlag" src="${flagSrc(learnLang)}" alt="" aria-hidden="true">
        <span>${escapeHtml(`${lang}${courseTitle ? " — " + courseTitle : ""}`)}</span>
      </span>
    `.trim();
  }

  // In-card prompt (question itself)
  if (DOM.lessonHeader && DOM.lessonPromptPretty) {
    show(DOM.lessonHeader, true);

    const type = currentQuestion.type || "";
    const promptText = uiT(getPromptForNative(currentQuestion));

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

  if (DOM.feedback) DOM.feedback.textContent = "";
  show(DOM.nextBtn, false);

  setMikas("neutral");

  if (DOM.answers) DOM.answers.className = "choices";
  if (DOM.answers) DOM.answers.innerHTML = "";
  show(DOM.inputWrap, false);

  const type = currentQuestion.type || "";
  const hasChoices =
    (type === "choose") &&
    Array.isArray(currentQuestion.choices) &&
    currentQuestion.choices.length > 0;

  if (hasChoices) renderChoices(currentQuestion);
  else renderTextInput(currentQuestion);

  // ✅ ensure controls (icon-only + centering) are correct every question
  setControlsForQuestion(false);
}

function renderTextInput(q) {
  // show language-specific special characters (typing help)
  const chars = getCharSetForLang(learnLang);
  if (DOM.charBar) {
    if (chars && chars.length) {
      DOM.charBar.style.display = "flex";
      DOM.charBar.innerHTML = chars.map(ch => `<button type="button" class="charKey">${escapeHtml(ch)}</button>`).join("");
      DOM.charBar.onclick = (e) => {
        const b = e.target.closest?.("button.charKey");
        if (!b || !DOM.input) return;
        const ch = b.textContent || "";
        const start = DOM.input.selectionStart ?? DOM.input.value.length;
        const end = DOM.input.selectionEnd ?? DOM.input.value.length;
        const v = DOM.input.value || "";
        DOM.input.value = v.slice(0, start) + ch + v.slice(end);
        const pos = start + ch.length;
        DOM.input.setSelectionRange(pos, pos);
        DOM.input.focus();
      };
    } else {
      DOM.charBar.style.display = "none";
      DOM.charBar.innerHTML = "";
      DOM.charBar.onclick = null;
    }
  }

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

    const userLoose = normalizeLooseAnswer(userValue);
    const userStrict = normalizeStrictAnswer(userValue);
    const looseList = correct.map(normalizeLooseAnswer);
    const strictList = correct.map(normalizeStrictAnswer);
    ok = looseList.includes(userLoose);
    const strictOk = strictList.includes(userStrict);
    if (ok && strictOk && lessonRun) lessonRun.strictPerfect += 1;
    showCorrect = correct[0] != null ? String(correct[0]) : "";
  }

  if (lessonRun) { lessonRun.answered += 1; if (!ok) lessonRun.wrong += 1; }

  if (ok) {
    playSfx("correct");

    streak += 1;
    saveStreak();

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

  // ✅ progress bar reset (shows first question progress immediately)
  setLessonProgressUI(1, lessonData?.questions?.length || 1);

  renderQuestion();
}

/* -----------------------------
   Lesson complete
----------------------------- */
function onLessonComplete() {
  const meta = manifest.lessons[lessonIndex];

  // ----- Scoring (stars + XP) -----
  const totalQ = Math.max(1, lessonRun ? lessonRun.total : (lessonData?.questions?.length || 1));
  const wrong = lessonRun ? lessonRun.wrong : 0;
  const strictPerfect = lessonRun ? lessonRun.strictPerfect : 0;
  const accuracy = clamp((totalQ - wrong) / totalQ, 0, 1);

  let stars = 1;
  if (accuracy >= 0.90) stars = 2;
  if (wrong === 0 && strictPerfect === totalQ) stars = 3;

  const prev = (progress.best && progress.best[meta.id]) ? progress.best[meta.id] : null;
  const prevStars = prev && Number.isFinite(prev.stars) ? prev.stars : 0;

  const isNewCompletion = !isLessonCompleted(meta.id);
  const baseXp = isNewCompletion ? 50 : 15;
  const starBonus = stars === 3 ? 30 : stars === 2 ? 20 : 10;
  const improveBonus = (stars > prevStars) ? 20 : 0;
  const awardXp = baseXp + starBonus + improveBonus;

  // Persist best stars for this lesson
  if (!progress.best || typeof progress.best !== "object") progress.best = {};
  progress.best[meta.id] = {
    stars: Math.max(prevStars, stars),
    lastStars: stars,
    accuracy: Number(accuracy.toFixed(4)),
    strictPerfect: strictPerfect,
    total: totalQ,
    updatedAt: Date.now(),
  };

  // Per-journey XP totals
  progress.xpTotal = Number(progress.xpTotal || 0) + awardXp;

  // Global XP per course
  const g = loadGlobalMeta();
  g.xpByCourse[learnLang] = Number(g.xpByCourse[learnLang] || 0) + awardXp;
  if (isNewCompletion) g.lessonsCompletedByCourse[learnLang] = Number(g.lessonsCompletedByCourse[learnLang] || 0) + 1;
  else g.repeatsByCourse[learnLang] = Number(g.repeatsByCourse[learnLang] || 0) + 1;

  // Global XP per language pair (native->learn)
  const pairKey = `${nativeLang}->${learnLang}`;
  if (!g.xpByPair || typeof g.xpByPair !== "object") g.xpByPair = {};
  if (!g.lessonsCompletedByPair || typeof g.lessonsCompletedByPair !== "object") g.lessonsCompletedByPair = {};
  if (!g.repeatsByPair || typeof g.repeatsByPair !== "object") g.repeatsByPair = {};
  g.xpByPair[pairKey] = Number(g.xpByPair[pairKey] || 0) + awardXp;
  if (isNewCompletion) g.lessonsCompletedByPair[pairKey] = Number(g.lessonsCompletedByPair[pairKey] || 0) + 1;
  else g.repeatsByPair[pairKey] = Number(g.repeatsByPair[pairKey] || 0) + 1;
  saveGlobalMeta(g);

  // Reset run state for safety
  lessonRun = null;

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

  // ✅ Map screen: show Home + Helper toggle + Account
  show(DOM.controls.homeBtn, true);
  show(DOM.controls.helperToggleBtn, true);
  show(DOM.controls.accountBtn, true);

  // 🏆 Achievements button (map only)
  if (DOM.controls.trophyBtn) show(DOM.controls.trophyBtn, true);

  if (DOM.controls.speakBtn) DOM.controls.speakBtn.style.display = "none";
  if (DOM.controls.speakSlowBtn) DOM.controls.speakSlowBtn.style.display = "none";

  updateControlsForViewport();
}

function renderMap() {
  // If achievements panel exists, default to showing map (not achievements)
  if (DOM.achPanel) DOM.achPanel.style.display = "none";

  setControlsForMap();

  // Screen
  setScreen("map");

  // Hide the plain header text in the map screen (we’ll use the top pill instead)
  const mapTitleEl = document.querySelector(".map-title");
  const mapSubEl = document.querySelector(".map-subtitle");
  if (mapTitleEl) mapTitleEl.style.display = "none";
  if (mapSubEl) mapSubEl.style.display = "none";

  // Title (hidden h1 is fine, but keep it accurate)
  if (DOM.title) DOM.title.textContent = `${langName(learnLang)} ${uiT("course_map") || "Course Map"}`;

  // Progress %
  const lessonCount = manifest.lessons.length || 1;
  let doneCount = 0;
  for (const m of manifest.lessons) {
    if (m?.id && isLessonCompleted(m.id)) doneCount++;
  }
  const pct = Math.round((doneCount / lessonCount) * 100);



  // Top pill content: ONLY flag + Course Map
  const cm = uiT("course_map") || "Course Map";
  if (DOM.prompt) {
    DOM.prompt.innerHTML = `
      <span class="promptMeta promptMeta--map">
        <span class="promptPair">
          <img class="promptFlag" src="${flagSrc(learnLang)}" alt="" aria-hidden="true">
          <span class="promptPairLabel" data-short="${escapeHtml(cm)}">${escapeHtml(cm)}</span>
        </span>
      </span>
    `.trim();
  }

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

  // Paths
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

  // Determine current (next) lesson index (lowest unlocked but not completed)
  let currentIdx = 0;
  for (let i = 0; i < lessonCount; i++) {
    const meta = manifest.lessons[i];
    const unlocked = i === 0 || (i <= maxUnlocked);
    const completed = isLessonCompleted(meta.id);
    if (unlocked && !completed) { currentIdx = i; break; }
    if (i === lessonCount - 1) currentIdx = i;
  }

  // Nodes + labels
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

    // Icon is optional; the new node art already conveys state.
    // Keep a small hint icon for clarity.
    const icon = meta.icon || (completed ? "✅" : unlocked ? "▶️" : "🔒");
    const st = (progress.best && progress.best[meta.id] && Number.isFinite(progress.best[meta.id].stars)) ? progress.best[meta.id].stars : 0;
    const starsHtml = (st > 0)
      ? `<div class="mapNodeStars" aria-label="${st} stars">
          ${[1,2,3].map(n => `<img class="mapStarImg" src="assets/icons/${n <= st ? "star" : "empty_star"}.png" alt="" aria-hidden="true">`).join("")}
         </div>`
      : "";
    btn.innerHTML = `<div class="mapNodeInner">
        <div class="mapNodeIcon">${icon}</div>
        <div class="mapNodeNum">${i + 1}</div>
        ${starsHtml}
      </div>`;

    // Apply new node skins
    if (!unlocked) btn.classList.add("mapNode-state-locked");
    else if (completed) btn.classList.add("mapNode-state-green");
    else btn.classList.add("mapNode-state-blue");

    if (i === currentIdx && unlocked && !completed) btn.classList.add("node-current");

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

function renderAchievementsPanel() {
  if (!DOM.achPanel) return;

  const g = loadGlobalMeta();
  const totalXp = totalGlobalXp(g);
  const courseXp = Number((g.xpByCourse || {})[learnLang] || 0);

  if (DOM.achTotalXp) DOM.achTotalXp.textContent = String(totalXp);
  if (DOM.achCourseXp) DOM.achCourseXp.textContent = String(courseXp);

  // Course list (XP + lessons completed)
  if (DOM.achCourseList) {
    const xpMap = g.xpByCourse || {};
    const doneMap = g.lessonsCompletedByCourse || {};
    const courses = Object.keys(xpMap).sort((a,b) => (xpMap[b]||0) - (xpMap[a]||0));

    DOM.achCourseList.innerHTML = courses.length
      ? courses.map(c => {
          const xp = Number(xpMap[c] || 0);
          const done = Number(doneMap[c] || 0);
          return `<div class="achCourseRow">
            <div class="achCourseLeft">
              <img class="flagIcon" src="${flagSrc(c)}" alt="" aria-hidden="true" />
              <div class="achCourseName">${escapeHtml(langName(c))}</div>
            </div>
            <div class="achCourseMeta">
              <div class="achCourseXp">${xp} XP</div>
              <div class="achCourseDone">${done} lessons</div>
            </div>
          </div>`;
        }).join("")
      : `<div class="muted">No XP yet. Complete a lesson to start earning.</div>`;
  }

  // Badges (for current course)
  if (DOM.achBadges) {
    const badges = computeBadgesForCourse(learnLang, g);
    DOM.achBadges.innerHTML = badges.length
      ? badges.map(b => `<span class="achBadge">${escapeHtml(b)}</span>`).join("")
      : `<div class="muted">No achievements yet.</div>`;
  }
}

function renderAchievementsScreen() {
  // Full-page achievements screen
  setScreen("achievements");
  setControlsForAchievements();

  // Top pill: trophy + Achievements (no flags)
  const ttl = uiT("Achievements") || "Achievements";
  if (DOM.prompt) {
    DOM.prompt.innerHTML = `
      <span class="promptMeta promptMeta--map">
        <span class="promptPair">
          <img class="promptIcon" src="assets/icons/trophy.png" alt="" aria-hidden="true">
          <span class="promptPairLabel" data-short="${escapeHtml(ttl)}">${escapeHtml(ttl)}</span>
        </span>
      </span>
    `.trim();
  }

  const g = loadGlobalMeta();
  const totalXp = totalGlobalXp(g);
  const pairKey = `${nativeLang}->${learnLang}`;
  const pairXp = Number((g.xpByPair || {})[pairKey] || 0);

  if (DOM.achTotalXp2) DOM.achTotalXp2.textContent = String(totalXp);
  if (DOM.achJourneyXp2) DOM.achJourneyXp2.textContent = String(pairXp);

  // List: XP by pair
  if (DOM.achCourseList2) {
    const xpMap = g.xpByPair || {};
    const doneMap = g.lessonsCompletedByPair || {};
    const pairs = Object.keys(xpMap).sort((a,b) => (xpMap[b]||0) - (xpMap[a]||0));
    DOM.achCourseList2.innerHTML = pairs.length
      ? pairs.map(k => {
          const v = Number(xpMap[k] || 0);
          const d = Number(doneMap[k] || 0);
          return `<div class="achCourseRow">
            <div class="achCourseName">${escapeHtml(k)}</div>
            <div class="achCourseMeta">${d} lessons</div>
            <div class="achCourseXp">${v} XP</div>
          </div>`;
        }).join("")
      : `<div class="muted">No XP yet — complete a lesson to start earning.</div>`;
  }

  // Badges (for current pair)
  if (DOM.achBadges2) {
    const badges = computeBadgesForPair(pairKey, g);
    DOM.achBadges2.innerHTML = badges.length
      ? badges.map(b => `<span class="achBadge">${escapeHtml(b)}</span>`).join("")
      : `<div class="muted">No achievements unlocked yet.</div>`;
  }
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
  const lastId = localStorage.getItem(lastLessonKey())
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
   ✅ NEW: Start vs Continue toggle helper (put near setHomeCopy)
----------------------------- */
function updateStartContinueButtons() {
  // progress shape varies across versions — handle safely
  let completedCount = 0;

  if (Array.isArray(progress?.completedLessonIds)) completedCount = progress.completedLessonIds.length;
  else if (Array.isArray(progress?.done)) completedCount = progress.done.length;
  else if (progress && typeof progress === "object" && progress.completed && typeof progress.completed === "object") {
    completedCount = Object.keys(progress.completed).length;
  }

  const isReturning = completedCount > 0;

  if (DOM.startBtn) DOM.startBtn.style.display = isReturning ? "none" : "";
  if (DOM.continueBtn) DOM.continueBtn.style.display = isReturning ? "" : "none";
}

/* -----------------------------
   Home copy (no Lithuanian hardcode)
----------------------------- */
function setHomeCopy() {
  if (DOM.title) DOM.title.textContent = "OpenKalba";

  if (DOM.prompt) {
    const nCode = nativeLang;
    const lCode = learnLang;

    const nName = langName(nCode);
    const lName = langName(lCode);

    // Home top pill: ( TEXT FLAG  -  TEXT FLAG )
    DOM.prompt.innerHTML = `
      <span class="promptMeta promptMeta--home">
        <span class="homeLangItem" aria-label="Native language">
          <span class="homeLangText" data-code="${escapeHtml(String(nCode||''))}" data-full="${escapeHtml(nName)}">${escapeHtml(nName)}</span>
          <img class="promptFlag" src="${flagSrc(nCode)}" alt="" aria-hidden="true">
        </span>

        <span class="homeDivider" aria-hidden="true">-</span>

        <span class="homeLangItem" aria-label="Learning language">
          <span class="homeLangText" data-code="${escapeHtml(String(lCode||''))}" data-full="${escapeHtml(lName)}">${escapeHtml(lName)}</span>
          <img class="promptFlag" src="${flagSrc(lCode)}" alt="" aria-hidden="true">
        </span>
      </span>
    `;

    // Swap to 2-letter codes only if a side actually overflows.
    applyHomePillFit();
  }

  const kicker = document.querySelector(".homeKicker");
  if (kicker) kicker.textContent = "OpenKalba";

  const mapTitle = document.querySelector(".map-title");
  if (mapTitle) mapTitle.textContent = uiT("course_map") || "Course Map";

  // If you later add your Start/Continue auto-toggle, keep this line:
  updateStartContinueButtons();
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

  // Home button
  if (DOM.controls.homeBtn) DOM.controls.homeBtn.onclick = () => goHome();

  // Trophy / Achievements (map only)
  if (DOM.controls.trophyBtn) {
    DOM.controls.trophyBtn.onclick = () => {
      renderAchievementsScreen();
    };
  }

  // (legacy panel close — keep harmless)
  if (DOM.achCloseBtn) DOM.achCloseBtn.onclick = () => { if (DOM.achPanel) DOM.achPanel.style.display = "none"; };

  // ✅ helper toggle click: always go through applyHelperVisibility + persist (no desync)
  if (DOM.controls.helperToggleBtn) {
    DOM.controls.helperToggleBtn.onclick = () => {
      const hiddenNow =
        (DOM.mikasDock && DOM.mikasDock.getAttribute("aria-hidden") === "true")
          ? true
          : getHelperHiddenPref();

      const nextHidden = !hiddenNow;

      setHelperHiddenPref(nextHidden);
      applyHelperVisibility(nextHidden);

      // Re-apply mobile icon-only (so the pills stay centered)
      updateControlsForViewport();
    };
  }

  // Custom language pickers
  if (DOM.nativeLangBtn) DOM.nativeLangBtn.onclick = () => openLangModal("native");
  if (DOM.learnLangBtn) DOM.learnLangBtn.onclick = () => openLangModal("learn");

  // close modal by clicking backdrop / X
  if (DOM.langModal) {
    DOM.langModal.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.getAttribute && ((t.getAttribute("data-close-lang") === "1") || (t.getAttribute("data-close") === "1"))) closeLangModal();
    });
  }
  if (DOM.langModalClose) DOM.langModalClose.onclick = closeLangModal;

  if (DOM.controls.accountBtn) {
    // Always wire the click — openAuth() will internally prefer AuthUI.open() when available.
    DOM.controls.accountBtn.onclick = () => openAuth();
  }

  if (DOM.startBtn) DOM.startBtn.onclick = () => startLesson(0);
  if (DOM.continueBtn) DOM.continueBtn.onclick = () => startFromContinue();

  // Native change: reload overlay + refresh text
  if (DOM.nativeLangSelect) {
    DOM.nativeLangSelect.onchange = async () => {
      nativeLang = DOM.nativeLangSelect.value || "en";

      updateLangPickerLabels();
      updateFlags();
      saveLangSettings(nativeLang, learnLang);

      await loadOverlay(nativeLang, learnLang);
      applyUiOverlays();

      applyStaticUiText();

      progress = loadProgress();
  if (!progress || typeof progress !== "object") progress = { completedLessonIds: [], best: {}, xpTotal: 0 };
  if (!Array.isArray(progress.completedLessonIds)) progress.completedLessonIds = [];
  if (!progress.best || typeof progress.best !== "object") progress.best = {};
  if (!Number.isFinite(Number(progress.xpTotal))) progress.xpTotal = 0;
      streak = loadStreak();

      // ✅ NEW: refresh Start/Continue visibility after progress reload
      updateStartContinueButtons();

      if (lessonData) lessonData = normalizeLessonToQuestions(lessonData);

      if (currentScreen === "lesson") renderQuestion();
      if (currentScreen === "map") renderMap();
      setHomeCopy();

      // ✅ sync pretty buttons
      syncLangPickButtons();

      updateControlsForViewport();
    };
  }

  // Learn change: repopulate selects (course-aware) + reload manifest/audio/overlay
  if (DOM.learnLangSelect) {
    DOM.learnLangSelect.onchange = async () => {
      learnLang = DOM.learnLangSelect.value || "lt";

      updateLangPickerLabels();
      updateFlags();
      saveLangSettings(nativeLang, learnLang);

      if (catalog) populateLanguageSelects(catalog);

      progress = loadProgress();
      streak = loadStreak();

      // ✅ NEW: refresh Start/Continue visibility after progress reload
      updateStartContinueButtons();

      manifest = await loadManifest();
      ltAudioMap = await loadLtAudioManifest(getAudioManifestUrl());

      await loadOverlay(nativeLang, learnLang);
      applyUiOverlays();

      applyStaticUiText();

      setHomeCopy();

      // Do NOT auto-navigate to Course Map just because the user changed a dropdown.
      if (currentScreen === "map") renderMap();
      if (currentScreen === "lesson") renderQuestion();

      // ✅ sync pretty buttons
      syncLangPickButtons();

      updateControlsForViewport();
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

    // ✅ call once after populateLanguageSelects(catalog)
    syncLangPickButtons();

    updateFlags();

    await loadOverlay(nativeLang, learnLang);
    applyUiOverlays();

    applyStaticUiText();

    progress = loadProgress();
    streak = loadStreak();

    // ✅ NEW: Start/Continue visibility after initial progress load
    updateStartContinueButtons();

    manifest = await loadManifest();

    ltAudioMap = await loadLtAudioManifest(getAudioManifestUrl());

    refreshAccountDot();
    wireEvents();

    // Apply helper visibility preference on startup (and keep icon/aria in sync)
    const hidden = getHelperHiddenPref();
    applyHelperVisibility(hidden);
    setHelperHiddenPref(hidden); // ensure both keys exist

    setScreen("home");
    setHomeCopy();

    // ensure Home controls are correct
    setControlsForHome();

    if ("speechSynthesis" in window) {
      await sleep(50);
      window.speechSynthesis.getVoices?.();
    }

    if (!DOM.screens.home && DOM.screens.map) {
      setScreen("map");
      renderMap();
    }

    // Force correct icon-only behavior + centering on load and resize
    updateControlsForViewport();
    window.addEventListener("resize", updateControlsForViewport);
  } catch (err) {
    console.error(err);
    if (DOM.title) DOM.title.textContent = "Error";
    if (DOM.prompt) DOM.prompt.textContent = String(err?.message || err);
  }
}

init();

/* -----------------------------
   Screens (kept at end in your paste; no change needed)
----------------------------- */
function goHome() {
  if (DOM.achPanel) DOM.achPanel.style.display = "none";
  setScreen("home");
  setHomeCopy();
  setControlsForHome();
}
