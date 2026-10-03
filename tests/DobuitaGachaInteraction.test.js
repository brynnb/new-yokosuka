import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core";
import {
  DOBUITA_GACHA_MACHINES,
  gachaMachineTagForInspectable,
  gachaInteractionPose,
  GACHA_SOURCE_APPROACH,
} from "../src/DobuitaGachaInteraction.js";

const evidence = JSON.parse(
  fs.readFileSync("tools/evidence/d000-gacha-interaction.json", "utf8"),
);

test("approach uses the recovered local point for either machine at arbitrary placed rotations", () => {
  assert.deepEqual(GACHA_SOURCE_APPROACH, evidence.approach.sourceLocalPosition);
  for (const machine of DOBUITA_GACHA_MACHINES) {
    for (const yaw of [0, Math.PI, 0.72]) {
      const origin = new Vector3(-machine.sourcePosition[0], 0, machine.sourcePosition[2]);
      const matrix = Matrix.Compose(Vector3.One(), Quaternion.RotationAxis(Vector3.Up(), yaw), origin);
      const pose = gachaInteractionPose({ computeWorldMatrix: () => matrix });
      const local = Vector3.TransformCoordinates(pose.position, matrix.clone().invert());
      assert.ok(Math.abs(local.x + GACHA_SOURCE_APPROACH[0]) < 1e-5);
      assert.ok(Math.abs(local.z - GACHA_SOURCE_APPROACH[2]) < 1e-5);
      const forward = new Vector3(Math.sin(pose.yaw), 0, Math.cos(pose.yaw));
      const towardMachine = origin.subtract(pose.position).normalize();
      assert.ok(Vector3.Dot(forward, towardMachine) > 0.99);
    }
  }
});

test("retains the two populated native D000 gacha records", () => {
  assert.deepEqual(
    DOBUITA_GACHA_MACHINES.map((machine) => ({
      index: machine.index,
      machineTag: machine.machineTag,
      capsuleBoxTag: machine.capsuleBoxTag,
      sourcePosition: machine.sourcePosition,
      sourceYawRaw: machine.sourceYawRaw,
      componentSelector: machine.componentSelector,
      recordFlags: machine.recordFlags,
    })),
    [
      {
        index: 0,
        machineTag: "GCH0",
        capsuleBoxTag: "GBX0",
        sourcePosition: [24.5, 0, 32.15999984741211],
        sourceYawRaw: 0x8000,
        componentSelector: 4,
        recordFlags: 0x0204,
      },
      {
        index: 3,
        machineTag: "GCH3",
        capsuleBoxTag: "GBX3",
        sourcePosition: [23.75, 0, 32.15999984741211],
        sourceYawRaw: 0x8000,
        componentSelector: 2,
        recordFlags: 0x0302,
      },
    ],
  );
});

test("maps either the machine or its owned capsule box to one interaction", () => {
  assert.equal(
    gachaMachineTagForInspectable({ objectTag: "GCH0" }),
    "GCH0",
  );
  assert.equal(
    gachaMachineTagForInspectable({
      objectTag: "GBX3",
      parentObjectTag: "GCH3",
    }),
    "GCH3",
  );
  assert.equal(
    gachaMachineTagForInspectable({
      objectTag: "GBX3",
      parentObjectTag: "GCH0",
    }),
    null,
  );
});

test("retains the statically recovered native prize and payment tables", () => {
  assert.equal(evidence.status, "verified");
  assert.deepEqual(
    evidence.prizeLookup.poolLengthTable.values,
    [12, 17, 22, 10, 19, 18, 11, 8, 4, 4, 17, 7, 6, 5, 4, 4],
  );
  assert.deepEqual(
    evidence.prizeLookup.selectionSplitTable.values,
    [12, 1, 2, 1, 3, 2, 2, 8, 4, 4, 17, 7, 6, 5, 4, 4],
  );
  assert.equal(evidence.prizeLookup.categories.length, 16);
  assert.equal(evidence.prizeLookup.categories[10].lookupValues[9], "0x0");
  assert.equal(
    evidence.prizeLookup.physicalMachineToCategoryFlow
      .selectorRead.callFileOffset,
    "0x56ef2",
  );
  assert.equal(evidence.prizeLookup.paymentFlow.currencySelector, 2);
  assert.equal(evidence.prizeLookup.paymentFlow.priceYen, 100);
});
