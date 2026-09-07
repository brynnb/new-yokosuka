import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  applyScheduledActorAnimatedScale,
  pickScheduledActorDebugIdentity,
  pickScheduledActorSelection,
  ScheduledActorRuntime,
  scheduledActorDebugIdentity,
  scheduledActorSelection,
  scheduledActorGroundOffset,
  scheduledActorFacingYaw,
  scheduledActorInterpolatedYaw,
  scheduledActorLocalObjectModel,
  scheduledActorLocalObjectModelRequirements,
  scheduledActorModelIsOccluded,
  scheduledActorModelIsInFrustum,
  scheduledActorModelShouldAnimate,
  scheduledActorModelBlocksCamera,
  scheduledActorModelScaleCorrection,
  scheduledActorSecondaryObjectCode,
  scheduledActorSecondaryObjectDefinition,
  scheduledForkliftDriverHorizontalOffset,
  scheduledActorTurnIsContinuous,
  setScheduledActorCameraFade,
  setScheduledActorOcclusionCulled,
  updateScheduledActorDebugSelectionProxy,
} from "../play/characters/ScheduledActorRuntime.js";

async function activityStreamingHarness(t, { network = new Map(), beforeBuild = null } = {}) {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const built = [];
  const runtime = new ScheduledActorRuntime({
    scene, state: { currentMeshes: [] }, getActiveWorldId: () => "dobuita",
    networkState: { configure() {}, stateFor: id => network.get(id) },
  });
  t.after(() => { runtime.clear(); scene.dispose(); engine.dispose(); });
  t.mock.method(runtime, "prefetchModel", async () => {});
  t.mock.method(runtime, "loadModel", async (_definition, model) => {
    await beforeBuild?.(model);
    const root = new BABYLON.TransformNode(model.modelCode, scene);
    root.metadata = { scheduledActorGroundOffset: 0 };
    root.setEnabled(false);
    runtime.state.currentMeshes.push(root);
    const renderRoot = new BABYLON.TransformNode(`${model.modelCode}_body`, scene);
    renderRoot.parent = root;
    const result = { ...model, root, renderRoot, standingRenderPosition: renderRoot.position.clone() };
    built.push(result);
    return result;
  });
  await runtime.load([
    { actorCode: "ONE", modelCode: "ONE_M", authoritative: true, modelOverrides: [{ modelCode: "ONE_L" }] },
    { actorCode: "TWO", modelCode: "TWO_M", authoritative: true },
  ], null, "dobuita");
  return { runtime, built };
}

test("script preparation loads only its absent resident and preserves world visibility", async t => {
  const { runtime, built } = await activityStreamingHarness(t);
  assert.equal(built.length, 0);
  assert.throws(() => runtime.beginActivityActors({}, ["ONE"]), /loaded=0, enabled=0/);
  await runtime.prepareActivityActors(["ONE"]);
  assert.deepEqual(built.map(model => model.modelCode), ["ONE_M"]);
  assert.equal(built[0].root.isEnabled(), false);
  assert.equal(runtime.activityActorOwners.size, 0);
  const owner = {};
  assert.equal(runtime.beginActivityActors(owner, ["ONE"])[0].model, built[0]);
  assert.equal(built[0].root.isEnabled(), true);
  runtime.endActivityActors(owner);
  assert.equal(built[0].root.isEnabled(), false);
  await runtime.prepareActivityActors(["ONE"]);
  assert.equal(built.length, 1, "replays reuse the resident cache");
});

test("script preparation preserves the resident's active authored variant", async t => {
  const network = new Map([["ONE", {
    worldId: "dobuita", x: 0, y: 0, z: 0, yaw: 0, modelOverrideCode: "ONE_L",
  }]]);
  const { runtime, built } = await activityStreamingHarness(t, { network });
  await runtime.prepareActivityActors(["ONE"]);
  assert.deepEqual(built.map(model => model.modelCode), ["ONE_L"]);
  const owner = {};
  assert.equal(runtime.beginActivityActors(owner, ["ONE"])[0].model, built[0]);
  runtime.endActivityActors(owner);
  assert.equal(built[0].root.isEnabled(), true);
});

test("cancelled preparation does not poison a shared model request or its retry", async t => {
  const gate = Promise.withResolvers();
  const started = Promise.withResolvers();
  const { runtime, built } = await activityStreamingHarness(t, { beforeBuild: async () => {
    started.resolve();
    await gate.promise;
  } });
  const controller = new AbortController();
  const cancelled = runtime.prepareActivityActors(["ONE"], { signal: controller.signal });
  await started.promise;
  const concurrent = runtime.prepareActivityActors(["ONE"]);
  controller.abort();
  gate.resolve();
  await assert.rejects(cancelled, { name: "AbortError" });
  assert.equal(await concurrent, true);
  assert.equal(built.length, 1);
  assert.equal(built[0].root.isEnabled(), false);
  assert.equal(runtime.activityActorOwners.size, 0);
  assert.equal(await runtime.prepareActivityActors(["ONE"]), true);
});

