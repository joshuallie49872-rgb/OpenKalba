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
 *  - courses/<lang>/audio/manifest.json        (slug -> "audio/<lang>/<file>.mp3")
 *  - courses/<lang>/audio/manifest_slow.json   (slug -> "audio/<lang>/<file>__slow.mp3")
 *
 * Usage:
 *  node generate_audio.js --lang hi --delay 1200 --retries 6
 *  node generate_audio.js --lang bn --delay 1200 --retries 6
 *  node generate_audio.js --lang ur --delay 800  --retries 4
 *  node generate_audio.js --lang pt --delay 800  --retries 4
 *
 * Options:
 *  --voice <VoiceName>      override voice
 *  --delay <ms>             delay between successful synth calls (default 800)
 *  --retries <n>            retries per file on non-quota errors (default 4)
 *  --force                  overwrite existing mp3s (normal+slow)
 *  --no-slow                skip generating slow mp3s
 *
 * Notes:
 *  - Uses Azure Speech SDK neural voices.
 *  - Manifest keys are Unicode-safe and must match app.js slugifyLt().
 *  - Filenames are ASCII-safe + hashed (stable, URL-safe).
 *  - On "Quota Exceeded" errors, the script aborts immediately.
 */

"use strict";

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
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const lang = (getArg("lang", "") || "").trim().toLowerCase();
if (!lang) die("Usage: node generate_audio.js --lang <lt|lv|et|ru|pl|uk|is|...>");

const voiceOverride = (getArg("voice", "") || "").trim();
const delayMs = Math.max(0, parseInt(getArg("delay", "800"), 10) || 0);
const retries = Math.max(0, parseInt(getArg("retries", "4"), 10) || 0);
const force = hasFlag("force");
const noSlow = hasFlag("no-slow");

// ---------------------------
// Voice defaults per language
// ---------------------------
const DEFAULT_VOICE = {
  lt: "lt-LT-LeonasNeural",
  lv: "lv-LV-NilsNeural",
  et: "et-EE-AnuNeural",      // alt: et-EE-KertNeural
  ru: "ru-RU-DmitryNeural",
  pl: "pl-PL-MarekNeural",
  uk: "uk-UA-PolinaNeural",
  is: "is-IS-GudrunNeural",
  fi: "fi-FI-HarriNeural",
  fr: "fr-FR-DeniseNeural",
  de: "de-DE-KatjaNeural",
  no: "nb-NO-PernilleNeural",
  se: "sv-SE-SofieNeural",
  mx: "es-ES-ElviraNeural",
  en: "en-US-JennyNeural",
  zh: "zh-CN-XiaoxiaoNeural",

  // ✅ new ones
  hi: "hi-IN-MadhurNeural",
  bn: "bn-IN-BashkarNeural",
  pt: "pt-PT-DuarteNeural",
  ur: "ur-PK-AsadNeural",
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
const OUT_MANIFEST_SLOW_PATH = path.join(process.cwd(), "courses", lang, "audio", "manifest_slow.json");

// ---------------------------
// Helpers
// ---------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Unicode-safe key for manifests (works for all scripts)
// MUST MATCH app.js slugifyLt() (Unicode-safe) for lookups to work.
function slugifyKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

// ASCII-safe filename fragment (avoid Unicode in filenames/URLs)
function slugifyFile(s) {
  const out = String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return out || "tts";
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

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isQuotaExceededMessage(msg) {
  const m = String(msg || "").toLowerCase();
  return (
    m.includes("quota exceeded") ||
    m.includes("quotaexceeded") ||
    m.includes("exceeded quota") ||
    m.includes("insufficient quota")
  );
}

function deleteIfTinyMp3(fp) {
  try {
    const st = fs.statSync(fp);
    // MP3s should be > ~500 bytes; tiny ones are usually corrupt/empty
    if (!st.size || st.size < 500) {
      try { fs.unlinkSync(fp); } catch {}
      return true;
    }
  } catch {}
  return false;
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

        if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
          // guard: delete corrupt tiny files
          deleteIfTinyMp3(outPath);
          return resolve();
        }

        const msg = result.errorDetails || "TTS failed";
        // guard: delete corrupt tiny files if created
        deleteIfTinyMp3(outPath);

        return reject(Object.assign(new Error(msg), { _quota: isQuotaExceededMessage(msg) }));
      },
      (err) => {
        synthesizer.close();
        // guard: delete corrupt tiny files if created
        deleteIfTinyMp3(outPath);

        const msg = (err && err.message) ? err.message : String(err || "TTS failed");
        reject(Object.assign(new Error(msg), { _quota: isQuotaExceededMessage(msg) }));
      }
    );
  });
}

function buildSlowSsml(text, voice, langTag) {
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${langTag}">` +
    `<voice name="${voice}"><prosody rate="0.5">${escapeXml(text)}</prosody></voice>` +
    `</speak>`
  );
}

