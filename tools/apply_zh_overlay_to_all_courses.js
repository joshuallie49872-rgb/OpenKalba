"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const COURSES_DIR = path.join(ROOT, "courses");
const TEMPLATE = path.join(ROOT, "tools", "overlay_templates", "zh.json");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(TEMPLATE)) {
  die(`Missing template: ${TEMPLATE}\nCreate it first: tools/overlay_templates/zh.json`);
}

const templateText = fs.readFileSync(TEMPLATE, "utf8");

if (!fs.existsSync(COURSES_DIR)) die(`Missing courses dir: ${COURSES_DIR}`);

const courseCodes = fs
  .readdirSync(COURSES_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .filter(name => !name.startsWith("."));

let written = 0;

for (const code of courseCodes) {
  const overlaysDir = path.join(COURSES_DIR, code, "overlays");
  const outFile = path.join(overlaysDir, "zh.json");

  if (!fs.existsSync(overlaysDir)) {
    fs.mkdirSync(overlaysDir, { recursive: true });
  }

  // Write/overwrite so all courses stay consistent
  fs.writeFileSync(outFile, templateText.trimEnd() + "\n", "utf8");
  written++;
  console.log(`✅ ${path.relative(ROOT, outFile)}`);
}

console.log(`\nDone. Wrote ${written} zh overlay files.`);
