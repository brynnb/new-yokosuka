import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  actorCaptureRequest,
  missingProfileActorCodes,
  multiActorCaptureRequest,
  shenmue2ActorRecordCandidates,
} from "../tools/emulator/request_shenmue2_animation_actor_capture.mjs";

const ramPath = new URL(
  "../captures/pvr/20260802-slot2-save/ram.bin",
  import.meta.url,
);

test("S2 actor watcher derives capture-local records from an exact code", (t) => {
  if (!fs.existsSync(ramPath)) {
    t.skip("requires the retained local S2 slot-2 RAM image");
    return;
  }
  const addresses = shenmue2ActorRecordCandidates(
    fs.readFileSync(ramPath),
    "04F_",
  );
  assert.ok(addresses.includes(0x8cc2cdd8));
  assert.ok(addresses.every((address) => address >= 0x8c700000));
  assert.ok(addresses.every((address) => (address & 3) === 0));
});

test("S2 actor watcher excludes executable strings and unaligned heap bytes", () => {
  const ram = Buffer.alloc(0x01000000);
  ram.write("04F_", 0x003d58d8, "ascii");
  ram.write("04F_", 0x00c2cdd8, "ascii");
  ram.write("04F_", 0x00c2ce6d, "ascii");
  assert.deepEqual(shenmue2ActorRecordCandidates(ram, "04F_"), [
    0x8cc2cdd8,
  ]);
});

test("S2 actor watcher request preserves exact validation candidates", () => {
  assert.equal(actorCaptureRequest({
    actorCode: "04F_",
    addresses: [0x8cc2cdd8, 0x8cc2ce6c],
    captures: 8,
    spacing: 10,
    timeout: 900,
    acquisitionTask: 0x8c44e120,
  }), [
    "actor 04F_",
    "address 0x8cc2cdd8",
    "address 0x8cc2ce6c",
    "captures 8",
    "spacing 10",
    "timeout 900",
    "acquisition-task 0x8c44e120",
    "",
  ].join("\n"));
});

test("S2 actor watcher can arm several exact native identities at once", () => {
  assert.equal(multiActorCaptureRequest({
    targets: [
      { actorCode: "04F_", addresses: [0x8cc2cdd8] },
      { actorCode: "JUK_", addresses: [0x8cc310c8, 0x8cc31100] },
      { actorCode: "SIN_", addresses: [] },
    ],
    captures: 4,
    spacing: 9,
    timeout: 1200,
    acquisitionTask: 0x8c44e120,
  }), [
    "target 04F_ 0x8cc2cdd8",
    "target JUK_ 0x8cc310c8",
    "target JUK_ 0x8cc31100",
    "captures 4",
    "spacing 9",
    "timeout 1200",
    "acquisition-task 0x8c44e120",
    "",
  ].join("\n"));
});

test("S2 missing-profile collector uses every exact actor alias once", () => {
  assert.deepEqual(missingProfileActorCodes({
    missingNativeProfileCaptureTargets: [
      { actorCodes: ["04F_", "RRN_"] },
      { actorCodes: ["JUK_"] },
      { actorCodes: ["04F_"] },
    ],
  }), ["04F_", "RRN_", "JUK_"]);
});
