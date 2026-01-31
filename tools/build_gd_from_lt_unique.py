import os
import json
import requests
import time

AZ_ENDPOINT = os.environ["AZ_TRANSLATOR_ENDPOINT"]
AZ_KEY = os.environ["AZ_TRANSLATOR_KEY"]
AZ_REGION = os.environ["AZ_TRANSLATOR_REGION"]

SRC = "courses/lt"
DST = "courses/gd"
CACHE = {}

def translate(text):
    if not isinstance(text, str):
        return text

    if text in CACHE:
        return CACHE[text]

    r = requests.post(
        f"{AZ_ENDPOINT}/translate?api-version=3.0&to=gd",
        headers={
            "Ocp-Apim-Subscription-Key": AZ_KEY,
            "Ocp-Apim-Subscription-Region": AZ_REGION,
            "Content-Type": "application/json"
        },
        json=[{"Text": text}]
    )

    out = r.json()[0]["translations"][0]["text"]
    CACHE[text] = out
    time.sleep(0.05)
    return out

def main():
    for root, _, files in os.walk(SRC):
        for file in files:
            if not file.endswith(".json"):
                continue

            src_path = os.path.join(root, file)
            rel = os.path.relpath(src_path, SRC)
            dst_path = os.path.join(DST, rel)

            os.makedirs(os.path.dirname(dst_path), exist_ok=True)

            with open(src_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            for item in data.get("items", []):
                if "en" in item:
                    item["gd"] = translate(item["en"])

            with open(dst_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            print(f"📘 Built gd lesson: {rel}")

if __name__ == "__main__":
    main()
