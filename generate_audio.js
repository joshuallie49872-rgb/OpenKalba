/**
 * OpenKalba — generate_audio.js (multi-language)
 *
 * Pre-generate MP3 audio for all unique TTS lines used by a course language.
 *
 * Expects:
 *  - .env with AZURE_SPEECH_KEY and AZURE_SPEECH_REGION
 *  - courses/<lang>/lessons/*.json built already
 *
 * Outputs:
 *  - audio/<lang>/*.mp3
 *  - courses/<lang>/audio/manifest.json   (slug -> "audio/<lang>/<file>.mp3")
 *
 * Usage:
 *  node generate_audio.js --lang et
 *  node generate_audio.js --lang et --voice et-EE-AnuNeural
 *
 * Notes:
 *  - Uses Azure Speech SDK neural voices.
 *  - Skips any MP3 that already exists.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();
const speechsdk = require("microsoft-cognitiveservices-speech-sdk");

const KEY = process.env.AZURE_SPEECH_KEY || "";
const REGION = process.env.AZURE_SPEECH_REGION || "";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

if (!KEY || !REGION) {
  die("Missing AZURE_SPEECH_KEY / AZURE_SPEECH_REGION in .env");
}

// ---------------------------
// Args
// ---------------------------
function getArg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return fallback;
  return v;
}

const lang = (getArg("lang", "") || "").trim().toLowerCase();
if (!lang) die("Usage: node generate_audio.js --lang <lt|lv|et|ru|pl|uk|is|...>");

const voiceOverride = getArg("voice", "");

// ---------------------------
// Voice defaults per language
// (change anytime)
// ---------------------------
const DEFAULT_VOICE = {
  lt: "lt-LT-LeonasNeural",
  lv: "lv-LV-NilsNeural",
  et: "et-EE-AnuNeural",   // alt: et-EE-KertNeural
  ru: "ru-RU-DmitryNeural",
  pl: "pl-PL-MarekNeural",
  uk: "uk-UA-PolinaNeural", // if you prefer a different UA voice, set it here
  is: "is-IS-GudrunNeural", // if available in your region; otherwise override with --voice
  fi: "fi-FI-HarriNeural",
  fr: "fr-FR-DeniseNeural",
  de: "de-DE-KatjaNeural",
  no: "nb-NO-PernilleNeural",
  se: "sv-SE-SofieNeural",
  mx: "es-ES-ElviraNeural"
};

const voiceName = (voiceOverride || DEFAULT_VOICE[lang] || "").trim();
if (!voiceName) {
  die(`No default voice configured for lang="${lang}". Provide one: --voice <VoiceName>`);
}

// ---------------------------
// Paths
// ---------------------------
const COURSE_LESSONS_DIR = path.join(process.cwd(), "courses", lang, "lessons");
const OUT_AUDIO_DIR = path.join(process.cwd(), "audio", lang);
const OUT_MANIFEST_PATH = path.join(process.cwd(), "courses", lang, "audio", "manifest.json");

// ---------------------------
// Helpers
// ---------------------------
function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sha1(s) {
  return crypto.createHash("sha1").update(String(s || ""), "utf8").digest("hex");
}

function safeStr(x) {
  if (x === null || x === undefined) return "";
  return String(x);
}

function extractTtsFromQuestion(q) {
  // Accept:
  // - q.tts: "text"
  // - q.tts: { text: "text" }
  const t = q && q.tts;
  if (!t) return "";
  if (typeof t === "string") return t.trim();
  if (typeof t === "object" && t.text) return safeStr(t.text).trim();
  return "";
}

function readJson(fp) {
  try {
    const raw = fs.readFileSync(fp, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function synthesizeMp3(text, outPath, voice) {
  return new Promise((resolve, reject) => {
    const speechConfig = speechsdk.SpeechConfig.fromSubscription(KEY, REGION);
    speechConfig.speechSynthesisOutputFormat =
      speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    speechConfig.speechSynthesisVoiceName = voice;

    const audioConfig = speechsdk.AudioConfig.fromAudioFileOutput(outPath);
    const synthesizer = new speechsdk.SpeechSynthesizer(speechConfig, audioConfig);

    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close();
        if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) return resolve();
        return reject(new Error(result.errorDetails || "TTS failed"));
      },
      (err) => {
        synthesizer.close();
        reject(err);
      }
    );
  });
}

// ---------------------------
// Main
// ---------------------------
(async () => {
  if (!fs.existsSync(COURSE_LESSONS_DIR)) {
    die(`Missing folder: ${COURSE_LESSONS_DIR}\nRun build first: python tools/build_course_from_lt.py build --target ${lang}`);
  }

  const files = fs.readdirSync(COURSE_LESSONS_DIR).filter((f) => f.toLowerCase().endsWith(".json"));
  if (!files.length) die(`No lesson JSON found in: ${COURSE_LESSONS_DIR}`);

  ensureDir(OUT_AUDIO_DIR);
  ensureDir(path.dirname(OUT_MANIFEST_PATH));

  const seen = new Map(); // text -> { slug, fileRel }
  for (const f of files) {
    const fp = path.join(COURSE_LESSONS_DIR, f);
    const data = readJson(fp);
    if (!data) continue;

    const questions = Array.isArray(data.questions)
      ? data.questions
      : (Array.isArray(data.items) ? data.items : []);

    for (const q of questions) {
      const t = extractTtsFromQuestion(q);
      if (!t) continue;

      const slug = slugify(t);
      if (!slug) continue;

      // stable filename: <hash12>_<slug>.mp3
      const h = sha1(t).slice(0, 16);
      const fileName = `${h}_${slug}.mp3`;

      // this is the URL path your app will use
      const relUrl = `audio/${lang}/${fileName}`;

      if (!seen.has(t)) {
        seen.set(t, { text: t, slug, fileName, relUrl });
      }
    }
  }

  const all = Array.from(seen.values());
  console.log(`Found ${all.length} unique TTS lines for "${lang}".`);
  console.log(`Voice: ${voiceName}`);
  console.log(`Region: ${REGION}`);

  // build manifest map: slug -> relUrl
  const manifestMap = {};

  for (let i = 0; i < all.length; i++) {
    const item = all[i];
    const outPath = path.join(OUT_AUDIO_DIR, item.fileName);

    manifestMap[item.slug] = item.relUrl;

    if (fs.existsSync(outPath)) {
      console.log(`[${i + 1}/${all.length}] exists, skip: ${item.fileName}`);
      continue;
    }

    const label = item.text.length > 60 ? item.text.slice(0, 60) + "…" : item.text;
    console.log(`[${i + 1}/${all.length}] synth: ${label}`);

    try {
      await synthesizeMp3(item.text, outPath, voiceName);
    } catch (e) {
      console.error(`  ❌ failed: "${item.text}"`);
      console.error(`  ${e && e.message ? e.message : e}`);
    }
  }

  // write manifest
  fs.writeFileSync(OUT_MANIFEST_PATH, JSON.stringify(manifestMap, null, 2) + "\n", "utf8");
  console.log(`\n✅ Done.`);
  console.log(`MP3 folder: ${path.join("audio", lang)}`);
  console.log(`Manifest: ${path.join("courses", lang, "audio", "manifest.json")}`);
})();
