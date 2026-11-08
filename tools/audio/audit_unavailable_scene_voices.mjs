#!/usr/bin/env node
// Find exact missing AUTH voice names across the inventoried original discs.
// This examines AFS directories only; a name match does not prove audio or
// dialogue equivalence, and no files are extracted or published.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const report = JSON.parse(fs.readFileSync(path.join(root, "tests/reports/cutscene-presentation-current.json")));
const inventory = JSON.parse(fs.readFileSync(path.join(root, "tools/evidence/native-audio-bank-inventory.json")));
const roots = {
  1: process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root, "extracted_files"),
  2: process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root, "extracted_disc2_v2"),
  3: process.env.SHENMUE_DISC3_EXTRACTED_ROOT || path.join(root, "extracted_disc3_v2"),
};
const wanted = new Map();
for (const pkg of report.packages) for (const entry of pkg.unavailableVoices) {
  const key = entry.voice.toLowerCase();
  if (!wanted.has(key)) wanted.set(key, { voice: entry.voice, packages: [], matches: [] });
  wanted.get(key).packages.push(pkg.id);
}
// Positive controls from the already verified warning-letter voice pack keep
// a directory-format mistake from turning every result into a false absence.
const controls = new Map([["01cauab001", []], ["01cauaa001", []]]);
const problems = [];
const unnamedDirectories = [];
let inspected = 0;
const readExactly = (fd, length, offset) => {
  const buffer = Buffer.alloc(length);
  if (fs.readSync(fd, buffer, 0, length, offset) !== length) throw Error("short read");
  return buffer;
};
for (const entry of inventory.streamArchives) {
  const file = path.join(roots[entry.disc], "data", entry.path);
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    if (size !== entry.byteLength) throw Error("size differs from inventoried archive");
    const header = readExactly(fd, 8, 0);
    if (header.toString("ascii", 0, 4) !== "AFS\0") throw Error("not an AFS archive");
    const count = header.readUInt32LE(4);
    if (!count || count > 100000 || 8 + count * 8 > size) throw Error("invalid entry count");
    const table = readExactly(fd, count * 8, 8);
    let end = 0;
    for (let i = 0; i < count; i++) {
      const offset = table.readUInt32LE(i * 8), length = table.readUInt32LE(i * 8 + 4);
      if (offset + length > size) throw Error("entry extends past archive");
      end = Math.max(end, offset + length);
    }
    const directoryOffset = Math.ceil(end / 0x800) * 0x800;
    if (directoryOffset + count * 0x30 > size) throw Error("no in-archive name directory");
    const directory = readExactly(fd, count * 0x30, directoryOffset);
    let named = 0;
    for (let i = 0; i < count; i++) {
      const name = directory.subarray(i * 0x30, i * 0x30 + 32).toString("ascii").split("\0", 1)[0];
      if (name) named++;
      const key = name.replace(/\.str$/i, "").toLowerCase();
      const target = wanted.get(key);
      if (target && /\.str$/i.test(name)) target.matches.push({ disc: entry.disc, archive: entry.path, member: name });
      if (controls.has(key) && /\.str$/i.test(name)) controls.get(key).push({disc: entry.disc, archive: entry.path, member: name});
    }
    if (named !== count) unnamedDirectories.push({disc:entry.disc,archive:entry.path,unnamed:count-named,count});
    inspected++;
  } catch (error) {
    problems.push({ disc: entry.disc, archive: entry.path, reason: error.message });
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
console.log(JSON.stringify({
  distinctVoices: wanted.size, inventoriedArchives: inventory.streamArchives.length, inspected, problems, unnamedDirectories,
  controls: Object.fromEntries(controls),
  matches: [...wanted.values()].filter(voice => voice.matches.length),
  unmatched: [...wanted.values()].filter(voice => !voice.matches.length).map(voice => voice.voice),
}, null, 2));
if ([...controls.values()].some(matches => !matches.length)) process.exitCode = 1;
