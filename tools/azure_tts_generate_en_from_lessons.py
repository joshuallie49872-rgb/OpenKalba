import os, json, re, hashlib, unicodedata, requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DEFAULT_VOICE = "en-US-JennyNeural"
DEFAULT_REGION = "westus2"
OUTPUT_FORMAT = "audio-24khz-96kbitrate-mono-mp3"

def slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")

def h16(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]

def escape_xml(s: str) -> str:
    return (s or "").replace("&","&amp;").replace("<","&lt;").replace(">","&gt;") \
                     .replace('"',"&quot;").replace("'","&apos;")

def tts(text: str, voice: str, region: str, key: str) -> bytes:
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    # voice split like en-US-JennyNeural -> en
    lang = voice.split("-")[0]
    ssml = f"<speak version='1.0' xml:lang='{lang}'><voice name='{voice}'>{escape_xml(text)}</voice></speak>"
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
        "User-Agent": "OpenKalbaTTS",
    }
    r = requests.post(url, headers=headers, data=ssml.encode("utf-8"), timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"{r.status_code}: {r.text[:300]}")
    return r.content

def iter_en_phrases():
    lessons_dir = os.path.join(ROOT, "courses", "en", "lessons")
    manifest_path = os.path.join(lessons_dir, "manifest.json")
    m = json.load(open(manifest_path, "r", encoding="utf-8"))
    for entry in m.get("lessons", []):
        lid = entry.get("id")
        if not lid:
            continue
        lesson_path = os.path.join(lessons_dir, f"{lid}.json")
        if not os.path.exists(lesson_path):
            continue
        lesson = json.load(open(lesson_path, "r", encoding="utf-8"))
        for q in lesson.get("questions", []):
            t = (q.get("tts") or q.get("en") or "").strip()
            if t:
                yield t

def main():
    key = os.getenv("AZURE_SPEECH_KEY", "").strip()
    region = os.getenv("AZURE_SPEECH_REGION", "").strip() or DEFAULT_REGION
    voice = os.getenv("AZURE_TTS_VOICE_EN", "").strip() or DEFAULT_VOICE

    if not key:
        raise SystemExit("Missing AZURE_SPEECH_KEY environment variable")
    if not region:
        raise SystemExit("Missing AZURE_SPEECH_REGION environment variable (or set DEFAULT_REGION in script)")

    out_audio_dir = os.path.join(ROOT, "audio", "en")
    os.makedirs(out_audio_dir, exist_ok=True)

    # Build unique phrase set
    phrases = []
    seen = set()
    for p in iter_en_phrases():
        k = p.lower().strip()
        if k not in seen:
            seen.add(k)
            phrases.append(p)

    manifest = {}

    print(f"Found {len(phrases)} unique English TTS phrases.")
    print(f"Voice: {voice} | Region: {region} | Output: {OUTPUT_FORMAT}")
    print("Generating MP3 files into: audio/en/ ...")

    for i, text in enumerate(phrases, 1):
        slug = slugify(text) or h16(text)
        fname = f"{h16(text)}_{slug}.mp3"
        abs_path = os.path.join(out_audio_dir, fname)
        rel_path = f"audio/en/{fname}"

        if os.path.exists(abs_path) and os.path.getsize(abs_path) > 0:
            manifest[slug] = rel_path
            continue

        audio = tts(text, voice=voice, region=region, key=key)
        with open(abs_path, "wb") as f:
            f.write(audio)
        manifest[slug] = rel_path

        if i % 25 == 0:
            print(f"  {i}/{len(phrases)} done...")

    # Write course audio manifest (used by app.js)
    course_manifest_dir = os.path.join(ROOT, "courses", "en", "audio")
    os.makedirs(course_manifest_dir, exist_ok=True)
    course_manifest_path = os.path.join(course_manifest_dir, "manifest.json")
    with open(course_manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print("✅ Done.")
    print("Wrote:", course_manifest_path)
    print("Tip: commit /audio/en/* and /courses/en/audio/manifest.json for offline-ready audio.")

if __name__ == "__main__":
    main()