function synthesizeMp3Ssml(ssml, outPath, voice) {
  return new Promise((resolve, reject) => {
    const speechConfig = speechsdk.SpeechConfig.fromSubscription(KEY, REGION);
    speechConfig.speechSynthesisOutputFormat =
      speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
    speechConfig.speechSynthesisVoiceName = voice;

    const audioConfig = speechsdk.AudioConfig.fromAudioFileOutput(outPath);
    const synthesizer = new speechsdk.SpeechSynthesizer(speechConfig, audioConfig);

    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        synthesizer.close();

        if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
          deleteIfTinyMp3(outPath);
          return resolve();
        }

        const msg = result.errorDetails || "TTS SSML failed";
        deleteIfTinyMp3(outPath);

        return reject(Object.assign(new Error(msg), { _quota: isQuotaExceededMessage(msg) }));
      },
      (err) => {
        synthesizer.close();
        deleteIfTinyMp3(outPath);

        const msg = (err && err.message) ? err.message : String(err || "TTS SSML failed");
        reject(Object.assign(new Error(msg), { _quota: isQuotaExceededMessage(msg) }));
      }
    );
  });
}

async function withRetries(fn, { label }) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (e && e._quota) {
        // abort immediately on quota exceeded
        throw Object.assign(new Error(`Quota Exceeded (abort): ${msg}`), { _quota: true });
      }

      attempt += 1;
      if (attempt > retries) throw e;

      // gentle backoff
      const backoff = Math.min(15000, delayMs + attempt * 600);
      console.error(`  ⚠️ retry ${attempt}/${retries} for ${label} after ${backoff}ms`);
      await sleep(backoff);
    }
  }
}

// ---------------------------
// Main
// ---------------------------
(async () => {
  if (!fs.existsSync(COURSE_LESSONS_DIR)) {
    die(
      `Missing folder: ${COURSE_LESSONS_DIR}\n` +
      `Run build first: python tools/build_course_from_lt.py build --target ${lang}`
    );
  }

  const files = fs
    .readdirSync(COURSE_LESSONS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".json"));

  if (!files.length) die(`No lesson JSON found in: ${COURSE_LESSONS_DIR}`);

  ensureDir(OUT_AUDIO_DIR);
  ensureDir(path.dirname(OUT_MANIFEST_PATH));

  // text -> { slug, fileName, relUrl }
  const seen = new Map();

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

      const slug = slugifyKey(t);
      if (!slug) continue;

      // stable filename: <hash16>_<asciiSlug>.mp3
      const h = sha1(t).slice(0, 16);
      const fileName = `${h}_${slugifyFile(t)}.mp3`;
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
  console.log(`Delay: ${delayMs}ms | Retries: ${retries} | Force: ${force} | Slow: ${!noSlow}`);

  // manifest: slug -> relUrl
  const manifestMap = {};
  const manifestMapSlow = {};

  for (let i = 0; i < all.length; i++) {
    const item = all[i];

    const outPath = path.join(OUT_AUDIO_DIR, item.fileName);

    const slowFileName = item.fileName.replace(/\.mp3$/i, "__slow.mp3");
    const outPathSlow = path.join(OUT_AUDIO_DIR, slowFileName);

    manifestMap[item.slug] = item.relUrl;
    manifestMapSlow[item.slug] = `audio/${lang}/${slowFileName}`;

    const normalExists = fs.existsSync(outPath);
    const slowExists = fs.existsSync(outPathSlow);

    if (!force && normalExists && (noSlow || slowExists)) {
      console.log(`[${i + 1}/${all.length}] exists, skip: ${item.fileName}${noSlow ? "" : " (+ slow)"}`);
      continue;
    }

    const label = item.text.length > 60 ? item.text.slice(0, 60) + "…" : item.text;
    console.log(`[${i + 1}/${all.length}] synth: ${label}`);

    if (force && normalExists) {
      try { fs.unlinkSync(outPath); } catch {}
    }
    if (force && slowExists) {
      try { fs.unlinkSync(outPathSlow); } catch {}
    }

    try {
      await withRetries(
        () => synthesizeMp3(item.text, outPath, voiceName),
        { label: `normal "${label}"` }
      );
      if (delayMs) await sleep(delayMs);
    } catch (e) {
      if (e && e._quota) throw e;
      console.error(`  ❌ normal failed: "${item.text}"`);
      console.error(`  ${e && e.message ? e.message : e}`);
    }

    if (!noSlow) {
      try {
        const xmlLang = (voiceName.split("-").slice(0, 2).join("-") || "en-US");
        const ssml = buildSlowSsml(item.text, voiceName, xmlLang);

        await withRetries(
          () => synthesizeMp3Ssml(ssml, outPathSlow, voiceName),
          { label: `slow "${label}"` }
        );
        if (delayMs) await sleep(delayMs);
      } catch (e) {
        if (e && e._quota) throw e;
        console.error(`  ❌ slow failed: "${item.text}"`);
        console.error(`  ${e && e.message ? e.message : e}`);
      }
    }
  }

  fs.writeFileSync(OUT_MANIFEST_PATH, JSON.stringify(manifestMap, null, 2) + "\n", "utf8");
  fs.writeFileSync(OUT_MANIFEST_SLOW_PATH, JSON.stringify(manifestMapSlow, null, 2) + "\n", "utf8");

  console.log(`\n✅ Done.`);
  console.log(`MP3 folder: ${path.join("audio", lang)}`);
  console.log(`Manifest: ${path.join("courses", lang, "audio", "manifest.json")}`);
  console.log(`Manifest (slow): ${path.join("courses", lang, "audio", "manifest_slow.json")}`);
})().catch((e) => {
  const msg = e && e.message ? e.message : String(e);
  console.error(msg);
  process.exit(1);
});
