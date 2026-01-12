import os, json, re, hashlib, requests, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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
    ssml = f"<speak version='1.0' xml:lang='{voice.split('-')[0]}'><voice name='{voice}'>{escape_xml(text)}</voice></speak>"
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-64kbitrate-mono-mp3",
        "User-Agent": "OpenKalbaTTS",
    }
    r = requests.post(url, headers=headers, data=ssml.encode("utf-8"), timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"{r.status_code}: {r.text[:200]}")
    return r.content

def main(lang: str, voice: str):
    key = os.getenv("AZURE_SPEECH_KEY", "").strip()
    region = os.getenv("AZURE_SPEECH_REGION", "").strip()

    if not key or not region:
        raise SystemExit("Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION")

    phrases_path = os.path.join(ROOT, "tools", "_tts", f"phrases_{lang}.txt")
    if not os.path.exists(phrases_path):
        raise SystemExit(f"Missing {phrases_path} (run extract first)")

    out_audio_dir = os.path.join(ROOT, "audio", lang)
    os.makedirs(out_audio_dir, exist_ok=True)

    manifest = {}

    with open(phrases_path, "r", encoding="utf-8") as f:
        phrases = [ln.strip() for ln in f if ln.strip()]

    for text in phrases:
        slug = slugify(text) or h16(text)
        fname = f"{h16(text)}_{slug}.mp3"
        abs_path = os.path.join(out_audio_dir, fname)
        rel_path = f"audio/{lang}/{fname}"

        if not os.path.exists(abs_path):
            mp3 = tts(text, voice, region, key)
            with open(abs_path, "wb") as wf:
                wf.write(mp3)
            print("OK:", text)

        manifest[slug] = rel_path

    course_manifest = os.path.join(ROOT, "courses", lang, "audio", "manifest.json")
    os.makedirs(os.path.dirname(course_manifest), exist_ok=True)

    with open(course_manifest, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\nWrote {len(manifest)} entries → {course_manifest}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python tools/azure_tts_bulk.py <lang> <voice>")
    main(sys.argv[1], sys.argv[2])
