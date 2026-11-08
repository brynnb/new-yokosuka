import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { evaluateAuthActor, parseAuthMovement } from "../src/AuthMovement.js";

import mfsy from "../play/data/mfsy-runtime-placements.json" with {
  type: "json",
};
import mksg from "../play/data/mksg-runtime-placements.json" with {
  type: "json",
};
import ms08 from "../play/data/ms08-runtime-placements.json" with {
  type: "json",
};

function assertFinitePlacements(manifest) {
  for (const placement of manifest.placements) {
    assert.ok(placement.position.every(Number.isFinite));
    assert.ok(placement.rotationDegrees.every(Number.isFinite));
    assert.ok(
      placement.scale.every(
        (value) => Number.isFinite(value) && value > 0,
      ),
    );
  }
}

test("New Yokosuka Harbor combines live props and all static doors", () => {
  assert.equal(mfsy.area, "MFSY");
  assert.equal(mfsy.placements.length, 49);
  assert.equal(
    mfsy.placements.filter(
      (placement) => placement.runtime.placementSource === "runtime-task",
    ).length,
    22,
  );
  assert.deepEqual(
    mfsy.placements
      .filter(
        (placement) => (
          placement.runtime.placementSource === "mapinfo-static-door-table"
        ),
      )
      .map((placement) => placement.runtime.staticDoorIndex),
    Array.from({ length: 27 }, (_, index) => index),
  );
  assert.ok(mfsy.placements.some(
    (placement) => placement.runtime.objectTag === "TOMD",
  ));
  assertFinitePlacements(mfsy);
});

test("Goro appointment reference tracks remain still near existing harbor placements", {
  skip: !existsSync(new URL("../play/assets/harbor/goro-job-appointment/SEQDATA0.AUTH", import.meta.url))
    && "requires the locally extracted original AUTH",
}, () => {
  const movement = parseAuthMovement(readFileSync(new URL("../play/assets/harbor/goro-job-appointment/SEQDATA0.AUTH", import.meta.url)));
  const candidates = [
    ["HAKO", mfsy.placements.find(p=>p.runtime.objectTag==="GHAK"), 0.001],
    ["DOOR", mfsy.placements.find(p=>p.runtime.staticDoorIndex===14), 0.04],
  ];
  for (const [tag, placement, maxDistance] of candidates) {
    assert.ok(placement,tag);
    const actor=movement.actors.find(value=>value.tag===tag), start=evaluateAuthActor(actor,0);
    assert.ok(Math.hypot(-start.x-placement.position[0],start.z-placement.position[2])<maxDistance,tag);
    assert.ok(Math.abs(-start.rotationY-placement.rotationDegrees[1])<0.001,tag);
    for(let frame=1;frame<1960;frame++){
      const current=evaluateAuthActor(actor,frame);
      for(const key of ["x","y","z","rotationX","rotationY","rotationZ"])
        assert.ok(Math.abs(current[key]-start[key])<0.0001,`${tag} ${key} frame ${frame}`);
    }
  }
  const box=candidates[0][1], boxTrack=evaluateAuthActor(movement.actors.find(a=>a.tag==="HAKO"),0);
  assert.ok(Math.abs(boxTrack.y*box.scale[1]-box.position[1])<0.0001);
});

test("Old Warehouse District retains props but not frozen guard actors", () => {
  assert.equal(mksg.area, "MKSG");
  assert.equal(mksg.placements.length, 19);
  assert.ok(mksg.placements.some(
    (placement) => placement.runtime.objectTag === "TEL_",
  ));
  assert.ok(mksg.placements.some(
    (placement) => placement.runtime.objectTag === "HAKO",
  ));
  assert.ok(!mksg.placements.some(
    (placement) => /^KEB|^LIG/.test(placement.runtime.objectTag || ""),
  ));
  const doors = mksg.placements.filter(
    (placement) => placement.runtime.placementSource === "runtime-hmdl-instance",
  );
  assert.equal(doors.length, 10);
  assert.deepEqual(
    doors.map((placement) => placement.runtime.runtimeDoorIndex),
    Array.from({ length: 10 }, (_, index) => index),
  );
  assert.ok(doors.some((placement) => (
    placement.runtime.objectTag === "dor8"
    && placement.model === "S2_MKSG_DR02_021.MT5"
    && Math.abs(placement.position[0] - 66.60260009765625) < 1e-9
    && Math.abs(placement.position[2] + 4.110569953918457) < 1e-9
  )));
  assertFinitePlacements(mksg);
});

test("Old Warehouse No. 8 retains its exact MAPINFO entrance door", () => {
  assert.equal(ms08.area, "MS08");
  assert.equal(ms08.placements.length, 1);
  assert.deepEqual(ms08.placements[0], {
    id: "static-door-0",
    model: "S2_MS08_DR02_021.MT5",
    position: [27.059999465942383, 0, -1.7999999523162842],
    rotationDegrees: [0, 90, 0],
    scale: [1, 1, 1],
    runtime: {
      objectTag: "dor0",
      staticDoorIndex: 0,
      staticDoorType: 2,
      staticSourceOffset: "0x2b0bc",
      placementSource: "mapinfo-door-record",
    },
  });
  assertFinitePlacements(ms08);
});
