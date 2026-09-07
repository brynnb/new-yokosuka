import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  ScheduledActorMotionRuntime,
  scheduledActorMotionLayers,
  scheduledActorMotionRequirements,
  scheduledActorMotionSelection,
} from "../play/characters/ScheduledActorMotionRuntime.js";
import {
  applyScheduledActorAnimatedScale,
} from "../play/characters/ScheduledActorRuntime.js";
import { CharacterRuntime } from "../play/characters/CharacterRuntime.js";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { MotnLoader } from "../src/MotnLoader.js";
import {
  RYO_YK_RENDER_MATRIX_ROUTES,
} from "../src/RuntimeMatrixRecording.js";
import {
  resolveScheduledActorMotionState,
} from "../src/ScheduledActorMotionRegistry.js";

function fileArrayBuffer(filename) {
  const bytes = fs.readFileSync(filename);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

test("compact manifests provide precomputed motion requirements", () => {
  const definitions = [];
  Object.defineProperty(definitions, "motionRequirements", {
    value: Object.freeze({
      free: Object.freeze(["AKI_AKI_WALK_LP"]),
      mobj: Object.freeze(["OTH_TATI_2_LP_F"]),
    }),
  });
  assert.deepEqual(scheduledActorMotionRequirements(definitions), {
    free: ["AKI_AKI_WALK_LP"],
    mobj: ["OTH_TATI_2_LP_F"],
  });
});

test("named native locomotion clips load as a reusable runtime resource", async () => {
  const motionRuntime = new ScheduledActorMotionRuntime({
    renderMatrixByKey: new Map(),
    characterRuntime: {},
    fetchArrayBuffer: async () => fileArrayBuffer(
      "play/assets/scheduled-actors/M_MOBJ.BIN",
    ),
    bankUrls: { mobj: "M_MOBJ.BIN" },
  });

  await motionRuntime.loadNamedSelections([
    { bank: "mobj", name: "CAT_CAT_TATI_LP" },
    { bank: "mobj", name: "DOG_DOG_RUN_LP", movement: true },
  ]);

  assert.equal(motionRuntime.sequences.has("mobj:CAT_CAT_TATI_LP"), true);
  assert.equal(motionRuntime.sequences.has("mobj:DOG_DOG_RUN_LP"), true);
  assert.equal(motionRuntime.movementNames.has("mobj:CAT_CAT_TATI_LP"), false);
  assert.equal(motionRuntime.movementNames.has("mobj:DOG_DOG_RUN_LP"), true);
});

async function loadCharacter(filename, characterRigMode = "baked") {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const loader = new Mt5Loader(scene, {
    characterRigMode,
    characterRigSeamMode: characterRigMode === "gpu" ? "weld" : null,
  });
  const [root] = await loader.load(fileArrayBuffer(filename), null);
  return { engine, scene, loader, root };
}

test("operation 0x02 resolves through the registered M_MOBJ range", () => {
  assert.deepEqual(
    scheduledActorMotionSelection({
      operation: 2,
      motionBank: "free",
      motionStateId: -32523,
    }),
    {
      bank: "mobj",
      name: "OTH_HIJI_F",
      loop: false,
    },
  );
});

test("operation 0x1a uses the same registered range resolver", () => {
  assert.deepEqual(
    scheduledActorMotionSelection({
      operation: 0x1a,
      motionBank: "mobj",
      motionStateId: -32341,
    }),
    {
      bank: "mobj",
      name: "SYP_AKMI_KAIWA_LP_SAKE_45",
      loop: true,
    },
  );
});

test("the request range, not the operation, can select process-wide MOTION", () => {
  assert.deepEqual(
    scheduledActorMotionSelection({
      operation: 0x1a,
      motionBank: "mobj",
      motionStateId: 633,
    }),
    {
      bank: "free",
      name: "AKI_AKI_OJIGI_LIGHT_EN",
      loop: false,
    },
  );
});

test("registered ranges preserve one-based IDs and exclusive bounds", () => {
  assert.deepEqual(resolveScheduledActorMotionState(633), {
    bank: "free",
    index: 632,
    motionId: 633,
  });
  assert.deepEqual(resolveScheduledActorMotionState(-32366), {
    bank: "mobj",
    index: 401,
    motionId: 0x8192,
  });
  for (const invalid of [0, 0x0618, 0x8000, 0x8358]) {
    assert.equal(resolveScheduledActorMotionState(invalid), null);
  }
});

test("Nozomi's captured 0x8192 state selects its native 193-frame loop", () => {
  assert.deepEqual(
    scheduledActorMotionSelection({
      operation: 2,
      motionBank: "free",
      motionStateId: -32366,
    }),
    {
      bank: "mobj",
      name: "SIN_NOZ_TALK_LP_QTE",
      loop: true,
    },
  );
  const motion = MotnLoader.parse(
    fs.readFileSync("play/assets/scheduled-actors/M_MOBJ.BIN"),
    { sequenceNames: ["SIN_NOZ_TALK_LP_QTE"] },
  ).getSequence("SIN_NOZ_TALK_LP_QTE");
  assert.equal(motion.index, 401);
  assert.equal(motion.durationFrames, 193);
  assert.equal(motion.controllerFamilyIndex, 15);
});

test("operation 0x30 uses its native mode-7 registered action motion", () => {
  assert.deepEqual(
    scheduledActorMotionSelection({
      actionControllerId: 0x815e,
      motionStateId: 0x8192,
    }),
    {
      bank: "mobj",
      name: "PNW_KASA_UDE_MONOMOTI_LP_F",
      loop: true,
    },
  );
  assert.deepEqual(
    scheduledActorMotionSelection({
      actionControllerId: null,
      motionStateId: 0x8192,
    }),
    {
      bank: "mobj",
      name: "SIN_NOZ_TALK_LP_QTE",
      loop: true,
    },
  );
});

test("mode-7 carrying requests do not alter operation-1 locomotion", () => {
  assert.deepEqual(
    scheduledActorMotionLayers({
      operation: 1,
      moving: true,
      movementMode: "0x811f",
      movementElapsedRealSeconds: 10,
      motionStateId: 0x8143,
      actionControllerId: 0x80fb,
    }),
    {
      selection: {
        bank: "mobj",
        name: "OTH_OTH_WALK_LP",
        loop: true,
        elapsedSeconds: 10,
      },
      baseSelection: null,
      baseProvidesTimeline: false,
    },
  );
});

test("a moving carrier reuses the ordinary native walking clip", async () => {
  const reference = await loadCharacter(
    "play/assets/characters/YEB_L.CHRM",
  );
  const carrier = await loadCharacter(
    "play/assets/characters/OYD_L.CHRM",
  );
  try {
    const renderMatrixByKey = new Map(RYO_YK_RENDER_MATRIX_ROUTES);
    const characterRuntime = new CharacterRuntime({
      scene: carrier.scene,
      renderMatrixByKey,
      fetchArrayBuffer() {},
    });
    characterRuntime.setReferenceBind(reference.loader, reference.root);
    const motionRuntime = new ScheduledActorMotionRuntime({
      renderMatrixByKey,
      characterRuntime,
      fetchArrayBuffer: async (url) => fileArrayBuffer(
        url === "MOTION.BIN"
          ? "dist/motion/MOTION.BIN"
          : "play/assets/scheduled-actors/M_MOBJ.BIN"
      ),
      bankUrls: {
        free: "MOTION.BIN",
        mobj: "M_MOBJ.BIN",
      },
    });
    await motionRuntime.configure([{
      journeys: [{
        operations: [
          { operation: 1, movementMode: "0x66" },
          { operation: 0x30, actionControllerId: 0x80fb },
        ],
      }],
    }]);
    const model = {
      loader: carrier.loader,
      renderRoot: carrier.root,
      modelCode: "OYD_L",
      humanoidControlRigs: new Map(),
    };

    assert.equal(motionRuntime.apply(model, {
      operation: 1,
      moving: true,
      movementMode: "0x66",
      movementElapsedRealSeconds: 10,
      motionStateId: 102,
      actionControllerId: 0x80fb,
    }, 10), true);

    const [clip] = motionRuntime.clips.values();
    assert.equal(clip.name, "AKI_AKI_WALK_LP");
    assert.equal(clip.frames.length, 37);
    assert.equal(clip.loopStartFrame, 1);
    assert.equal(clip.loopFrameCount, 36);

    assert.equal(motionRuntime.apply(model, {
      operation: 1,
      moving: true,
      movementMode: "0x66",
      movementElapsedRealSeconds: 10,
      motionStateId: 102,
      actionControllerId: null,
    }, 10), true);
    assert.equal(
      motionRuntime.clips.size,
      1,
      "carrying must not create a second locomotion skeleton clip",
    );
  } finally {
    reference.scene.dispose();
    reference.engine.dispose();
    carrier.scene.dispose();
    carrier.engine.dispose();
  }
});

test("route states resolve directly through the native motion registry", () => {
  assert.deepEqual(
    scheduledActorMotionSelection({
      operation: 1,
      moving: true,
      movementMode: "0x66",
      movementElapsedRealSeconds: 3,
    }),
    {
      bank: "free",
      name: "AKI_AKI_WALK_LP",
      loop: true,
      elapsedSeconds: 3,
    },
  );
  assert.deepEqual(
    scheduledActorMotionSelection({
      operation: 1,
      moving: true,
      movementMode: "0x811f",
      movementElapsedRealSeconds: 10,
      movementRemainingRealSeconds: 10,
    }),
    {
      bank: "mobj",
      name: "OTH_OTH_WALK_LP",
      loop: true,
      elapsedSeconds: 10,
    },
  );
  assert.deepEqual(
    scheduledActorMotionSelection({
      operation: 1,
      moving: true,
      movementMode: "0x8016",
      movementElapsedRealSeconds: 2,
    }),
    {
      bank: "mobj",
      name: "CAT_CAT_WALK_LP",
      loop: true,
      elapsedSeconds: 2,
    },
  );
  assert.deepEqual(
    scheduledActorMotionSelection({
      operation: 1,
      moving: true,
      movementMode: "0x80cc",
      movementElapsedRealSeconds: 1,
    }),
    {
      bank: "mobj",
      name: "KOD_RUN_LP_F",
      loop: true,
      elapsedSeconds: 1,
    },
  );
});

test("secondary forklift routes select their authored driver pose", () => {
  assert.deepEqual(
    scheduledActorMotionSelection({
      secondaryObjectCode: "FK02",
      motionStateId: 33588,
    }),
    {
      bank: "mobj",
      name: "YKI_FLD9_RIDE_FORKLIFT_LP_F",
      loop: true,
    },
  );
  const requirements = scheduledActorMotionRequirements([{
    journeys: [{
      operations: [{
        operation: 0x1c,
        secondaryControlWord: 33588,
        secondaryObjectCode: "FK02",
      }],
    }],
  }]);
  assert.ok(requirements.mobj.includes(
    "YKI_FLD9_RIDE_FORKLIFT_LP_F",
  ));
});

test("compact SHY render nodes receive native controller matrices directly", async () => {
  const reference = await loadCharacter(
    "play/assets/characters/YEB_L.CHRM",
  );
  const rena = await loadCharacter(
    "play/assets/characters/SHY_L.CHRM",
  );
  try {
    const renderMatrixByKey = new Map(RYO_YK_RENDER_MATRIX_ROUTES);
    const characterRuntime = new CharacterRuntime({
      scene: rena.scene,
      renderMatrixByKey,
      fetchArrayBuffer() {},
    });
    characterRuntime.setReferenceBind(reference.loader, reference.root);
    characterRuntime.retargetLocally = () => {
      throw new Error("scheduled HRCM rendering must not retarget routes");
    };

    const motionRuntime = new ScheduledActorMotionRuntime({
      renderMatrixByKey,
      characterRuntime,
      fetchArrayBuffer: async () => fileArrayBuffer(
        "play/assets/scheduled-actors/M_MOBJ.BIN",
      ),
      bankUrls: {
        mobj: "M_MOBJ.BIN",
      },
    });
    await motionRuntime.configure([{
      journeys: [{
        operations: [{
          operation: 1,
          movementMode: "0x8198",
        }],
      }],
    }]);

    let appliedRoutes = null;
    rena.loader.applyCharacterRigWorldMatrices = (_root, routes) => {
      appliedRoutes = routes;
    };
    const model = {
      loader: rena.loader,
      renderRoot: rena.root,
      modelCode: "SHY_L",
      humanoidControlRigs: new Map(),
    };
    assert.equal(motionRuntime.apply(model, {
      operation: 1,
      moving: true,
      movementMode: "0x8198",
      movementElapsedRealSeconds: 0.3,
    }, 0.3), true);

    const walkingClip = [...motionRuntime.clips.values()][0];
    assert.equal(walkingClip.loopStartFrame, 1);
    assert.equal(walkingClip.loopFrameCount, 36);

    assert.ok(appliedRoutes);
    assert.equal(appliedRoutes, model.latestRetargetedRoutes);
    for (const [renderKey, controlIndex] of (
      model.latestControllerRenderMatrixByKey
    )) {
      assert.deepEqual(
        appliedRoutes.get(renderKey),
        model.latestControllerMatrices[controlIndex],
        `render key ${renderKey} must use controller matrix ${controlIndex}`,
      );
    }
    const controllerMatrices = model.latestControllerMatrices;
    const controllerMatrixBuffers = [...controllerMatrices];
    const renderRoutes = model.latestRetargetedRoutes;
    assert.equal(motionRuntime.apply(model, {
      operation: 1,
      moving: true,
      movementMode: "0x8198",
      movementElapsedRealSeconds: 0.35,
    }, 0.35), true);
    assert.equal(model.latestControllerMatrices, controllerMatrices);
    assert.equal(model.latestRetargetedRoutes, renderRoutes);
    for (let index = 0; index < controllerMatrices.length; index += 1) {
      assert.equal(
        model.latestControllerMatrices[index],
        controllerMatrixBuffers[index],
        `controller matrix ${index} should reuse its output buffer`,
      );
    }
  } finally {
    reference.scene.dispose();
    reference.engine.dispose();
    rena.scene.dispose();
    rena.engine.dispose();
  }
});

test("drunk locomotion retains its authored stagger around route travel", async () => {
  const actor = await loadCharacter(
    "play/assets/characters/YEB_L.CHRM",
  );
  try {
    const renderMatrixByKey = new Map(RYO_YK_RENDER_MATRIX_ROUTES);
    const characterRuntime = new CharacterRuntime({
      scene: actor.scene,
      renderMatrixByKey,
      fetchArrayBuffer() {},
    });
    characterRuntime.setReferenceBind(actor.loader, actor.root);
    const motionRuntime = new ScheduledActorMotionRuntime({
      renderMatrixByKey,
      characterRuntime,
      fetchArrayBuffer: async () => fileArrayBuffer(
        "play/assets/scheduled-actors/M_MOBJ.BIN",
      ),
      bankUrls: {
        mobj: "M_MOBJ.BIN",
      },
    });
    await motionRuntime.configure([{
      journeys: [{
        operations: [{
          operation: 1,
          movementMode: "0x8159",
        }],
      }],
    }]);
    const model = {
      loader: actor.loader,
      renderRoot: actor.root,
      modelCode: "YEB_L",
      humanoidControlRigs: new Map(),
    };
    assert.equal(motionRuntime.apply(model, {
      operation: 1,
      moving: true,
      movementMode: "0x8159",
      movementElapsedRealSeconds: 1,
    }, 1), true);

    const [clip] = motionRuntime.clips.values();
    assert.equal(clip.name, "OTH_WALK_DRUNK_LP_F");
    assert.ok(Math.hypot(...clip.cycleDisplacement) > 1);
    assert.ok(
      clip.maximumResidualDistance > 0.25,
      `drunk residual ${clip.maximumResidualDistance}`,
    );
    assert.ok(
      Math.hypot(clip.frames[0][0][12], clip.frames[0][0][14]) < 1e-6,
    );
    assert.ok(
      Math.hypot(
        clip.frames.at(-1)[0][12],
        clip.frames.at(-1)[0][14],
      ) < 1e-6,
    );
  } finally {
    actor.scene.dispose();
    actor.engine.dispose();
  }
});

test("Noriko's normalized GPU walking pose is not scaled down twice", async () => {
  const reference = await loadCharacter(
    "play/assets/characters/YEB_L.CHRM",
  );
  const noriko = await loadCharacter(
    "play/assets/characters/SHA_L.CHRM",
    "gpu",
  );
  try {
    const renderMatrixByKey = new Map(RYO_YK_RENDER_MATRIX_ROUTES);
    const characterRuntime = new CharacterRuntime({
      scene: noriko.scene,
      renderMatrixByKey,
      fetchArrayBuffer() {},
    });
    characterRuntime.setReferenceBind(reference.loader, reference.root);
    const motionRuntime = new ScheduledActorMotionRuntime({
      renderMatrixByKey,
      characterRuntime,
      fetchArrayBuffer: async () => fileArrayBuffer(
        "play/assets/scheduled-actors/M_MOBJ.BIN",
      ),
      bankUrls: {
        mobj: "M_MOBJ.BIN",
      },
    });
    await motionRuntime.configure([{
      journeys: [{
        operations: [{
          operation: 1,
          movementMode: "0x8198",
        }],
      }],
    }]);

    const actorRoot = new BABYLON.TransformNode(
      "noriko_actor_root",
      noriko.scene,
    );
    noriko.root.parent = actorRoot;
    actorRoot.scaling.setAll(0.1);
    const model = {
      loader: noriko.loader,
      root: actorRoot,
      renderRoot: noriko.root,
      modelCode: "SHA_L",
      humanoidControlRigs: new Map(),
    };
    assert.equal(motionRuntime.apply(model, {
      operation: 1,
      moving: true,
      movementMode: "0x8198",
      movementElapsedRealSeconds: 0.3,
    }, 0.3), true);
    assert.equal(applyScheduledActorAnimatedScale(model), true);
    assert.equal(actorRoot.scaling.x, 1);

    const bounds = noriko.loader.characterRigBoundsForWorldMatrices(
      noriko.root,
      model.latestRetargetedRoutes,
    );
    const height = bounds.maximum[1] - bounds.minimum[1];
    assert.ok(height > 1.5 && height < 1.7, `Noriko height ${height}`);
  } finally {
    reference.scene.dispose();
    reference.engine.dispose();
    noriko.scene.dispose();
    noriko.engine.dispose();
  }
});

test("every exact DRAUTH activity actor accepts its authored native motion", async () => {
  const reference = await loadCharacter(
    "play/assets/characters/YEB_L.CHRM",
  );
  const motion = MotnLoader.parse(
    fs.readFileSync("play/assets/dobuita/drauth/M_01REV.MOTN"),
  );
  const cases = [
    ["GIB_M", 3, 73],
    ["GIE_L", 7, 794],
    ["GIF_L", 6, 464],
    ["GIJ_M", 2, 80],
    ["TUW_L", 8, 883],
  ];
  try {
    for (const [modelCode, sequenceIndex, frame] of cases) {
      const target = await loadCharacter(
        `play/assets/characters/${modelCode}.CHRM`,
        "gpu",
      );
      try {
        const renderMatrixByKey = new Map(RYO_YK_RENDER_MATRIX_ROUTES);
        const characterRuntime = new CharacterRuntime({
          scene: target.scene,
          renderMatrixByKey,
          fetchArrayBuffer() {},
        });
        characterRuntime.setReferenceBind(reference.loader, reference.root);
        const runtime = new ScheduledActorMotionRuntime({
          renderMatrixByKey,
          characterRuntime,
          fetchArrayBuffer() {},
          bankUrls: {},
        });
        const model = {
          loader: target.loader,
          renderRoot: target.root,
          modelCode,
          humanoidControlRigs: new Map(),
        };
        assert.equal(runtime.applyActivitySequence(model, {
          sequence: motion.sequences[sequenceIndex],
          frame,
        }), true, modelCode);
        assert.ok(model.latestRetargetedRoutes.size > 0, modelCode);
      } finally {
        target.scene.dispose();
        target.engine.dispose();
      }
    }
  } finally {
    reference.scene.dispose();
    reference.engine.dispose();
  }
});

test("completed routes select their authored operation-0x35 idle", () => {
  assert.deepEqual(
    scheduledActorMotionSelection({
      operation: 1,
      moving: false,
      motionStateId: 0x8299,
      routeCompletionMotionStateId: 0x8299,
    }),
    {
      bank: "mobj",
      name: "YKI_TATI_DRUNK_LP_F",
      loop: true,
    },
  );
});

test("native definition defaults are preloaded without a repeated operation", () => {
  const requirements = scheduledActorMotionRequirements([{
    actorCode: "TKNB",
    nativeDefaultMotionStateId: 0x8143,
    journeys: [{
      operations: [],
    }],
  }]);
  assert.deepEqual(requirements.mobj, ["OTH_TATI_2_LP_F"]);
});

test("every packaged nonzero native default resolves and is preloaded", () => {
  const manifest = JSON.parse(fs.readFileSync(
    "play/data/scheduled-actors.json",
    "utf8",
  ));
  const requirements = scheduledActorMotionRequirements(manifest.actors);
  const requirementSets = Object.fromEntries(
    Object.entries(requirements).map(([bank, names]) => [
      bank,
      new Set(names),
    ]),
  );
  for (const actor of manifest.actors) {
    const stateId = actor.nativeDefaultMotionStateId;
    if (!stateId) continue;
    const selection = scheduledActorMotionSelection({
      motionStateId: stateId,
    });
    assert.ok(
      selection,
      `${actor.actorCode} default ${stateId} must resolve`,
    );
    assert.ok(
      requirementSets[selection.bank]?.has(selection.name),
      `${actor.actorCode} default ${selection.bank}:${selection.name} must preload`,
    );
  }
});
