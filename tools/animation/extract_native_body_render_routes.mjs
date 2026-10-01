#!/usr/bin/env node
// Read native node +0x38 matrix pointers, not just calls at one render-copy site.
// Run with scripts/testing/run-tests.mjs script for a bounded, serial RAM audit.
import fs from "node:fs";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name} value`);
  args.splice(index, 2);
  return value;
};
const output = option("--out", null);
const matrixBase = Number(option("--matrix-base", "0x8cc06e80"));
const controlsBase = Number(option("--controls-base", "0x8cc05820"));
const count = Number(option("--count", "37"));
if (!args.length) throw new Error("Usage: extract_native_body_render_routes.mjs ram.bin [...] [--matrix-base address] [--controls-base address] [--count 37] [--out evidence.json]");
const hex = n => `0x${(n >>> 0).toString(16).padStart(8, "0")}`;
const offset = n => n & 0x00ffffff;
const matrixOffset = offset(matrixBase);
const controlsOffset = offset(controlsBase);
if (!Number.isInteger(count) || count < 1 || count > 128) throw new Error("Invalid controller count");

const captures = args.map(file => {
  const ram = fs.readFileSync(file);
  const pointer = (address, size = 4) => {
    const normalized = address & 0x1fffffff;
    const at = normalized - 0x0c000000;
    if (at < 0 || at + size > ram.length) throw new Error(`Invalid RAM pointer ${hex(address)}`);
    return at;
  };
  pointer(matrixBase, count * 64);
  pointer(controlsBase, count * 72);
  const types = [];
  for (let i = 0; i < count; i++) {
    const control = controlsOffset + i * 72;
    if (pointer(ram.readUInt32LE(control + 68), 64) !== matrixOffset + i * 64) {
      throw new Error(`${file}: controller ${i} does not point to its own final matrix`);
    }
    types.push(ram.readUInt8(control));
    for (let j = 0; j < 16; j++) {
      if (!Number.isFinite(ram.readFloatLE(matrixOffset + i * 64 + j * 4))) {
        throw new Error(`${file}: nonfinite controller matrix ${i}`);
      }
    }
  }
  // The active body is distinguished from the controller's own render tree
  // (flags 1) and inert resource copies (+0x38 = 0) by both flags and pointer.
  const roots = [];
  for (let at = 0; at + 64 <= ram.length; at += 4) {
    if (ram.readUInt32LE(at) === 0x40001
      && offset(ram.readUInt32LE(at + 56)) === matrixOffset + 19 * 64) roots.push(at);
  }
  if (roots.length !== 1) throw new Error(`${file}: expected one active body, found ${roots.length}`);
  const nodes = [], seen = new Set();
  const visit = at => {
    if (seen.has(at)) throw new Error(`${file}: cyclic native body hierarchy`);
    seen.add(at);
    const key = ram.readInt16LE(at);
    const matrixPointer = ram.readUInt32LE(at + 56);
    if (matrixPointer) {
      const matrixAddress = pointer(matrixPointer, 64);
      const index = (matrixAddress - matrixOffset) / 64;
      if (!Number.isInteger(index) || index < 0 || index >= count) {
        throw new Error(`${file}: render key ${key} points outside controller matrices`);
      }
      nodes.push({ nodeAddress: hex(0x0c000000 + at), renderKey: key,
        matrixPointer: hex(matrixPointer), controllerIndex: index, controllerType: types[index] });
    }
    for (const field of [44, 48]) {
      const child = ram.readUInt32LE(at + field);
      if (child) visit(pointer(child, 64));
    }
  };
  visit(roots[0]);
  return { file, sha256: createHash("sha256").update(ram).digest("hex"),
    bodyRoot: hex(0x0c000000 + roots[0]), visitedNodeCount: seen.size,
    routes: nodes.sort((a, b) => a.renderKey - b.renderKey) };
});
const routes = captures[0].routes.map(n => [n.renderKey, n.controllerIndex]);
for (const capture of captures) {
  if (JSON.stringify(capture.routes.map(n => [n.renderKey, n.controllerIndex])) !== JSON.stringify(routes)) {
    throw new Error(`${capture.file}: native route observations disagree`);
  }
}
const report = { schema: "native-body-render-routes-v1", matrixBase: hex(matrixBase),
  controlsBase: hex(controlsBase), controllerCount: count, routes, captures };
const json = `${JSON.stringify(report, null, 2)}\n`;
if (output) fs.writeFileSync(output, json);
else process.stdout.write(json);