test("changing worlds disposes a late script-prepared body", async t => {
  const gate = Promise.withResolvers();
  const started = Promise.withResolvers();
  const { runtime, built } = await activityStreamingHarness(t, { beforeBuild: async () => {
    started.resolve();
    await gate.promise;
  } });
  const pending = runtime.prepareActivityActors(["ONE"]);
  await started.promise;
  runtime.clear();
  gate.resolve();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(built[0].root.isDisposed(), true);
  assert.deepEqual(runtime.entries, []);
  assert.equal(runtime.activityActorOwners.size, 0);
});

test("script model failures and invalid selections remain explicit and retryable", async t => {
  let fail = true;
  const { runtime, built } = await activityStreamingHarness(t, { beforeBuild: () => {
    if (fail) throw new Error("test model failed");
  } });
  await assert.rejects(runtime.prepareActivityActors(["ONE"]), /test model failed/);
  assert.equal(runtime.entries[0].pendingModels.size, 0);
  assert.equal(runtime.activityActorOwners.size, 0);
  fail = false;
  await runtime.prepareActivityActors(["ONE"]);
  assert.equal(built.length, 1);
  await assert.rejects(runtime.prepareActivityActors(["MISSING"]), /not unique/);
  await assert.rejects(runtime.prepareActivityActors(["ONE", "one"]), /unique list/);
});

test("scheduled model streaming follows current presence and never shows the wrong variant", async t => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const network = new Map();
  const built = [];
  const runtime = new ScheduledActorRuntime({
    scene, state: {currentMeshes: []}, getActiveWorldId: () => "dobuita",
    networkState: {configure() {}, stateFor: id => network.get(id)},
  });
  t.mock.method(runtime, "prefetchModel", async () => {});
  t.mock.method(runtime, "loadModel", async (definition, model) => {
    built.push(model.modelCode);
    const root = new BABYLON.TransformNode(model.modelCode, scene);
    root.metadata = {scheduledActorGroundOffset: 0};
    root.setEnabled(false);
    runtime.state.currentMeshes.push(root);
    const renderRoot = new BABYLON.TransformNode(`${model.modelCode}_body`, scene);
    renderRoot.parent = root;
    return {...model, root, renderRoot, standingRenderPosition: renderRoot.position.clone()};
  });
  const resident = {actorCode: "ONE", authoritative: true, position: [8, 0, 9],
    modelCode: "ONE_M", modelOverrides: [{modelCode: "ONE_L"}]};
  const scripted = {actorCode: "TWO", activityOnly: true, modelCode: "TWO_M"};
  try {
    await runtime.load([resident, scripted], null, "dobuita");
    assert.deepEqual(built, ["TWO_M"], "absent residents must not load even if they carry a source position");
    const entry = runtime.entries.find(row => row.definition === resident);
    network.set("ONE", {worldId: "dobuita", x: 1, y: 0, z: 2, yaw: 0, modelOverrideCode: "ONE_L"});
    runtime.update(0);
    const loading = entry.pendingModels.get("ONE_L");
    assert.ok(loading);
    runtime.update(0);
    assert.equal(entry.pendingModels.get("ONE_L"), loading);
    await loading; runtime.update(0);
    assert.deepEqual(built, ["TWO_M", "ONE_L"]);
    assert.equal(entry.root.isEnabled(), true);
    assert.equal(entry.root.position.x, 1);
    network.get("ONE").modelOverrideCode = null;
    runtime.update(0);
    assert.equal(entry.models.get("ONE_L").root.isEnabled(), false);
    await entry.pendingModels.get("ONE_M"); runtime.update(0);
    assert.equal(entry.root, entry.models.get("ONE_M").root);
    assert.equal(entry.root.isEnabled(), true);
    network.get("ONE").worldId = "yamanose";
    runtime.update(0);
    assert.equal(entry.root.isEnabled(), false);
  } finally { runtime.clear(); scene.dispose(); engine.dispose(); }
});

