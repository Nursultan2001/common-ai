// Package the Chrome extension into apps/web/public so users can download it.
// Runs at build time (prebuild) AND should be run after any extension edit so
// the downloadable zip is ALWAYS in sync with apps/extension.
//
// Pure Node (zlib only) — no dependency on a system `zip` binary, so it works
// identically locally and in the Vercel build container.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const extDir = path.resolve(__dirname, "../../extension");
const outDir = path.resolve(__dirname, "../public");
const out = path.join(outDir, "common-ai-extension.zip");

// CRC-32 (IEEE), table-based.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  // files: [{ name, data: Buffer }]
  const chunks = [];
  const central = [];
  let offset = 0;
  const DOS_TIME = 0, DOS_DATE = 0x21; // fixed (deterministic): 1980-01-01

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const comp = zlib.deflateRawSync(f.data);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);       // version needed
    lfh.writeUInt16LE(0, 6);        // flags
    lfh.writeUInt16LE(8, 8);        // deflate
    lfh.writeUInt16LE(DOS_TIME, 10);
    lfh.writeUInt16LE(DOS_DATE, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(comp.length, 18);
    lfh.writeUInt32LE(f.data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);       // extra len
    chunks.push(lfh, nameBuf, comp);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);       // version made by
    cdh.writeUInt16LE(20, 6);       // version needed
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(8, 10);
    cdh.writeUInt16LE(DOS_TIME, 12);
    cdh.writeUInt16LE(DOS_DATE, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(comp.length, 20);
    cdh.writeUInt32LE(f.data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt32LE(offset, 42);  // local header offset
    central.push(Buffer.concat([cdh, nameBuf]));

    offset += lfh.length + nameBuf.length + comp.length;
  }

  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);   // central dir offset
  return Buffer.concat([...chunks, cd, eocd]);
}

try {
  if (!fs.existsSync(extDir)) throw new Error(`extension dir not found: ${extDir}`);
  fs.mkdirSync(outDir, { recursive: true });
  const files = fs
    .readdirSync(extDir)
    .filter((n) => !n.startsWith(".") && n !== "__MACOSX")
    .filter((n) => fs.statSync(path.join(extDir, n)).isFile())
    .sort()
    .map((name) => ({ name, data: fs.readFileSync(path.join(extDir, name)) }));
  fs.writeFileSync(out, zip(files));
  console.log(`[zip-extension] wrote ${out} (${files.length} files)`);
} catch (e) {
  console.warn("[zip-extension] skipped:", e.message, "(keeping existing zip if present)");
}
