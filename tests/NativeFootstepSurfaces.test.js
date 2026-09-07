import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import actorProperties from "../play/data/native-actor-footstep-properties.json" with {
  type: "json",
};
import {
  decodeNativeSurfaceCode,
  parseNativeFootstepSurfaces,
} from "../tools/lib/native-footstep-surfaces.mjs";
import {
  nativeActorFootstepSurfaceIndex,
  nativeFootstepSurfaceIndexAt,
} from "../play/audio/NativeFootstepSurfaceResolver.js";

test("decodes the executable's priority, STEP remainder, and filters", () => {
  assert.deepEqual(decodeNativeSurfaceCode(0x03f7), {
    surfaceIndex: 15,
    priority: 10,
    flags: 0,
    suppressed: true,
  });
  assert.deepEqual(decodeNativeSurfaceCode(0x07da), {
    surfaceIndex: 10,
    priority: 20,
    flags: 0,
    suppressed: false,
  });
});

test("parses D000's static SOND records and spatial grid", () => {
  const bytes = readFileSync(
    "extracted_files/data/SCENE/01/"
      + "D000/MAPINFO.BIN",
  );
  const parsed = parseNativeFootstepSurfaces(bytes);
  const grid = parsed.grids.find(({ cellCount }) => cellCount === 256);
  assert.ok(grid);
  assert.equal(grid.sectionOffset, 0xc5c1c);
  assert.equal(grid.gridOffset, 0xcf784);
  assert.equal(grid.records.length, 311);
  assert.deepEqual(
    Object.fromEntries(
      [...new Set(grid.records.map(({ surfaceIndex }) => surfaceIndex))]
        .sort((a, b) => a - b)
        .map((surfaceIndex) => [
          surfaceIndex,
          grid.records.filter((record) => (
            record.surfaceIndex === surfaceIndex
          )).length,
        ]),
    ),
    { 10: 2, 11: 2, 13: 11, 15: 144, 17: 69, 20: 83 },
  );
  assert.deepEqual(
    grid.records.find(({ recordOffset }) => recordOffset === 8).geometry,
    {
      kind: "polygon",
      vertices: [
        [-60.376033782958984, -83.76907348632812],
        [-58.345367431640625, -83.55778503417969],
        [-57.80387496948242, -89.689208984375],
        [-57.922874450683594, -89.87920379638672],
        [-60.37704086303711, -89.87920379638672],
      ],
    },
  );
});

test("resolves browser positions through the native reversed-Z grid", () => {
  assert.equal(nativeFootstepSurfaceIndexAt({
    area: "D000",
    browserX: 64.87008857727051,
    browserZ: 62.61539840698242,
  }), 17);
  assert.equal(nativeFootstepSurfaceIndexAt({
    area: "D000",
    browserX: 71.360329,
    browserZ: 80.250008,
  }), 17);
  assert.equal(nativeFootstepSurfaceIndexAt({
    area: "unknown",
    browserX: 0,
    browserZ: 0,
  }), 0);
});

test("uses the current area's captured actor STEP property when material lookup returns zero", () => {
  assert.equal(nativeActorFootstepSurfaceIndex({
    area: "MFSY",
    actorTag: "AKIR",
  }), 0);
  assert.equal(nativeActorFootstepSurfaceIndex({
    area: "JOMO",
    actorTag: "AKIR",
  }), 3);
  assert.equal(nativeActorFootstepSurfaceIndex({
    area: "MFSY",
    actorTag: "unknown",
  }), null);

  // Every MFSY record at this captured Ryo position has a STEP remainder
  // filtered by FUN_0c0b3986, so FUN_0c17bb14 must use AKIR's STEP value.
  assert.equal(nativeFootstepSurfaceIndexAt({
    area: "MFSY",
    actorTag: "AKIR",
    browserX: 114.00789642333984,
    browserZ: 134.16819763183594,
  }), 0);
  assert.equal(nativeFootstepSurfaceIndexAt({
    area: "MFSY",
    browserX: 114.00789642333984,
    browserZ: 134.16819763183594,
  }), 0);
});

const actorPropertyCapturesAvailable = Object.values(actorProperties.actors)
  .flatMap(({ areas }) => Object.values(areas))
  .every(({ evidence }) => existsSync(evidence.capture));

test("pins actor STEP values to the exact live property bytes", {
  skip: !actorPropertyCapturesAvailable,
}, () => {
  for (const { areas } of Object.values(actorProperties.actors)) {
    for (const property of Object.values(areas)) {
      const { evidence } = property;
      const ram = readFileSync(evidence.capture);
      assert.equal(
        createHash("sha256").update(ram).digest("hex"),
        evidence.captureSha256,
      );
      const actorAddress = Number.parseInt(evidence.actorAddress, 16);
      const rootFieldAddress = Number.parseInt(
        evidence.propertyRootFieldAddress,
        16,
      );
      const nodeAddress = Number.parseInt(evidence.propertyNodeAddress, 16);
      assert.equal(rootFieldAddress, actorAddress + 0x9c);
      assert.equal(
        ram.readUInt32LE(rootFieldAddress & 0x00ffffff),
        nodeAddress & 0x0fffffff,
      );
      assert.equal(
        ram.toString(
          "hex",
          (nodeAddress + 0x20) & 0x00ffffff,
          (nodeAddress + 0x24) & 0x00ffffff,
        ),
        evidence.propertyBytes,
      );
      assert.equal(property.enabled, true);
      assert.equal(Number.parseInt(evidence.propertyBytes.slice(2, 4), 16), 1);
      assert.equal(
        Number.parseInt(evidence.propertyBytes.slice(4, 6), 16),
        property.surfaceIndex,
      );
    }
  }
});