test("clearing a world disposes a late actor instead of attaching it to the next scene", async t => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const runtime = new ScheduledActorRuntime({scene, state: {currentMeshes: []},
    getActiveWorldId: () => "dobuita"});
  const prefetched = [];
  t.mock.method(runtime, "prefetchModel", async (_definition, code) => { prefetched.push(code); });
  let finish;
  let started;
  const loadingStarted = new Promise(resolve => { started = resolve; });
  let lateRoot;
  t.mock.method(runtime, "loadModel", async (_definition, model) => {
    started();
    await new Promise(resolve => { finish = resolve; });
    lateRoot = new BABYLON.TransformNode("late", scene);
    runtime.state.currentMeshes.push(lateRoot);
    return {...model, root: lateRoot};
  });
  try {
    const loading = runtime.load([
      {actorCode: "ONE", modelCode: "ONE_M", activityOnly: true},
      {actorCode: "TWO", modelCode: "TWO_M", activityOnly: true},
    ], null, "dobuita");
    await loadingStarted;
    assert.deepEqual(prefetched, ["ONE_M", "TWO_M"], "downloads must start before the previous model finishes assembly");
    runtime.clear(); finish();
    await assert.rejects(loading, {name: "AbortError"});
    assert.equal(lateRoot.isDisposed(), true);
    assert.equal(runtime.state.currentMeshes.includes(lateRoot), false);
    assert.deepEqual(runtime.entries, []);
  } finally { scene.dispose(); engine.dispose(); }
});

test("scheduled FACE yaw uses the browser actor-to-target direction", () => {
  assert.equal(
    scheduledActorFacingYaw([1, 0, 2], [1, 1.5, 6]),
    0,
  );
  assert.equal(
    scheduledActorFacingYaw([1, 0, 2], [4, 1.5, 2]),
    Math.PI / 2,
  );
  assert.equal(
    scheduledActorFacingYaw([1, 0, 2], [1, 1.5, 2]),
    null,
  );
});

test("scheduled actor objects resolve from the active world's source registry", () => {
  assert.equal(scheduledActorLocalObjectModel(
    {
      locationCode: "SO01",
      resolvedModel: "STALE_CAPTURE_MODEL.MT5",
    },
    "dobuita",
  ), "S3_D000_HOUS501G.MT5");
  assert.equal(scheduledActorLocalObjectModel(
    {
      locationCode: "ZZ99",
      resolvedModel: "DIRECT_EVIDENCE_MODEL.MT5",
    },
    "dobuita",
  ), "DIRECT_EVIDENCE_MODEL.MT5");
  assert.equal(scheduledActorLocalObjectModel(
    { locationCode: "ZZ99" },
    "dobuita",
  ), null);
  assert.equal(scheduledActorLocalObjectModel(
    {
      objectCode: "ITEM",
      locationCode: "ET00",
      placementMode: 1,
    },
    "mfsy",
  ), "S3_MA00_BAMA000G.MT5");
});

test("compact manifests provide local-object assets directly", () => {
  const definitions = [];
  Object.defineProperty(definitions, "localObjectModels", {
    value: Object.freeze([
      "S3_D000_HOUS501G.MT5",
      "S3_D000_KAIM400G.MT5",
    ]),
  });
  assert.deepEqual(
    scheduledActorLocalObjectModelRequirements(definitions, "dobuita"),
    [
      "S3_D000_HOUS501G.MT5",
      "S3_D000_KAIM400G.MT5",
    ],
  );
});

test("scheduled actor object requirements cover every authored attachment", () => {
  const definitions = [
    {
      actorCode: "ONE",
      journeys: [{
        operations: [
          {
            operation: 0x10,
            localTransform: {
              objectCode: "ITEM",
              locationCode: "SO01",
            },
          },
          {
            operation: 0x10,
            localTransform: {
              objectCode: "BAG1",
              locationCode: "BA04",
            },
          },
        ],
      }],
    },
    {
      actorCode: "TWO",
      journeys: [{
        operations: [{
          operation: 0x10,
          localTransform: {
            objectCode: "ITEM",
            locationCode: "SO01",
          },
        }],
      }],
    },
  ];
  assert.deepEqual(
    scheduledActorLocalObjectModelRequirements(
      definitions,
      "dobuita",
    ),
    [
      "S3_D000_HOUS501G.MT5",
      "S3_D000_KAIM400G.MT5",
    ],
  );
});

test("SHA_L correction applies only to its oversized bind pose", () => {
  assert.equal(scheduledActorModelScaleCorrection("SHA_L"), 0.1);
  assert.equal(
    scheduledActorModelScaleCorrection("SHA_L", { animated: true }),
    1,
  );
  assert.equal(scheduledActorModelScaleCorrection("FLI_L"), 1);
  assert.equal(
    scheduledActorModelScaleCorrection("FLI_L", { animated: true }),
    1,
  );
  assert.equal(scheduledActorModelScaleCorrection("FLM_L"), 1);
  assert.equal(scheduledActorModelScaleCorrection("RYO_M"), 1);
});

