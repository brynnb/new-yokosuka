import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import {
  NativeAseqSceneObjectRuntime,
} from "../play/events/NativeAseqSceneObjectRuntime.js";

test("AUTH scene objects bind exact world roots and restore track visibility", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const car = new BABYLON.TransformNode("car", scene);
    car._filename = "S1_OP00_BMWS703G.MT5";
    car.position.set(7, 8, 9);
    const door = new BABYLON.TransformNode("door", scene);
    door._filename = "S1_OP00_DDRR1001.MT5";
    const runtime = new NativeAseqSceneObjectRuntime({
      definitions: {
        RMJN: {
          model: "BMWS703G",
          browserFilename: "S1_OP00_BMWS703G.MT5",
        },
        ODR2: {
          model: "DDRR1001",
          browserFilename: "S1_OP00_DDRR1001.MT5",
        },
      },
    });

    assert.equal(await runtime.load([car, door]), 2);
    assert.equal(car.isEnabled(), false);
    assert.equal(door.isEnabled(), false);

    const owner = {};
    assert.deepEqual(
      runtime.begin(owner, ["RMJN"]).map(record => record.actorCode),
      ["RMJN"],
    );
    assert.equal(car.isEnabled(), false);
    assert.equal(door.isEnabled(), false);
    assert.equal(runtime.activate(owner, "RMJN"), true);
    assert.equal(car.isEnabled(), true);
    car.position.set(1, 2, 3);

    assert.equal(runtime.end(owner), true);
    assert.equal(car.isEnabled(), false);
    assert.deepEqual(car.position.asArray(), [7, 8, 9]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH scene objects fail closed when an exact generated root is missing", async () => {
  const runtime = new NativeAseqSceneObjectRuntime({
    definitions: {
      KNBS: {
        model: "YUKS502G",
        browserFilename: "S1_OP00_YUKS502G.MT5",
      },
    },
  });
  await assert.rejects(
    runtime.load([]),
    /expected one S1_OP00_YUKS502G\.MT5; found 0/,
  );
});

