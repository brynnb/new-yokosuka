import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { test } from "node:test";
import manifest from "../play/data/shenmue1-scheduled-scene-objects.json" with {
  type: "json",
};
import {
  ScheduledSceneObjectState,
} from "../play/world/ScheduledSceneObjectState.js";

function at(hour, minute = 0, second = 0) {
  return new Date(Date.UTC(1986, 5, 9, hour, minute, second));
}

function machineFor(code) {
  const world = manifest.worlds.find((candidate) => (
    candidate.worldId === "dobuita"
  ));
  const definition = world.sceneObjects.find(
    (candidate) => candidate.code === code,
  );
  return {
    definition,
    machine: new ScheduledSceneObjectState([definition]),
  };
}

test("Dobuita scheduled scene-object evidence maps all sixteen roll doors", () => {
  const definitions = manifest.worlds[0].sceneObjects;
  assert.equal(manifest.summary.reviewedSceneObjectCount, 16);
  assert.equal(manifest.summary.scheduledOperationCount, 41);
  assert.equal(manifest.summary.assignedScheduledOperationCount, 41);
  assert.deepEqual(
    definitions.map((definition) => definition.code),
    Array.from(
      { length: 16 },
      (_, index) => `BS${String(index + 1).padStart(2, "0")}`,
    ),
  );
  for (const [index, definition] of definitions.entries()) {
    const number = String(index + 1).padStart(2, "0");
    assert.equal(definition.model, `S1_D000_DBS99${number}G.MT5`);
    assert.ok(definition.upperY > definition.lowerY);
    assert.equal(definition.motion.axis, "y");
    assert.equal(definition.motion.unitsPerSecond, 0.3);
    assert.ok(definition.events.some((event) => event.controlValue === 0));
    assert.ok(definition.events.some((event) => event.controlValue === 1));
  }
  const scheduleBytes = fs.readFileSync("play/data/scheduled-actors.json");
  assert.equal(
    crypto.createHash("sha256").update(scheduleBytes).digest("hex"),
    manifest.generatedFrom.schedules.sha256,
  );
  const modelCatalog = new Set(JSON.parse(fs.readFileSync(
    "public/models.json",
    "utf8",
  )));
  for (const definition of definitions) {
    assert.equal(modelCatalog.has(definition.model), true);
  }
});

test("BS14 begins opening exactly at 08:30 and uses native real-time speed", () => {
  const { definition, machine } = machineFor("BS14");
  const id = definition.id;
  machine.synchronize(at(8, 29, 59), { snap: true });
  assert.deepEqual(machine.stateFor(id), {
    id,
    code: "BS14",
    axis: "y",
    currentValue: definition.lowerY,
    targetValue: definition.lowerY,
    controlValue: 1,
    status: "closed",
  });

  machine.update(at(8, 30, 0), 1 / 60);
  assert.equal(machine.stateFor(id).currentValue, definition.lowerY);
  assert.equal(machine.stateFor(id).targetValue, definition.upperY);
  assert.equal(machine.stateFor(id).status, "opening");

  machine.update(at(8, 30, 1), 1);
  assert.ok(Math.abs(
    machine.stateFor(id).currentValue - (definition.lowerY + 0.3),
  ) < 1e-6);
});

test("BS14 remains open immediately before close and descends at 18:15", () => {
  const { definition, machine } = machineFor("BS14");
  const id = definition.id;
  machine.synchronize(at(18, 14, 59), { snap: true });
  assert.equal(machine.stateFor(id).currentValue, definition.upperY);
  assert.equal(machine.stateFor(id).status, "open");

  machine.update(at(18, 15, 0), 1 / 60);
  assert.equal(machine.stateFor(id).currentValue, definition.upperY);
  assert.equal(machine.stateFor(id).targetValue, definition.lowerY);
  assert.equal(machine.stateFor(id).status, "closing");

  machine.update(at(18, 15, 1), 1);
  assert.ok(Math.abs(
    machine.stateFor(id).currentValue - (definition.upperY - 0.3),
  ) < 1e-6);
});

test("late joins and stale clock corrections snap to the current endpoint", () => {
  const { definition, machine } = machineFor("BS14");
  const id = definition.id;
  machine.synchronize(at(18, 15, 0), { snap: true });
  assert.equal(machine.stateFor(id).currentValue, definition.lowerY);
  assert.equal(machine.stateFor(id).status, "closed");

  machine.synchronize(at(18, 14, 59), { snap: true });
  machine.update(at(18, 17, 1), 1 / 60);
  assert.equal(machine.stateFor(id).currentValue, definition.lowerY);
  assert.equal(machine.stateFor(id).status, "closed");
});

test("reviewed schedule variants can select a different shutter window", () => {
  const { definition, machine } = machineFor("BS02");
  const id = definition.id;
  machine.synchronize(at(19, 0), { snap: true });
  assert.equal(machine.stateFor(id).currentValue, definition.upperY);

  machine.setScheduleVariants(new Map([[
    "ETKO",
    "972e68b16cd4:source-table-0x12d18",
  ]]), at(19, 0));
  assert.equal(machine.stateFor(id).currentValue, definition.lowerY);
  assert.equal(machine.stateFor(id).status, "closed");
});

test("overnight rollover snaps instead of replaying unattended transitions", () => {
  const { definition, machine } = machineFor("BS14");
  const id = definition.id;
  machine.synchronize(at(23, 0), { snap: true });
  assert.equal(machine.stateFor(id).currentValue, definition.lowerY);
  const nextMorning = new Date(Date.UTC(1986, 5, 10, 8, 30));
  machine.update(nextMorning, 1 / 60);
  assert.equal(machine.stateFor(id).currentValue, definition.upperY);
  assert.equal(machine.stateFor(id).status, "open");
});

test("backward debug clock changes snap to authoritative current state", () => {
  const { definition, machine } = machineFor("BS14");
  const id = definition.id;
  machine.synchronize(at(19, 0), { snap: true });
  assert.equal(machine.stateFor(id).status, "closed");

  machine.update(at(12, 0), 1 / 60);
  assert.equal(machine.stateFor(id).currentValue, definition.upperY);
  assert.equal(machine.stateFor(id).targetValue, definition.upperY);
  assert.equal(machine.stateFor(id).status, "open");
});

test("state machine supports reviewed movement axes other than Y", () => {
  const definition = {
    id: "TEST:SH01",
    code: "SH01",
    motion: {
      axis: "x",
      controlTargets: { 0: 4, 1: 1 },
      controlStates: { 0: "open", 1: "closed" },
      transitionStates: { 0: "opening", 1: "closing" },
      unitsPerSecond: 2,
    },
    events: [
      {
        actorCode: "TEST",
        scheduleVariantId: "default",
        defaultVariant: true,
        second: 8 * 60 * 60,
        controlValue: 0,
      },
      {
        actorCode: "TEST",
        scheduleVariantId: "default",
        defaultVariant: true,
        second: 18 * 60 * 60,
        controlValue: 1,
      },
    ],
  };
  const machine = new ScheduledSceneObjectState([definition]);
  machine.synchronize(at(7, 59, 59), { snap: true });
  machine.update(at(8), 1 / 60);
  assert.equal(machine.stateFor(definition.id).axis, "x");
  assert.equal(machine.stateFor(definition.id).status, "opening");
  machine.update(at(8, 0, 1), 0.5);
  assert.equal(machine.stateFor(definition.id).currentValue, 2);
});