test("an installed SHA_L animation removes the bind-only correction", () => {
  let worldMatrixRefreshes = 0;
  const scaling = {
    x: 0.1,
    setAll(value) {
      this.x = value;
    },
  };
  const model = {
    modelCode: "SHA_L",
    root: {
      scaling,
      computeWorldMatrix(force) {
        assert.equal(force, true);
        worldMatrixRefreshes += 1;
      },
    },
  };
  assert.equal(applyScheduledActorAnimatedScale(model), true);
  assert.equal(scaling.x, 1);
  assert.equal(worldMatrixRefreshes, 1);
  assert.equal(applyScheduledActorAnimatedScale(model), false);
  assert.equal(worldMatrixRefreshes, 1);
});

test("scheduled actor debug identity uses its stable instance ID", () => {
  const root = {
    parent: null,
    metadata: {
      scheduledActor: "KISY",
      scheduledActorLabel: "Keiko Sato",
      scheduledActorInstanceId: "KISY:5bff6f360a6a",
    },
  };
  const mesh = { parent: root, metadata: {} };

  assert.deepEqual(scheduledActorDebugIdentity(mesh), {
    name: "Keiko Sato",
    id: "KISY:5bff6f360a6a",
  });
  assert.deepEqual(scheduledActorSelection(mesh), {
    name: "Keiko Sato",
    id: "KISY:5bff6f360a6a",
    actorCode: "KISY",
    root,
  });
  assert.equal(scheduledActorDebugIdentity({ parent: null }), null);
});

test("scheduled actor debug picking retries past an unrelated direct hit", () => {
  const actorRoot = {
    parent: null,
    metadata: {
      scheduledActorLabel: "Keiko Sato",
      scheduledActorInstanceId: "KISY:5bff6f360a6a",
    },
  };
  const actorMesh = {
    parent: actorRoot,
    metadata: { scheduledActorDebugSelectionProxy: true },
  };
  let predicateAcceptedActor = false;
  const scene = {
    pick(x, y, predicate, fastCheck, camera) {
      assert.equal(x, 320);
      assert.equal(y, 180);
      assert.equal(fastCheck, false);
      assert.equal(camera, "camera");
      predicateAcceptedActor = predicate(actorMesh);
      return { pickedMesh: actorMesh };
    },
  };

  assert.deepEqual(
    pickScheduledActorDebugIdentity(
      scene,
      "camera",
      320,
      180,
      { pickedMesh: { parent: null, metadata: {} } },
    ),
    {
      name: "Keiko Sato",
      id: "KISY:5bff6f360a6a",
    },
  );
  assert.equal(predicateAcceptedActor, true);
});

test("scheduled actor selection exposes its actor root for interaction", () => {
  const actorRoot = {
    parent: null,
    metadata: {
      scheduledActor: "HATO",
      scheduledActorLabel: "Yoshifumi Hato",
      scheduledActorInstanceId: "HATO:example",
    },
  };
  const actorMesh = {
    parent: actorRoot,
    metadata: { scheduledActorDebugSelectionProxy: true },
  };
  const selection = pickScheduledActorSelection(
    {
      pick() {
        return { pickedMesh: actorMesh };
      },
    },
    "camera",
    10,
    20,
  );

  assert.equal(selection.actorCode, "HATO");
  assert.equal(selection.root, actorRoot);
});

test("scheduled actor debug boxes follow animated rig bounds", () => {
  const proxy = {
    position: BABYLON.Vector3.Zero(),
    scaling: BABYLON.Vector3.One(),
  };
  assert.equal(updateScheduledActorDebugSelectionProxy(
    proxy,
    {
      minimum: [-0.3, 1.1, -0.2],
      maximum: [0.3, 2.9, 0.2],
    },
    1,
  ), true);
  assert.deepEqual(proxy.position.asArray(), [0, 2, 0]);
  assert.ok(Math.abs(proxy.scaling.x - 0.6) < 1e-9);
  assert.ok(Math.abs(proxy.scaling.y - 1.8) < 1e-9);
  assert.ok(Math.abs(proxy.scaling.z - 0.45) < 1e-9);
});

test("scheduled actor grounding places visible geometry above authored ground", () => {
  const visibleMesh = {
    isEnabled: () => true,
    getTotalVertices: () => 12,
    computeWorldMatrix() {},
    refreshBoundingInfo() {},
    getBoundingInfo: () => ({
      boundingBox: { minimumWorld: { y: -1.06 } },
    }),
  };
  const hiddenMesh = {
    ...visibleMesh,
    isEnabled: () => false,
    getBoundingInfo: () => ({
      boundingBox: { minimumWorld: { y: -100 } },
    }),
  };
  const root = {
    isEnabled: () => true,
    getTotalVertices: () => 0,
    getDescendants: () => [visibleMesh, hiddenMesh],
  };

  assert.ok(
    Math.abs(scheduledActorGroundOffset(root) - 1.063) < 1e-9,
  );
});

