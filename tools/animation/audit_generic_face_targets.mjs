#!/usr/bin/env node
// Reproduce the native target-order evidence without rendering or modifying assets.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const output = "tools/evidence/generic-face-target-order.json";
const executable = ".disc-work/exact/1ST_READ.BIN";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const expected = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c";
const binary = readFileSync(executable);
if (hash(binary) !== expected) throw new Error("Native executable identity changed");
const functions = [
  ["selectSourceChild", 0x0c0ac83c, 130, "7377848f12665d867e30a0f3aeca73b1aadca304ee2d82f148ffa5de92d488fb"],
  ["restoreOriginalVertices", 0x0c0ac3c0, 86, "20dd26f3fb651b8ba60e371a20f1087ccb522ec390221d0d0b176f6130dacb71"],
  ["beginTargetTransition", 0x0c0ac416, 256, "738f8300f0d559a8a4700309c150118effec5a2ec2787b43aa74bd7a173f45e5"],
  ["genericSpeechUpdate", 0x0c0ac8e2, 510, "8a0793422faf9b9e459a4a5c96f8c94794f29ba6026c19282df49ab28fe978cd"],
].map(([name, address, length, sha256]) => {
  if (hash(binary.subarray(address - 0x0c010000, address - 0x0c010000 + length)) !== sha256) {
    throw new Error(`Native function changed: ${name}`);
  }
  return { name, address: `0x${address.toString(16)}`, length, sha256 };
});

function modelNodes(bytes) {
  const nodes = new Map();
  function visit(addr) {
    if (!addr || nodes.has(addr)) return;
    const model = bytes.readUInt32LE(addr + 4);
    const node = { addr, key: bytes.readInt16LE(addr), parent: bytes.readUInt32LE(addr + 52),
      child: bytes.readUInt32LE(addr + 44), sibling: bytes.readUInt32LE(addr + 48) };
    if (model) {
      node.vertex = bytes.readUInt32LE(model + 4);
      node.count = bytes.readUInt32LE(model + 8);
    }
    nodes.set(addr, node); visit(node.child); visit(node.sibling);
  }
  visit(bytes.readUInt32LE(8));
  return nodes;
}
function maximumDifference(bytes, first, second) {
  let maximum = 0;
  for (let i = 0; i < first.count; i++) for (let axis = 0; axis < 3; axis++) {
    maximum = Math.max(maximum, Math.abs(bytes.readFloatLE(first.vertex + i * 24 + axis * 4)
      - bytes.readFloatLE(second.vertex + i * 24 + axis * 4)));
  }
  return maximum;
}
const corpus = { bodies: 0, nativePairs: 0, restMatchesFirst: 0, restMatchesSecond: 0,
  restMatchesNeither: 0, exceptions: [], withoutPair: [] };
for (const file of readdirSync("play/assets/characters").filter(f => /_(L|M)\.CHRM$/.test(f)).sort()) {
  const bytes = readFileSync(`play/assets/characters/${file}`), nodes = modelNodes(bytes);
  corpus.bodies++;
  const patches = [...nodes.values()].filter(n => n.key === -68 && n.count > 0);
  const destinations = patches.filter(n => n.parent), sources = patches.filter(n => !n.parent);
  const heads = [...nodes.values()].filter(n => n.key === -67 && sources.some(s => s.addr === n.child));
  const closed = heads.length === 1 ? nodes.get(heads[0].child) : null;
  const open = closed ? nodes.get(closed.sibling) : null;
  const destination = destinations[0];
  if (destinations.length !== 1 || sources.length !== 2 || !sources.includes(open)
    || open.sibling || closed.child || open.child || closed.count !== destination.count
    || open.count !== destination.count) {
    corpus.withoutPair.push(file); continue;
  }
  corpus.nativePairs++;
  const first = maximumDifference(bytes, destination, closed);
  const second = maximumDifference(bytes, destination, open);
  if (first <= 1.1e-6) corpus.restMatchesFirst++;
  else {
    if (second <= 1.1e-6) corpus.restMatchesSecond++;
    else corpus.restMatchesNeither++;
    corpus.exceptions.push({ file, sha256: hash(bytes), vertices: destination.count,
      destination: destination.addr, closed: closed.addr, open: open.addr,
      maximumRestToClosedDifference: first, maximumRestToOpenDifference: second });
  }
}
const report = { schema: "new-yokosuka-generic-face-target-order-v1",
  producer: "tools/animation/audit_generic_face_targets.mjs",
  source: { executable, sha256: expected, functions },
  interpretation: [
    "SH-4 selector 0x0c0ac83c takes child zero at node +0x2c, then follows +0x30 siblings by the requested index. Runtime pointers correspond to HRCM child/sibling offsets 44/48.",
    "0x0c0ac8e2 selects marker -67 and source index 0 for silence/closing; speech alternates indices 0 and 1. It finds the attached destination by marker -68 independently. No coordinate-similarity search occurs.",
    "0x0c0ac416 reads the selected node's model +4 vertex pointer and blends current destination vertices toward those source positions; 0x0c0ac3c0 restores the saved original destination vertex pointer at completion.",
    "The browser supports an unambiguous two-child source container. More complex/malformed structures remain unresolved. Prepared bind-space welding is preserved by transforming source-minus-destination displacements.",
    "Corpus counts are structural coverage, not rendered verification. Original binary functions were cross-checked against the existing SH-4 instruction listing, not assumed from decompiled floating-point pseudocode.",
  ], corpus };
const json = JSON.stringify(report, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== json) throw new Error("Generic face evidence is stale");
} else writeFileSync(output, json);
console.log(`${corpus.nativePairs}/${corpus.bodies} native pairs; ${corpus.restMatchesNeither} nonmatching rests; ${corpus.restMatchesSecond} rests match source 1`);
