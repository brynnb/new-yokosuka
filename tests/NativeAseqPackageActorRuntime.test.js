import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import {
  NativeAseqPackageActorRuntime,
} from "../play/events/NativeAseqPackageActorRuntime.js";

test("package actors load once and restore exact roots after AUTH ownership", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    let loads = 0;
    const runtime = new NativeAseqPackageActorRuntime({
      definitions: {
        IWAO: {
          label: "Iwao Hazuki",
          modelCode: "IWA_M",
          assetPath: "cutscene/IWA_M.CHRM",
          textureAssetPath: "characters/IWA_textures.bin",
          browserFilename: "IWA_M.CHRM",
        },
      },
      instantiate: async (definition) => {
        loads += 1;
        const root = new BABYLON.TransformNode(definition.actorTag, scene);
        return { actorCode: definition.actorTag, root, model: { root } };
      },
    });
    assert.equal(await runtime.load(), 1);
    assert.equal(loads, 1);
    const actor = runtime.records.get("IWAO");
    actor.root.position.set(1, 2, 3);
    const owner = {};
    assert.deepEqual(runtime.begin(owner, ["IWAO"]), [actor]);
    assert.equal(actor.root.isEnabled(), true);
    actor.root.position.set(7, 8, 9);
    assert.equal(runtime.end(owner), true);
    assert.deepEqual(actor.root.position.asArray(), [1, 2, 3]);
    assert.equal(actor.root.isEnabled(), false);
    runtime.clear();
    assert.equal(actor.root.isDisposed(), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("package actors may resolve canonical textures instead of duplicating a pack", () => {
  const runtime = new NativeAseqPackageActorRuntime({
    definitions: {
      BUSS: {
        label: "Bus driver",
        modelCode: "OGM_L",
        browserFilename: "OGM_L.CHRM",
      },
    },
    instantiate: async () => null,
  });
  assert.equal(runtime.definitions.get("BUSS").textureAssetPath, null);
  assert.equal(runtime.definitions.get("BUSS").assetPath, null);
  assert.throws(
    () => runtime.beginProgram({}),
    /package actors are not loaded/,
  );
});

test("package actors retain native cloth runtime state as actor data", () => {
  const runtime = new NativeAseqPackageActorRuntime({
    definitions: {
      SINF: {
        label: "Shenhua Ling",
        modelCode: "MGR_M",
        browserFilename: "S1_OP02_MGR_M.MT5",
        nativeClothRuntimeMode: 4,
        nativeSecondaryMotionRuntimeMode: 1,
      },
    },
    instantiate: async () => null,
  });
  assert.equal(
    runtime.definitions.get("SINF").nativeClothRuntimeMode,
    4,
  );
  assert.equal(
    runtime.definitions.get("SINF").nativeSecondaryMotionRuntimeMode,
    1,
  );
  assert.throws(() => new NativeAseqPackageActorRuntime({
    definitions: {
      SINF: {
        label: "Shenhua Ling",
        modelCode: "MGR_M",
        browserFilename: "S1_OP02_MGR_M.MT5",
        nativeClothRuntimeMode: 256,
        nativeSecondaryMotionRuntimeMode: 1,
      },
    },
    instantiate: async () => null,
  }), /SINF format is invalid/);
  assert.throws(() => new NativeAseqPackageActorRuntime({
    definitions: {
      SINF: {
        label: "Shenhua Ling",
        modelCode: "MGR_M",
        browserFilename: "S1_OP02_MGR_M.MT5",
        nativeSecondaryMotionRuntimeMode: 256,
      },
    },
    instantiate: async () => null,
  }), /SINF format is invalid/);
});

test("package actors support a program lease around AUTH subleases", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const runtime = new NativeAseqPackageActorRuntime({
      definitions: {
        CATM: {
          label: "Yamanose shrine kitten",
          modelCode: "KC1_M",
          browserFilename: "S3_JU00_KC1_M.MT5",
        },
      },
      instantiate: async (definition) => {
        const root = new BABYLON.TransformNode(definition.actorTag, scene);
        root.position.set(1, 2, 3);
        return { actorCode: definition.actorTag, root, model: { root } };
      },
    });
    await runtime.load();
    const actor = runtime.records.get("CATM");
    const programOwner = {};
    const activityOwner = {};
    assert.deepEqual(runtime.beginProgram(programOwner), [actor]);

    actor.root.setEnabled(true);
    actor.root.position.set(4, 5, 6);
    runtime.begin(activityOwner, ["CATM"]);
    actor.root.position.set(7, 8, 9);
    assert.throws(
      () => runtime.endProgram(programOwner),
      /cannot end during activity ownership/,
    );
    assert.equal(runtime.end(activityOwner, "replaced"), true);
    assert.equal(actor.root.isEnabled(), true);
    assert.deepEqual(actor.root.position.asArray(), [7, 8, 9]);

    assert.equal(runtime.endProgram(programOwner), true);
    assert.equal(actor.root.isEnabled(), false);
    assert.deepEqual(actor.root.position.asArray(), [1, 2, 3]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("package actor model variants switch transactionally inside one program", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const runtime = new NativeAseqPackageActorRuntime({
      definitions: {
        HAWK: {
          label: "Hawk",
          defaultModelCode: "TAK02M7G",
          variants: [
            {
              modelCode: "TAK02M7G",
              browserFilename: "TAK02M7G.CHRM",
            },
            {
              modelCode: "TAK02M8G",
              browserFilename: "TAK02M8G.CHRM",
            },
          ],
        },
      },
      instantiate: async (definition) => {
        const root = new BABYLON.TransformNode(definition.modelCode, scene);
        return { actorCode: definition.actorTag, root, model: { root } };
      },
    });
    assert.equal(await runtime.load(), 1);
    const seven = runtime.records.get("HAWK");
    const eight = runtime.variantRecords.get("HAWK").get("TAK02M8G");
    const programOwner = {};
    const activityOwner = {};
    runtime.beginProgram(programOwner);
    seven.root.position.set(4, 5, 6);
    seven.root.setEnabled(true);

    assert.equal(
      runtime.selectProgramVariant(programOwner, "HAWK", "TAK02M8G"),
      eight,
    );
    assert.equal(seven.root.isEnabled(), false);
    assert.equal(eight.root.isEnabled(), true);
    assert.deepEqual(eight.root.position.asArray(), [4, 5, 6]);
    assert.deepEqual(runtime.begin(activityOwner, ["HAWK"]), [eight]);
    assert.equal(runtime.end(activityOwner, "complete"), true);

    assert.equal(runtime.endProgram(programOwner), true);
    assert.equal(runtime.records.get("HAWK"), seven);
    assert.equal(seven.root.isEnabled(), false);
    assert.equal(eight.root.isEnabled(), false);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("failed package-actor AUTH activity restores its program-session baseline", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const runtime = new NativeAseqPackageActorRuntime({
      definitions: {
        CATM: {
          label: "Yamanose shrine kitten",
          modelCode: "KC1_M",
          browserFilename: "S3_JU00_KC1_M.MT5",
        },
      },
      instantiate: async (definition) => {
        const root = new BABYLON.TransformNode(definition.actorTag, scene);
        return { actorCode: definition.actorTag, root, model: { root } };
      },
    });
    await runtime.load();
    const actor = runtime.records.get("CATM");
    const programOwner = {};
    const activityOwner = {};
    runtime.beginProgram(programOwner);
    actor.root.position.set(4, 5, 6);
    runtime.begin(activityOwner, ["CATM"]);
    actor.root.position.set(7, 8, 9);

    assert.equal(runtime.end(activityOwner, "presentation-failed"), true);
    assert.deepEqual(actor.root.position.asArray(), [4, 5, 6]);
    assert.equal(runtime.endProgram(programOwner), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("package-actor program ownership fails closed and clear unwinds leases", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const runtime = new NativeAseqPackageActorRuntime({
      definitions: {
        CATM: {
          label: "Yamanose shrine kitten",
          modelCode: "KC1_M",
          browserFilename: "S3_JU00_KC1_M.MT5",
        },
      },
      instantiate: async (definition) => {
        const root = new BABYLON.TransformNode(definition.actorTag, scene);
        return { actorCode: definition.actorTag, root, model: { root } };
      },
    });
    await runtime.load();
    const actor = runtime.records.get("CATM");
    const programOwner = {};
    const otherProgramOwner = {};
    const activityOwner = {};
    runtime.beginProgram(programOwner);
    assert.throws(
      () => runtime.beginProgram(otherProgramOwner),
      /program is already owned/,
    );
    assert.equal(runtime.endProgram(otherProgramOwner), false);
    runtime.begin(activityOwner, ["CATM"]);

    runtime.clear();
    assert.equal(runtime.active, null);
    assert.equal(runtime.program, null);
    assert.equal(runtime.records.size, 0);
    assert.equal(actor.root.isDisposed(), true);

    await runtime.load();
    runtime.begin(activityOwner, ["CATM"]);
    assert.throws(
      () => runtime.beginProgram(programOwner),
      /cannot begin during activity ownership/,
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("package actor load waits for concurrent work before disposing on failure", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    let rejectCat;
    let resolveDog;
    const cat = new Promise((_resolve, reject) => {
      rejectCat = reject;
    });
    const dog = new Promise((resolve) => {
      resolveDog = resolve;
    });
    const dogRoot = new BABYLON.TransformNode("DOGG", scene);
    const failure = new Error("cat body unavailable");
    const runtime = new NativeAseqPackageActorRuntime({
      definitions: {
        CATM: {
          label: "Yamanose shrine kitten",
          modelCode: "KC1_M",
          browserFilename: "S3_JU00_KC1_M.MT5",
        },
        DOGG: {
          label: "Dog",
          modelCode: "DOG_M",
          browserFilename: "DOG_M.MT5",
        },
      },
      instantiate: definition => (
        definition.actorTag === "CATM" ? cat : dog
      ),
    });

    let settled = false;
    const loading = runtime.load().finally(() => {
      settled = true;
    });
    rejectCat(failure);
    await Promise.resolve();
    assert.equal(settled, false);

    resolveDog({ actorCode: "DOGG", root: dogRoot, model: { root: dogRoot } });
    await assert.rejects(loading, error => error === failure);
    assert.equal(dogRoot.isDisposed(), true);
    assert.equal(runtime.records.size, 0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("package actor load validates the complete batch before publishing records", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const roots = [];
    const runtime = new NativeAseqPackageActorRuntime({
      definitions: {
        CATM: {
          label: "Yamanose shrine kitten",
          modelCode: "KC1_M",
          browserFilename: "S3_JU00_KC1_M.MT5",
        },
        DOGG: {
          label: "Dog",
          modelCode: "DOG_M",
          browserFilename: "DOG_M.MT5",
        },
      },
      instantiate: async (definition) => {
        const root = new BABYLON.TransformNode(definition.actorTag, scene);
        roots.push(root);
        return {
          actorCode: definition.actorTag === "DOGG" ? "MISS" : "CATM",
          root,
          model: { root },
        };
      },
    });

    await assert.rejects(
      runtime.load(),
      /instantiator returned an invalid record/,
    );
    assert.equal(runtime.records.size, 0);
    assert.equal(roots.every(root => root.isDisposed()), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
