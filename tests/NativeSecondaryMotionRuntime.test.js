import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import { Mt5Loader } from "../src/Mt5Loader.js";
import {
  buildNativeSecondaryMotionRestPoints,
  createNativeSecondaryMotionPresentation,
  discoverNativeSecondaryMotionChains,
  NativeSecondaryMotionChain,
} from "../play/characters/NativeSecondaryMotionRuntime.js";
import {
  NATIVE_OSAG_ARTICULATED_SURFACE_NODE_TYPE,
  NATIVE_OSAG_STRAND_NODE_TYPE,
  nativeSecondaryMotionModelIdentity,
  nativeSecondaryMotionNodeTypes,
  nativeSecondaryMotionProfile,
} from "../play/characters/NativeSecondaryMotionProfiles.js";
import {
  buildNativeActorCollisionProxy,
  nativeSecondaryMotionCollisionProfile,
  nativeSecondaryMotionNodeCollisionParameters,
  projectNativeVariableRadiusSpan,
  resolveNativeActorCollision,
} from "../play/characters/NativeSecondaryMotionCollision.js";
import {
  controllerFamilyByIndex,
} from "../play/characters/NpcControllerFamilies.js";

function arrayBufferForFile(filename) {
  const buffer = fs.readFileSync(filename);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

function worldPoint(model, nodeAddress) {
  const matrix = model.renderRoot._mt5CharacterWorldMatrices.get(nodeAddress);
  const sourcePoint = new BABYLON.Vector3(matrix[12], matrix[13], matrix[14]);
  const space = (
    model.renderRoot._mt5CharacterContentRoot
    || model.renderRoot
  );
  return BABYLON.Vector3.TransformCoordinates(
    sourcePoint,
    space.computeWorldMatrix(true),
  );
}

test("native secondary-motion profiles use model identity, not cutscene actor tags", () => {
  assert.equal(nativeSecondaryMotionModelIdentity("KOK_M"), "KOK");
  assert.equal(nativeSecondaryMotionModelIdentity("kok_l"), "KOK");
  assert.ok(Math.abs(nativeSecondaryMotionProfile({
    modelCode: "KOK_M",
    nodeType: 0x78,
  }).damping - 0.5999999642372131) < 1e-8);
  assert.ok(Math.abs(nativeSecondaryMotionProfile({
    modelCode: "KOK_M",
    nodeType: 0x78,
  }).gravityStepByMode[2] - 0.034999996423721313) < 1e-8);
  assert.equal(nativeSecondaryMotionProfile({
    modelCode: "KOK_M",
    nodeType: 0x79,
  }), null);
  assert.deepEqual(nativeSecondaryMotionNodeTypes({
    modelCode: "MGR_M",
    runtimeMode: 1,
  }), [0x78, 0x79, 0x81]);
  assert.ok(Math.abs(nativeSecondaryMotionProfile({
    modelCode: "MGR_M",
    nodeType: NATIVE_OSAG_STRAND_NODE_TYPE,
    runtimeMode: 1,
  }).turbulenceStep - 0.0057553028337186726) < 1e-12);
  assert.ok(Math.abs(nativeSecondaryMotionProfile({
    modelCode: "MGR_M",
    nodeType: NATIVE_OSAG_ARTICULATED_SURFACE_NODE_TYPE,
    runtimeMode: 1,
  }).angularAmplitudeDegrees - 1.5) < 1e-12);
});

test("native MGR type-0x81 evidence identifies an angular surface, not body capsules", () => {
  const evidence = JSON.parse(fs.readFileSync(
    "tools/evidence/shenmue1-secondary-motion-handlers.json",
    "utf8",
  ));
  const handler = evidence.handlers["0x81"];
  assert.equal(handler.address, "0x0c135bec");
  assert.equal(handler.type78CollisionDispatcher, null);
  assert.equal(handler.constants.secondaryPhaseStepDegrees.value, -15);
  assert.equal(handler.constants.primaryPhaseStepDegrees.value, 10);
  assert.deepEqual(
    handler.runtimeObservation.settledAngularAmplitudesDegrees,
    [1.5],
  );
  assert.deepEqual(handler.runtimeObservation.angularBiasesDegrees, [-1.5]);
  assert.deepEqual(handler.runtimeObservation.observedModes, [0, 1, 2, 3]);
  assert.equal(handler.runtimeObservation.recordAddresses.length, 7);
});

test("OP02 Shenhua exposes her captured strand and articulated-surface families", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const loader = new Mt5Loader(scene, {
      backFaceCulling: false,
      characterRigMode: "gpu",
      mirrorCharacterX: true,
    });
    const [renderRoot] = await loader.load(
      arrayBufferForFile("play/assets/introduction/op02/models/MGR_M.CHRM"),
      null,
      { sourceFilename: "MGR_M.CHRM" },
    );
    const chains = discoverNativeSecondaryMotionChains(renderRoot, {
      nodeTypes: nativeSecondaryMotionNodeTypes({
        modelCode: "MGR_M",
        runtimeMode: 1,
      }),
    });
    const byType = new Map();
    for (const chain of chains) {
      const type = chain[0].flag & 0xffff;
      byType.set(type, (byType.get(type) || 0) + 1);
    }
    assert.equal(byType.get(0x78), 2);
    assert.equal(byType.get(0x79), 10);
    assert.equal(byType.get(0x81), 2);

    const actorRoot = new BABYLON.TransformNode("shenhua", scene);
    renderRoot.parent = actorRoot;
    const controllerFamily = controllerFamilyByIndex(15);
    const model = {
      loader,
      renderRoot,
      root: actorRoot,
      modelCode: "MGR_M",
      characterAssetFormat: "MT5",
      nativeSecondaryMotionRuntimeMode: 1,
      latestRetargetedRoutes: null,
      latestControllerFamily: controllerFamily,
      latestControllerMatrices: controllerFamily.nodes.map(
        () => BABYLON.Matrix.Identity().asArray(),
      ),
    };
    const actors = {
      activeActor: actorTag => actorTag === "SINF"
        ? { actorCode: actorTag, root: actorRoot, model }
        : null,
    };
    const runtime = createNativeSecondaryMotionPresentation({ actors });
    const owner = {};
    const strand = chains.find(chain => (
      (chain[0].flag & 0xffff) === NATIVE_OSAG_STRAND_NODE_TYPE
    ));
    const articulatedSurface = chains.find(chain => (
      (chain[0].flag & 0xffff) === NATIVE_OSAG_ARTICULATED_SURFACE_NODE_TYPE
    ));
    assert.equal(runtime.begin(owner, ["SINF"]), true);
    assert.equal(runtime.apply(owner, { frame: 0 }), true);
    const initial = worldPoint(model, strand[1].addr);
    const initialSleeve = worldPoint(model, articulatedSurface.at(-1).addr);
    assert.equal(runtime.apply(owner, { frame: 1 }), true);
    const windSolved = worldPoint(model, strand[1].addr);
    const articulatedSleeve = worldPoint(
      model,
      articulatedSurface.at(-1).addr,
    );
    assert.ok(BABYLON.Vector3.Distance(initial, windSolved) > 1e-5);
    assert.ok(
      BABYLON.Vector3.Distance(initialSleeve, articulatedSleeve) > 1e-6,
    );
    assert.equal(runtime.end(owner), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("native OSAG records own a following mode-scaled endpoint", () => {
  const origins = [
    new BABYLON.Vector3(0, 0, 0),
    new BABYLON.Vector3(0, -1, 0),
    new BABYLON.Vector3(0, -2, 0),
  ];
  const points = buildNativeSecondaryMotionRestPoints(origins, [
    { radius: 0.8 },
    { radius: 1.2 },
    { radius: 1.5 },
  ]);

  assert.equal(points.length, 4);
  assert.deepEqual(points.map(point => point.y), [0, -0.8, -2, -3.5]);
});

test("native KOK collision metadata builds the authored animated body proxy", () => {
  const evidence = JSON.parse(fs.readFileSync(
    "tools/evidence/shenmue1-secondary-motion-collision.json",
    "utf8",
  ));
  const profile = nativeSecondaryMotionCollisionProfile("KOK_M");
  const controllerFamily = controllerFamilyByIndex(10);
  const controllerMatrices = controllerFamily.nodes.map((node) => (
    BABYLON.Matrix.Translation(node.index, node.type, -node.index).asArray()
  ));
  const proxy = buildNativeActorCollisionProxy({
    profile,
    controllerFamily,
    controllerMatrices,
  });
  const { spans } = proxy;

  assert.deepEqual(spans.map(span => span.length), [
    2, 2, 4, 2, 2, 2, 2, 2, 2, 4, 2, 2,
  ]);
  assert.equal(profile.sourceAddress, "0x0c297f98");
  assert.equal(
    evidence.source.executableSha256,
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c",
  );
  assert.equal(
    evidence.code.secondaryMotionHandler.sha256,
    "48ff605c76108c07bcef574d38258f951a5a3322ed831a439ceec19b34e468f9",
  );
  assert.deepEqual(
    evidence.source.runtimeObservation.osagModes,
    Array.from({ length: 14 }, (_value, index) => index),
  );
  assert.equal(profile.points.length, 28);
  const headController = controllerFamily.nodes.find(node => node.type === 47);
  assert.deepEqual(
    spans[0][0].center.asArray().map(value => Math.fround(value)),
    [
      Math.fround(headController.index + 0.01),
      Math.fround(47),
      Math.fround(-headController.index + 0.12),
    ],
  );
  assert.ok(Math.abs(spans[0][0].radius - 0.11) < 1e-8);
});

test("native variable-radius span projection preserves dispatcher correction semantics", () => {
  const profile = nativeSecondaryMotionCollisionProfile("KOK_M");
  const span = [
    { center: new BABYLON.Vector3(0, 0, 0), radius: 0.2 },
    { center: new BABYLON.Vector3(1, 0, 0), radius: 0.2 },
  ];
  const query = new BABYLON.Vector3(0.5, 0, 0);
  const projected = projectNativeVariableRadiusSpan(
    query,
    span,
    0,
    profile.projection,
  );
  assert.equal(projected.hit, true);
  assert.ok(Math.abs(projected.point.x - 0.4) < 1e-6);

  const origin = new BABYLON.Vector3(0.1, 0, 0);
  const resolved = resolveNativeActorCollision(origin, query, [span], {
    nodeRadius: 0.02,
    clearance: 0,
    projection: profile.projection,
  });
  assert.equal(resolved.hit, true);
  assert.ok(Math.abs(resolved.point.x - 0.12) < 1e-6);
  assert.ok(Math.abs(
    BABYLON.Vector3.Distance(origin, resolved.point) - 0.02
  ) < 1e-6);
});

test("native contact correction is retained as the current OSAG endpoint", () => {
  const profile = nativeSecondaryMotionCollisionProfile("KOK_M");
  const chain = new NativeSecondaryMotionChain([{}, {}], {
    damping: 0,
    gravity: 0,
    restoring: 0,
    maximumDeflectionRadians: Math.PI,
    constraintIterations: 1,
    maximumStepDistance: 1,
    resetDistance: 1,
  });
  const base = [
    new BABYLON.Vector3(0, 0, 0),
    new BABYLON.Vector3(0.05, 0, 0),
    new BABYLON.Vector3(0.1, 0, 0),
  ];
  const collision = {
    spans: [[
      { center: new BABYLON.Vector3(0.025, 0.02, 0), radius: 0.04 },
      { center: new BABYLON.Vector3(0.025, 0.02, 0), radius: 0.04 },
    ]],
    nodeParameters: [
      { radius: 0.05, clearance: 0 },
      { radius: 0.05, clearance: 0 },
    ],
    projection: profile.projection,
  };

  chain.update(base, collision);
  assert.ok(chain.points[1].y < -0.004);
  assert.ok(Math.abs(
    BABYLON.Vector3.Distance(chain.points[0], chain.points[1]) - 0.05
  ) < 1e-8);
  assert.equal(chain.previousPoints[1].x, base[1].x);
  for (let frame = 0; frame < 120; frame += 1) {
    chain.update(base, collision);
  }
  const restingContact = chain.points[1].clone();
  for (let frame = 0; frame < 120; frame += 1) {
    chain.update(base, collision);
    assert.ok(BABYLON.Vector3.Distance(
      chain.points[1],
      restingContact,
    ) < 1e-8);
  }
});

test("native KOK node collision uses child vectors and chain modes", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const loader = new Mt5Loader(scene, {
      backFaceCulling: false,
      characterRigMode: "gpu",
      mirrorCharacterX: true,
    });
    const [renderRoot] = await loader.load(
      arrayBufferForFile("play/assets/characters/KOK_M.CHRM"),
      null,
      { sourceFilename: "KOK_M.CHRM" },
    );
    const chain = discoverNativeSecondaryMotionChains(renderRoot)[0];
    const profile = nativeSecondaryMotionCollisionProfile("KOK_M");
    const parameters = nativeSecondaryMotionNodeCollisionParameters(
      chain,
      profile,
    );

    assert.equal(parameters.length, 14);
    assert.ok(Math.abs(
      parameters[0].radius - Math.hypot(
        chain[1].pos.x,
        chain[1].pos.y,
        chain[1].pos.z,
      ) * 0.8
    ) < 1e-8);
    assert.ok(Math.abs(
      parameters[2].radius - 0.06520799547433853
    ) < 1e-8);
    assert.ok(Math.abs(
      parameters[13].radius - Math.hypot(
        chain[13].pos.x,
        chain[13].pos.y,
        chain[13].pos.z,
      ) * 1.5
    ) < 1e-8);
    assert.ok(Math.abs(parameters[0].clearance - 0.015) < 1e-8);
    assert.ok(Math.abs(parameters[1].clearance - 0.01) < 1e-8);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("native secondary motion discovers and animates Lan Di's authored OSAG chain", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const loader = new Mt5Loader(scene, {
      backFaceCulling: false,
      characterRigMode: "gpu",
      mirrorCharacterX: true,
    });
    const [renderRoot] = await loader.load(
      arrayBufferForFile("play/assets/characters/KOK_M.CHRM"),
      null,
      { sourceFilename: "KOK_M.CHRM" },
    );
    const actorRoot = new BABYLON.TransformNode("lan-di", scene);
    renderRoot.parent = actorRoot;
    const controllerFamily = controllerFamilyByIndex(10);
    const model = {
      loader,
      renderRoot,
      root: actorRoot,
      modelCode: "KOK_M",
      characterAssetFormat: "MT5",
      latestRetargetedRoutes: null,
      latestControllerFamily: controllerFamily,
      latestControllerMatrices: controllerFamily.nodes.map(
        () => BABYLON.Matrix.Identity().asArray(),
      ),
    };
    const chains = discoverNativeSecondaryMotionChains(renderRoot);
    assert.equal(chains.length, 1);
    assert.equal(chains[0].length, 14);
    assert.ok(chains[0].every(node => (node.flag & 0xffff) === 0x78));

    const actors = {
      activeActor: actorTag => actorTag === "VILN"
        ? { actorCode: actorTag, root: actorRoot, model }
        : null,
    };
    const runtime = createNativeSecondaryMotionPresentation({ actors });
    const owner = {};
    assert.equal(runtime.begin(owner, ["VILN"]), true);
    assert.equal(runtime.apply(owner, { frame: 0 }), true);

    const rootNode = chains[0][0];
    const followingNode = chains[0][1];
    const initialRoot = worldPoint(model, rootNode.addr);
    const initialFollower = worldPoint(model, followingNode.addr);
    const segmentLength = BABYLON.Vector3.Distance(
      initialRoot,
      initialFollower,
    );
    actorRoot.position.x = 0.2;
    actorRoot.computeWorldMatrix(true);
    assert.equal(runtime.apply(owner, { frame: 1 }), true);
    const movedRoot = worldPoint(model, rootNode.addr);
    const laggingFollower = worldPoint(model, followingNode.addr);

    assert.ok(Math.abs(movedRoot.x - initialRoot.x - 0.2) < 1e-6);
    assert.ok(laggingFollower.x > initialFollower.x);
    assert.ok(laggingFollower.x < movedRoot.x - 1e-4);
    assert.ok(Math.abs(
      BABYLON.Vector3.Distance(movedRoot, laggingFollower)
      - segmentLength
    ) < 1e-5);
    const constrainedDirection = laggingFollower.subtract(movedRoot).normalize();
    const authoredDirection = initialFollower.subtract(initialRoot).normalize();
    assert.ok(
      Math.acos(BABYLON.Scalar.Clamp(
        BABYLON.Vector3.Dot(authoredDirection, constrainedDirection),
        -1,
        1,
      )) <= 0.600001,
    );

    // A seek/teleport is not physical source motion. Reset instead of pulling
    // a retained chain state through the intervening world space.
    actorRoot.position.x = 2;
    actorRoot.computeWorldMatrix(true);
    assert.equal(runtime.apply(owner, { frame: 2 }), true);
    const resetFollower = worldPoint(model, followingNode.addr);
    assert.ok(
      Math.abs(resetFollower.x - initialFollower.x - 2) < 1e-6,
    );

    assert.equal(runtime.end(owner, "complete"), true);
    const restoredFollower = worldPoint(model, followingNode.addr);
    assert.ok(
      Math.abs(restoredFollower.x - initialFollower.x - 2) < 1e-6,
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
