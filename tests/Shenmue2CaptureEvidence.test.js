import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  shenmue2RamCaptureTiming,
  shenmue2RamSupportsPoseConformance,
} from "../tools/lib/Shenmue2CaptureEvidence.js";

test("S2 pose conformance admits completed PVR frames only", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "s2-capture-evidence-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ramPath = path.join(root, "ram.bin");
  fs.writeFileSync(ramPath, Buffer.alloc(0));
  fs.writeFileSync(path.join(root, "frame.json"), JSON.stringify({
    schema: "flycast-pvr-frame-v2",
    ramSize: 0x01000000,
  }));
  assert.equal(shenmue2RamCaptureTiming(ramPath), "synchronized-pvr-frame");
  assert.equal(shenmue2RamSupportsPoseConformance(ramPath), true);
});

test("offline Flycast state RAM remains discovery-only", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "s2-capture-evidence-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ramPath = path.join(root, "ram.bin");
  fs.writeFileSync(ramPath, Buffer.alloc(0));
  fs.writeFileSync(path.join(root, "savestate-ram.json"), JSON.stringify({
    schema: "new-yokosuka-flycast-savestate-ram-v1",
  }));
  assert.equal(shenmue2RamCaptureTiming(ramPath), "offline-savestate-ram");
  assert.equal(shenmue2RamSupportsPoseConformance(ramPath), false);
});