test("package scene objects retain an explicit exact texture asset", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    let requested = null;
    const runtime = new NativeAseqSceneObjectRuntime({
      definitions: {
        MIRR: {
          model: "PNX02M6G",
          browserFilename: "PNX02M6G.CHRM",
          assetPath: "hazuki/houo/PNX02M6G.CHRM",
          textureAssetPath: "hazuki/houo/HOUO_textures.bin",
        },
      },
      instantiateAsset: async (definition) => {
        requested = definition;
        const mirror = new BABYLON.TransformNode("mirror", scene);
        mirror._filename = definition.browserFilename;
        return [mirror];
      },
    });
    assert.equal(await runtime.load([]), 1);
    assert.equal(requested.textureAssetPath, "hazuki/houo/HOUO_textures.bin");
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("persistent AUTH fixtures restore generated presentation between activities", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const door = new BABYLON.TransformNode("door", scene);
    door._filename = "S1_OP00_DDRR1002.MT5";
    const runtime = new NativeAseqSceneObjectRuntime({
      definitions: {
        ODR1: {
          model: "DDRR1002",
          browserFilename: "S1_OP00_DDRR1002.MT5",
          initialPresentation: {
            position: [-2.361, 1.06, -21.4349],
            rotationDegrees: [0, 0, 0],
            scale: [1, 1, 1],
          },
          lifecycle: { kind: "room-script-persistent" },
        },
      },
    });

    await runtime.load([door]);
    assert.equal(door.isEnabled(), false);
    assert.equal(runtime.prepareActivity({
      activityId: "OP00/SEQDATA2.AUTH",
      nativeSceneObjectStates: [{ actorTag: "ODR1", presented: true }],
    }), true);
    assert.equal(door.isEnabled(), true);
    assert.deepEqual(door.position.asArray(), [2.361, 1.06, -21.4349]);

    const owner = {};
    runtime.begin(owner, ["ODR1"]);
    runtime.activate(owner, "ODR1");
    door.position.set(10, 20, 30);
    assert.equal(runtime.end(owner), true);
    assert.equal(door.isEnabled(), true);
    assert.deepEqual(door.position.asArray(), [2.361, 1.06, -21.4349]);

    runtime.prepareActivity({
      activityId: "OP00/SEQDATA1.AUTH",
      nativeSceneObjectStates: [{ actorTag: "ODR1", presented: false }],
    });
    assert.equal(door.isEnabled(), false);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("composite scene objects support a program lease around AUTH subleases", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const box = new BABYLON.TransformNode("box", scene);
    box._filename = "S1_JU00_DANM400G.MT5";
    box.position.set(1, 2, 3);
    const runtime = new NativeAseqSceneObjectRuntime({
      definitions: {
        NBOX: {
          model: "DANM400G",
          browserFilename: "S1_JU00_DANM400G.MT5",
          lifecycle: { kind: "native-composite-owner" },
        },
      },
    });

    await runtime.load([box]);
    assert.deepEqual([...runtime.compositeActorTags], ["NBOX"]);
    const programOwner = {};
    const activityOwner = {};
    assert.deepEqual(runtime.beginProgram(programOwner).map(
      record => record.actorCode,
    ), ["NBOX"]);

    box.setEnabled(true);
    box.position.set(4, 5, 6);
    runtime.begin(activityOwner, ["NBOX"]);
    runtime.activate(activityOwner, "NBOX");
    box.position.set(7, 8, 9);
    assert.throws(
      () => runtime.endProgram(programOwner),
      /cannot end during activity ownership/,
    );
    assert.equal(runtime.end(activityOwner, "complete"), true);
    assert.equal(box.isEnabled(), true);
    assert.deepEqual(box.position.asArray(), [7, 8, 9]);

    assert.equal(runtime.endProgram(programOwner), true);
    assert.equal(box.isEnabled(), false);
    assert.deepEqual(box.position.asArray(), [1, 2, 3]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("persistent scene objects join the outer program lease for script mutations", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const moon = new BABYLON.TransformNode("moon", scene);
    moon._filename = "S1_OP00_B023H01G.MT5";
    const runtime = new NativeAseqSceneObjectRuntime({
      definitions: {
        MNLF: {
          model: "B023H01G",
          browserFilename: "S1_OP00_B023H01G.MT5",
          lifecycle: {
            kind: "room-script-persistent",
            stateOperations: ["0x001f", "0x00a8"],
          },
          initialPresentation: {
            position: [0, 0, 0],
            rotationDegrees: [0, 0, 0],
            scale: [1, 1, 1],
          },
        },
      },
    });
    await runtime.load([moon]);

    const programOwner = {};
    const activityOwner = {};
    assert.deepEqual(runtime.beginProgram(programOwner).map(
      record => record.actorCode,
    ), ["MNLF"]);

    moon.setEnabled(true);
    runtime.begin(activityOwner, ["MNLF"]);
    runtime.activate(activityOwner, "MNLF");
    assert.equal(runtime.end(activityOwner, "complete"), true);
    assert.equal(moon.isEnabled(), true);

    assert.equal(runtime.endProgram(programOwner), true);
    assert.equal(moon.isEnabled(), false);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("failed composite AUTH activity restores its program-session baseline", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const box = new BABYLON.TransformNode("box", scene);
    box._filename = "S1_JU00_DANM400G.MT5";
    const runtime = new NativeAseqSceneObjectRuntime({
      definitions: {
        NBOX: {
          model: "DANM400G",
          browserFilename: "S1_JU00_DANM400G.MT5",
          lifecycle: { kind: "native-composite-owner" },
        },
      },
    });
    await runtime.load([box]);
    const programOwner = {};
    const activityOwner = {};
    runtime.beginProgram(programOwner);
    box.position.set(4, 5, 6);
    runtime.begin(activityOwner, ["NBOX"]);
    box.position.set(7, 8, 9);

    assert.equal(runtime.end(activityOwner, "presentation-failed"), true);
    assert.deepEqual(box.position.asArray(), [4, 5, 6]);
    assert.equal(runtime.endProgram(programOwner), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("composite scene-object program ownership fails closed and clear unwinds leases", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const box = new BABYLON.TransformNode("box", scene);
    box._filename = "S1_JU00_DANM400G.MT5";
    const runtime = new NativeAseqSceneObjectRuntime({
      definitions: {
        NBOX: {
          model: "DANM400G",
          browserFilename: "S1_JU00_DANM400G.MT5",
          lifecycle: { kind: "native-composite-owner" },
        },
      },
    });
    await runtime.load([box]);

    const programOwner = {};
    const otherProgramOwner = {};
    const activityOwner = {};
    runtime.beginProgram(programOwner);
    assert.throws(
      () => runtime.beginProgram(otherProgramOwner),
      /program is already owned/,
    );
    assert.equal(runtime.endProgram(otherProgramOwner), false);
    runtime.begin(activityOwner, ["NBOX"]);
    runtime.activate(activityOwner, "NBOX");

    runtime.clear();
    assert.equal(runtime.active, null);
    assert.equal(runtime.program, null);
    assert.equal(runtime.objects.size, 0);
    assert.equal(box.isEnabled(), false);

    await runtime.load([box]);
    runtime.begin(activityOwner, ["NBOX"]);
    assert.throws(
      () => runtime.beginProgram(programOwner),
      /cannot begin during activity ownership/,
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
