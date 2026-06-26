// Package the Chrome extension into apps/web/public so users can download it.
// Runs at build time (prebuild). Uses the system `zip`; if it's unavailable the
// previously committed zip is kept (the build never fails over this).
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const extDir = path.resolve(__dirname, "../../extension");
const outDir = path.resolve(__dirname, "../public");
const out = path.join(outDir, "common-ai-extension.zip");

try {
  if (!fs.existsSync(extDir)) throw new Error(`extension dir not found: ${extDir}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.rmSync(out, { force: true });
  // Zip the CONTENTS of the extension dir (manifest.json at the archive root) so
  // it loads as an unpacked extension after unzipping. Exclude junk.
  execSync(`cd "${extDir}" && zip -r -q "${out}" . -x '*.DS_Store' -x '__MACOSX*'`, {
    stdio: "inherit",
  });
  console.log("[zip-extension] wrote", out);
} catch (e) {
  console.warn("[zip-extension] skipped:", e.message, "(keeping existing zip if present)");
}