test("scheduled actor turns interpolate along the shortest angular path", () => {
  const current = BABYLON.Tools.ToRadians(179);
  const target = BABYLON.Tools.ToRadians(-179);
  const result = scheduledActorInterpolatedYaw(current, target, 1 / 60);

  assert.ok(result > current);
  assert.ok(result - current < BABYLON.Tools.ToRadians(2));
  assert.equal(scheduledActorInterpolatedYaw(current, target, 0), current);
});

test("scheduled actor turn continuity rejects schedule teleports", () => {
  assert.equal(
    scheduledActorTurnIsContinuous([1, 0, 1], [1.1, 0, 1.2], 1 / 60),
    true,
  );
  assert.equal(
    scheduledActorTurnIsContinuous([1, 0, 1], [20, 0, 20], 1 / 60),
    false,
  );
});

test("scheduled actor secondary objects come from authored route codes", () => {
  assert.deepEqual(scheduledActorSecondaryObjectDefinition({
    secondaryObject: {
      objectCode: "BIKE",
      kind: "static-attachment",
      model: "S3_D000_BIK02BKG.MT5",
    },
  }), {
    objectCode: "BIKE",
    kind: "static-attachment",
    model: "S3_D000_BIK02BKG.MT5",
  });
  assert.equal(scheduledActorSecondaryObjectCode({
    journeys: [{
      operations: [{
        operation: 0x1c,
        secondaryObjectCode: "FK02",
      }],
    }],
  }), "FK02");
  assert.equal(scheduledActorSecondaryObjectCode({
    journeys: [{
      operations: [{
        operation: 1,
        secondaryObjectCode: "FK02",
      }],
    }],
  }), null);
  assert.deepEqual(scheduledActorSecondaryObjectDefinition({
    journeys: [{
      operations: [{
        operation: 0x24,
        secondaryObjectCode: "BIKE",
        enabled: true,
      }],
    }],
  }), {
    objectCode: "BIKE",
    kind: "static-attachment",
    model: "S3_D000_BIK02BKG.MT5",
  });
});

test("scheduled forklift seat offset follows its unrotated model frame", () => {
  const offset = scheduledForkliftDriverHorizontalOffset();
  assert.ok(Math.abs(offset.x) < 1e-12);
  assert.ok(Math.abs(offset.y) < 1e-12);
  assert.equal(offset.z, 0.45);
});

test("scheduled actor animation skips offscreen and occluded models", () => {
  const mesh = {
    isEnabled: () => true,
    isVisible: true,
    visibility: 1,
    isInFrustum: () => false,
  };
  const model = {
    renderMeshes: [mesh],
    occlusionMesh: { isOccluded: false },
  };
  assert.equal(scheduledActorModelShouldAnimate(model, [{}]), false);

  mesh.isInFrustum = () => true;
  assert.equal(scheduledActorModelShouldAnimate(model, [{}]), true);

  model.occlusionMesh.isOccluded = true;
  assert.equal(scheduledActorModelShouldAnimate(model, [{}]), false);
});

test("scheduled actor visibility shares the actor-level frustum proxy", () => {
  const model = {
    renderMeshes: [{
      isEnabled: () => true,
      isVisible: true,
      visibility: 1,
      isInFrustum: () => true,
    }],
    occlusionMesh: {
      isEnabled: () => true,
      isInFrustum: () => false,
    },
  };
  assert.equal(scheduledActorModelIsInFrustum(model, [{}]), false);
  model.occlusionMesh.isInFrustum = () => true;
  assert.equal(scheduledActorModelIsInFrustum(model, [{}]), true);
});

test("scheduled actor animation uses its one actor-level culling proxy", () => {
  let bodyChecks = 0;
  const model = {
    renderMeshes: [{
      isEnabled: () => true,
      isVisible: true,
      visibility: 1,
      isInFrustum: () => {
        bodyChecks += 1;
        return true;
      },
    }],
    occlusionMesh: {
      isEnabled: () => true,
      isInFrustum: () => false,
      isOccluded: false,
    },
  };
  assert.equal(scheduledActorModelShouldAnimate(model, [{}]), false);
  assert.equal(bodyChecks, 0);
  model.occlusionMesh.isInFrustum = () => true;
  assert.equal(scheduledActorModelShouldAnimate(model, [{}]), true);
  assert.equal(bodyChecks, 0);
});

test("scheduled actor occlusion disables only the character render root", () => {
  const enabledStates = [];
  const renderRoot = {
    setEnabled(enabled) {
      enabledStates.push(enabled);
    },
  };
  const occlusionMesh = {
    isEnabled: () => true,
    isOccluded: false,
  };
  const model = { renderRoot, occlusionMesh };

  assert.equal(scheduledActorModelIsOccluded(model), false);
  assert.equal(setScheduledActorOcclusionCulled(model, false), false);

  occlusionMesh.isOccluded = true;
  assert.equal(scheduledActorModelIsOccluded(model), true);
  assert.equal(setScheduledActorOcclusionCulled(model, true), true);
  assert.deepEqual(enabledStates, [false]);

  // Stable query results must not dirty the render hierarchy every frame.
  assert.equal(setScheduledActorOcclusionCulled(model, true), false);
  assert.deepEqual(enabledStates, [false]);

  occlusionMesh.isOccluded = false;
  assert.equal(setScheduledActorOcclusionCulled(model, false), true);
  assert.deepEqual(enabledStates, [false, true]);
  assert.equal(occlusionMesh.isEnabled(), true);
});

test("inactive occlusion proxies cannot hide scheduled actor models", () => {
  const model = {
    occlusionMesh: {
      isEnabled: () => false,
      // Babylon can retain the previous query result after the actor's
      // placement root is disabled.
      isOccluded: true,
    },
  };
  assert.equal(scheduledActorModelIsOccluded(model), false);
});

test("scheduled actors fade while between the player and camera", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const proxy = BABYLON.MeshBuilder.CreateBox("npc_occlusion", {
    width: 0.75,
    height: 2,
    depth: 0.5,
  }, scene);
  proxy.position.set(0, 0, 2);
  proxy.computeWorldMatrix(true);
  const opaqueMaterial = new BABYLON.StandardMaterial("opaque", scene);
  const cutoutMaterial = new BABYLON.StandardMaterial("cutout", scene);
  cutoutMaterial.transparencyMode =
    BABYLON.StandardMaterial.MATERIAL_ALPHATEST;
  const opaqueMesh = BABYLON.MeshBuilder.CreateBox("opaque_piece", {}, scene);
  const cutoutMesh = BABYLON.MeshBuilder.CreateBox("cutout_piece", {}, scene);
  opaqueMesh.material = opaqueMaterial;
  cutoutMesh.material = cutoutMaterial;
  cutoutMesh._mt5AlphaToCoverage = true;
  const renderMeshes = [opaqueMesh, cutoutMesh];
  const model = { occlusionMesh: proxy, renderMeshes };

  assert.equal(scheduledActorModelBlocksCamera(
    model,
    BABYLON.Vector3.Zero(),
    new BABYLON.Vector3(0, 0, 5),
  ), false);
  assert.equal(scheduledActorModelBlocksCamera(
    model,
    BABYLON.Vector3.Zero(),
    new BABYLON.Vector3(0, 0, 4),
  ), true);
  assert.equal(scheduledActorModelBlocksCamera(
    model,
    BABYLON.Vector3.Zero(),
    new BABYLON.Vector3(4, 0, 0),
  ), false);

  setScheduledActorCameraFade(model, true);
  assert.notEqual(opaqueMesh.material, opaqueMaterial);
  assert.equal(opaqueMesh.material.alpha, 0.5);
  assert.equal(
    opaqueMesh.material.transparencyMode,
    BABYLON.StandardMaterial.MATERIAL_ALPHABLEND,
  );
  assert.equal(
    cutoutMesh.material.transparencyMode,
    BABYLON.StandardMaterial.MATERIAL_ALPHATESTANDBLEND,
  );
  assert.equal(cutoutMesh._mt5DisableAlphaToCoverage, true);
  setScheduledActorCameraFade(model, false);
  assert.equal(opaqueMesh.material, opaqueMaterial);
  assert.equal(cutoutMesh.material, cutoutMaterial);
  assert.equal(cutoutMesh._mt5DisableAlphaToCoverage, undefined);

  scene.dispose();
  engine.dispose();
});

test("scheduled actors restore materials for cutscenes and resume camera fading afterward", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const camera = new BABYLON.FreeCamera(
      "cutscene_camera",
      new BABYLON.Vector3(0, 0, 4),
      scene,
    );
    scene.activeCamera = camera;
    const material = new BABYLON.StandardMaterial("actor", scene);
    const mesh = BABYLON.MeshBuilder.CreateBox("actor_mesh", {}, scene);
    mesh.material = material;
    const proxy = BABYLON.MeshBuilder.CreateBox("occlusion", {
      width: 0.75, height: 2, depth: 0.5,
    }, scene);
    proxy.position.z = 2;
    proxy.computeWorldMatrix(true);
    const model = { renderMeshes: [mesh], occlusionMesh: proxy };
    let cutsceneActive = false;

    const runtime = new ScheduledActorRuntime({
      scene,
      state: { currentMeshes: [] },
      fetchArrayBuffer: async () => null,
      bundledCharacterAsset() {},
      bundledCharacterModels: {},
      bundledCharacterTextures: {},
      suppressDetachedCharacterVariants() {},
      getActiveWorldId: () => "yamanose",
      getCameraOcclusionTarget: () => BABYLON.Vector3.Zero(),
      getCameraFadeEnabled: () => !cutsceneActive,
    });
    runtime.entries = [{ defaultModel: model, models: new Map() }];
    runtime.updateEntry = () => {};
    camera.computeWorldMatrix(true);
    runtime.update(0);
    assert.notEqual(mesh.material, material);
    assert.equal(mesh.material.alpha, 0.5);
    cutsceneActive = true;
    runtime.update(0);

    assert.equal(mesh.material, material);
    assert.equal(model.cameraFadeState, null);
    cutsceneActive = false;
    runtime.update(0);
    assert.notEqual(mesh.material, material);
    assert.equal(mesh.material.alpha, 0.5);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("scheduled forklift keeps the authored actor root and faces its route", () => {
  const runtime = new ScheduledActorRuntime({
    scene: null,
    state: { currentMeshes: [] },
    fetchArrayBuffer: async () => null,
    bundledCharacterAsset() {},
    bundledCharacterModels: {},
    bundledCharacterTextures: {},
    suppressDetachedCharacterVariants() {},
    getGameDate: () => new Date("1986-06-09T16:20:00Z"),
    getServerWorldState: () => null,
    getActiveWorldId: () => "mfsy",
  });
  const standingPosition = new BABYLON.Vector3(4, 5, 6);
  const renderRoot = {
    position: standingPosition.clone(),
  };
  const secondaryRoot = {
    parent: null,
    position: BABYLON.Vector3.Zero(),
    rotation: BABYLON.Vector3.Zero(),
    rotationQuaternion: null,
    enabled: false,
    setEnabled(enabled) {
      this.enabled = enabled;
    },
  };
  const secondary = {
    kind: "forklift",
    root: secondaryRoot,
    state: {
      wheelRoll: 0,
      steeringAngle: 0,
    },
    rig: { apply() {} },
    previousPosition: null,
    previousYaw: null,
  };
  const actorRoot = { metadata: {} };
  const model = {
    renderRoot,
    standingRenderPosition: standingPosition,
  };
  const active = runtime.updateSecondaryObject(
    {
      secondaryObject: secondary,
      models: new Map([["SGF_L", model]]),
    },
    actorRoot,
    model,
    {
      secondaryObjectCode: "FK02",
      position: [1, 0, 2],
      rootYaw: 0.5,
    },
  );

  assert.equal(active, true);
  assert.equal(secondaryRoot.enabled, true);
  assert.equal(secondaryRoot.parent, actorRoot);
  assert.deepEqual(secondaryRoot.rotation.asArray(), [0, 0, 0]);
  assert.deepEqual(renderRoot.position.asArray(), [4, 5, 6.45]);
});

test("scheduled bikes remain at their authored attachment transform", () => {
  const runtime = new ScheduledActorRuntime({
    scene: null,
    state: { currentMeshes: [] },
    fetchArrayBuffer: async () => null,
    bundledCharacterAsset() {},
    bundledCharacterModels: {},
    bundledCharacterTextures: {},
    suppressDetachedCharacterVariants() {},
    getGameDate: () => new Date("1986-06-09T16:20:00Z"),
    getServerWorldState: () => null,
    getActiveWorldId: () => "dobuita",
  });
  const secondaryRoot = {
    parent: {},
    position: BABYLON.Vector3.Zero(),
    rotation: BABYLON.Vector3.Zero(),
    rotationQuaternion: null,
    enabled: false,
    setEnabled(enabled) {
      this.enabled = enabled;
    },
  };
  const standingPosition = new BABYLON.Vector3(4, 5, 6);
  const model = {
    renderRoot: { position: standingPosition.clone() },
    standingRenderPosition: standingPosition,
  };
  const actorRoot = { metadata: {} };
  const active = runtime.updateSecondaryObject(
    {
      definition: {
        defaultArea: "D000",
        areaWorlds: { D000: "dobuita" },
      },
      secondaryObject: {
        kind: "static-attachment",
        objectCode: "BIKE",
        root: secondaryRoot,
        previousPosition: null,
        previousYaw: null,
      },
      models: new Map([["SBY_L", model]]),
    },
    actorRoot,
    model,
    {
      area: "SHOP",
      secondaryAttachments: [{
        objectCode: "BIKE",
        area: "D000",
        position: [-19.12, 0, 51.1],
        rootYaw: -Math.PI,
      }],
    },
  );

  assert.equal(active, false);
  assert.equal(secondaryRoot.enabled, true);
  assert.equal(secondaryRoot.parent, null);
  assert.deepEqual(
    secondaryRoot.position.asArray(),
    [-19.12, 0, 51.1],
  );
  assert.deepEqual(
    secondaryRoot.rotation.asArray(),
    [0, -Math.PI, 0],
  );
  assert.equal(
    actorRoot.metadata.scheduledActorSecondaryObjectActive,
    false,
  );
  assert.deepEqual(model.renderRoot.position.asArray(), [4, 5, 6]);
});

test("destination world owns scheduled props before it becomes globally active", async () => {
  const runtime = new ScheduledActorRuntime({
    scene: null,
    state: { currentMeshes: [] },
    fetchArrayBuffer: async () => null,
    bundledCharacterAsset() {},
    bundledCharacterModels: {},
    bundledCharacterTextures: {},
    suppressDetachedCharacterVariants() {},
    getGameDate: () => new Date("1986-06-09T16:20:00Z"),
    getServerWorldState: () => null,
    // This is intentionally the world being left. WorldLoader does not
    // publish the destination globally until its geometry and actors load.
    getActiveWorldId: () => "dobuita",
  });

  await runtime.load([], null, "mfsy");

  assert.equal(runtime.runtimeWorldId(), "mfsy");
});

test("static scheduled actors retain their authored transform", () => {
  const root = {
    position: BABYLON.Vector3.Zero(),
    rotation: BABYLON.Vector3.Zero(),
    metadata: { scheduledActorGroundOffset: 1.25 },
    enabled: false,
    setEnabled(enabled) {
      this.enabled = enabled;
    },
    computeWorldMatrix() {},
  };
  const runtime = new ScheduledActorRuntime({
    scene: null,
    state: { currentMeshes: [] },
    fetchArrayBuffer: async () => null,
    bundledCharacterAsset() {},
    bundledCharacterModels: {},
    bundledCharacterTextures: {},
    suppressDetachedCharacterVariants() {},
    getGameDate: () => new Date("1986-06-09T16:20:00Z"),
    getServerWorldState: () => null,
    getActiveWorldId: () => "arcade",
  });
  runtime.entries = [{
    definition: {
      actorCode: "TEST",
      position: [1, 2, 3],
      rotationDegrees: [0, 90, 0],
    },
    root,
    modelRoots: new Map(),
    secondaryRouteController: null,
    secondaryRouteTickAccumulator: 0,
  }];

  runtime.update(0);

  assert.equal(root.enabled, true);
  assert.deepEqual(root.position.asArray(), [1, 3.25, 3]);
  assert.ok(Math.abs(root.rotation.y - Math.PI / 2) < 1e-9);
  runtime.clear();
  assert.equal(runtime.entries.length, 0);
});

test("scheduled actors apply only activated dialogue FACE targets", () => {
  const root = {
    position: BABYLON.Vector3.Zero(),
    rotation: BABYLON.Vector3.Zero(),
    metadata: { scheduledActorGroundOffset: 0 },
    enabled: false,
    setEnabled(enabled) {
      this.enabled = enabled;
    },
    computeWorldMatrix() {},
  };
  const runtime = new ScheduledActorRuntime({
    scene: null,
    state: { currentMeshes: [] },
    fetchArrayBuffer: async () => null,
    bundledCharacterAsset() {},
    bundledCharacterModels: {},
    bundledCharacterTextures: {},
    suppressDetachedCharacterVariants() {},
    getActiveWorldId: () => "dobuita",
  });
  runtime.entries = [{
    definition: {
      instanceId: "AKSK:example",
      actorCode: "AKSK",
      position: [1, 0, 2],
      rotationDegrees: [0, 90, 0],
    },
    root,
    modelRoots: new Map(),
  }];

  assert.equal(runtime.setDialogueFacingTarget(
    "AKSK:example",
    [1, 1.5, 6],
  ), true);
  runtime.update(0);
  assert.ok(Math.abs(root.rotation.y - Math.PI / 2) < 1e-9);

  assert.equal(runtime.setDialogueFacingTarget(
    "AKSK:example",
    [1, 1.5, 6],
    { activate: true },
  ), true);
  runtime.update(0);
  assert.equal(root.rotation.y, 0);

  assert.equal(runtime.clearDialogueFacingTarget("AKSK:example"), true);
  runtime.update(0);
  assert.ok(Math.abs(root.rotation.y - Math.PI / 2) < 1e-9);

  assert.equal(runtime.setDialogueFacingOffset(
    "AKSK:example",
    [0.001, 0, 0],
    { activate: true },
  ), true);
  runtime.update(0);
  assert.equal(root.rotation.y, Math.PI / 2);
});
