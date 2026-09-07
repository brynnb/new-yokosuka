import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { parseMt7 } from "../src/Mt7Parser.js";
import {
  Mt7Loader,
  mt7BrowserVector,
  mt7RotationQuaternion,
} from "../src/Mt7Loader.js";
import {
  resolveShenmue2NativeMotionId,
  Shenmue2MotLoader,
  shenmue2MotionControllerIndicesForSlot,
} from "../src/Shenmue2MotLoader.js";
import {
  scheduledActorGroundOffset,
  scheduledMt7HumanoidMotionNodes,
} from
  "../play/characters/ScheduledActorRuntime.js";
import {
  applyShenmue2Mt7MotionPose,
  compactLegTargetDeltaBrowser,
  compactLegTargetPositionBrowser,
  compactTargetDeltaBrowser,
  configureShenmue2Mt7ControllerHierarchy,
  evaluateShenmue2Mt7ControllerPose,
  SHENMUE2_NATIVE_LAYER_BLEND_FRAMES,
  SHENMUE2_NATIVE_LAYER_SOURCE_TANGENT_SCALE,
  SHENMUE2_NATIVE_MOTION_BLEND_FRAMES,
  shenmue2NativeActorRelativeRotationQuaternion,
  shenmue2NativeLegReach,
  shenmue2NativeDirectionBlendRotationQuaternion,
  shenmue2NativeHeadLocalRotationQuaternion,
  shenmue2NativeHeadLocalPosition,
  shenmue2NativePelvisPrimaryRotationQuaternion,
  shenmue2NativePelvisOutputRotationQuaternion,
  shenmue2NativeRestProfileForNodes,
  solveShenmue2TwoBonePositions,
  scheduledActorShenmue2MotionSelection,
} from
  "../play/characters/ScheduledActorMotionRuntime.js";

test("S2 clip changes use the native eight-frame blend window", () => {
  assert.equal(SHENMUE2_NATIVE_MOTION_BLEND_FRAMES, 8);
});

test("S2 independent arm layers use the native twelve-frame Hermite window", () => {
  assert.equal(SHENMUE2_NATIVE_LAYER_BLEND_FRAMES, 12);
  assert.equal(SHENMUE2_NATIVE_LAYER_SOURCE_TANGENT_SCALE, 0.5);
});

test("S2 pelvis output composes controller 1 after controller 0", () => {
  const primary = { rx: 0.19, ry: -0.08, rz: 0.11 };
  const basis = { rx: -0.04, ry: 0.17, rz: -1.49 };
  const combined = shenmue2NativePelvisOutputRotationQuaternion(
    primary,
    basis,
  );
  const withoutBasis = shenmue2NativePelvisOutputRotationQuaternion(
    primary,
    { rx: 0, ry: 0, rz: 0 },
  );
  assert.ok(Math.abs(BABYLON.Quaternion.Dot(combined, withoutBasis)) < 0.9);
  assert.ok(Math.abs(combined.length() - 1) < 1e-6);
});

test("S2 captured pelvis intermediate removes and reflects the actor root", () => {
  const actorRoot = BABYLON.Matrix.RotationY(0.31);
  actorRoot.setTranslation(new BABYLON.Vector3(12, 3, -8));
  const nativeRelative = BABYLON.Matrix.RotationYawPitchRoll(0.2, -0.1, 0.08);
  const nativeWorld = nativeRelative.multiply(actorRoot);
  const converted = shenmue2NativeActorRelativeRotationQuaternion(
    nativeWorld.asArray(),
    actorRoot.asArray(),
  );
  const reflection = BABYLON.Matrix.Scaling(-1, 1, 1);
  const expected = BABYLON.Quaternion.FromRotationMatrix(
    reflection.multiply(nativeRelative).multiply(reflection),
  ).normalize();
  assert.ok(1 - Math.abs(BABYLON.Quaternion.Dot(converted, expected)) < 1e-9);
});

test("S2 mode-one arm roots retain native fixed-turn blending", () => {
  const rotation = shenmue2NativeDirectionBlendRotationQuaternion({
    currentFrame: 9,
    blendEndFrame: 12,
    targetForward: [0.9871639609336853, 0, -0.15971001982688904],
    targetUp: [0, 1, 0],
    sourceForward: [
      0.9999698400497437,
      0.00000967875894275494,
      0.0077656893990933895,
    ],
    sourceUp: [0, 0.9999992251396179, -0.0012463480234146118],
  });
  const reflectedNative = new BABYLON.Quaternion(
    0.0001543622421824608,
    0.05911963254163011,
    0.000010358901200520501,
    0.9982508928686887,
  );
  assert.ok(1 - Math.abs(BABYLON.Quaternion.Dot(
    rotation,
    reflectedNative,
  )) < 1e-9);
});

test("S2 mode-one pelvis callback consumes its native direction structure", () => {
  const directionBlend = {
    currentFrame: 9,
    blendEndFrame: 12,
    targetForward: [0.9871639609336853, 0, -0.15971001982688904],
    targetUp: [0, 1, 0],
    sourceForward: [
      0.9999698400497437,
      0.00000967875894275494,
      0.0077656893990933895,
    ],
    sourceUp: [0, 0.9999992251396179, -0.0012463480234146118],
  };
  const callbackRotation = shenmue2NativePelvisPrimaryRotationQuaternion(
    { rx: 1.2, ry: -0.8, rz: 0.4 },
    { branch: "direction-up-blend", directionBlend },
  );
  const helperRotation = shenmue2NativeDirectionBlendRotationQuaternion(
    directionBlend,
  );
  assert.ok(1 - Math.abs(BABYLON.Quaternion.Dot(
    callbackRotation,
    helperRotation,
  )) < 1e-12);
});

test("S2 current-actor head callback uses the native fixed target basis", () => {
  // Synchronized RYO_M / 0xf002 frame 2. FUN_8c0e7a40 is installed at slot
  // 2 +0x258, controller +0x26c0 is 1, and controller +0x04 selects basis 0.
  // The expected quaternion comes from native +0x1508 relative to +0x1168;
  // it is not a fitted browser correction.
  const rotation = shenmue2NativeHeadLocalRotationQuaternion({
    rootRotation: { rx: 0, ry: 0, rz: 0 },
    middleRotation: { rx: 0, ry: -1.603515625, rz: 3.1484375 },
    aimVector: {
      rx: 0.17485898733139038,
      ry: 1.1404383182525635,
      rz: -0.2614907920360565,
    },
    middleCallback: {
      kind: "current-actor-direction-blend",
      blendAmount: 1,
      basisVariant: 0,
    },
  });
  const native = new BABYLON.Quaternion(
    -0.473548775722624,
    -0.508908463560042,
    0.592898888955285,
    0.40649063974973637,
  );
  assert.ok(1 - Math.abs(BABYLON.Quaternion.Dot(
    rotation,
    native,
  )) < 1e-12);
});

test("S2 head placement rotates the second native rest-record segment", () => {
  // Exact JJ3_L / 0xe0e5 controller at native frame 200. FUN_8c1d4020
  // translates by KMN record +0x14 (0.2339), applies controller 11, then
  // translates by record +0x28 (0.053). The synchronized +0x1508 and
  // +0x1168 matrices independently expose this resulting local position.
  const position = shenmue2NativeHeadLocalPosition({
    rootRotation: {
      rx: -0.37860014465697733,
      ry: 0,
      rz: 0,
    },
    neckLength: 0.2339,
    headOffset: 0.053,
  });
  const expected = new BABYLON.Vector3(
    -0.2831534147262573,
    -0.019548602402210236,
    0.000013526049770007376,
  );
  // The retained world matrices are float32 and the browser recomputes the
  // fixed-turn transform from the captured descriptor value. Their 0.037 mm
  // difference is below one source-coordinate quantization step.
  assert.ok(BABYLON.Vector3.Distance(position, expected) < 5e-5);
});

test("S2 head callback reproduces a naturally captured source matrix", () => {
  // Natural SH-4 trace of actor 13G_ at 0x8c0e7a40. The callback saved this
  // live matrix at 0x8c0e7b5a, then the head solver saved the final output at
  // 0x8c1d44f4. These values are not reconstructed from post-render RAM.
  const source = BABYLON.Matrix.FromArray([
    0.0036431998014450073, 0, 0.9999933242797852, 0,
    -0.1111743152141571, -0.9938008189201355,
    0.0004050329443998635, 0,
    0.9937942028045654, -0.1111750602722168,
    -0.0036206149961799383, 0,
    0, 0, 0, 1,
  ]);
  const torso = BABYLON.Matrix.FromArray([
    0.3028095066547394, 0.9525018334388733, 0.03235481679439545, 0,
    -0.9441728591918945, 0.3044387996196747, -0.1259157806634903, 0,
    -0.12978506088256836, 0.007579956203699112, 0.9915132522583008, 0,
    226.14930725097656, 100.42245483398438, 409.5328063964844, 1,
  ]);
  const nativeHead = BABYLON.Matrix.FromArray([
    0.9487408995628357, -0.3156754672527313, 0.01548983994871378, 0,
    0.027431603521108627, 0.03342083841562271, -0.9990649223327637, 0,
    0.31486254930496216, 0.9482786059379578, 0.04036719352006912, 0,
    226.23619079589844, 100.69573211669922, 409.5420837402344, 1,
  ]);
  const callbackBrowser = BABYLON.Matrix.Compose(
    BABYLON.Vector3.One(),
    shenmue2NativeDirectionBlendRotationQuaternion({
      currentFrame: 0.10000000149011612,
      blendEndFrame: 1,
      targetForward: [0, 0, 1],
      targetUp: [0, -1, 0],
      sourceForward: [source.m[0], source.m[4], source.m[8]],
      sourceUp: [source.m[1], source.m[5], source.m[9]],
    }),
    BABYLON.Vector3.Zero(),
  );
  const reflection = BABYLON.Matrix.Scaling(-1, 1, 1);
  const callbackNative = reflection.multiply(callbackBrowser)
    .multiply(reflection);
  const aimVector = [
    -0.02175559662282467,
    0.19544780254364014,
    0.01718125119805336,
  ];
  const horizontal = Math.hypot(aimVector[0], aimVector[1]);
  const aim = BABYLON.Matrix.RotationY(-Math.atan2(
    aimVector[2], horizontal,
  )).multiply(BABYLON.Matrix.RotationZ(Math.atan2(
    aimVector[1], aimVector[0],
  )));
  const expected = aim.multiply(callbackNative).multiply(torso);
  const quaternion = (matrix) => {
    const value = BABYLON.Quaternion.Identity();
    assert.equal(matrix.decompose(undefined, value, undefined), true);
    return value.normalize();
  };
  assert.ok(1 - Math.abs(BABYLON.Quaternion.Dot(
    quaternion(expected),
    quaternion(nativeHead),
  )) < 1e-12);
});

test("S2 two-bone solving preserves authored limb lengths", () => {
  const root = new BABYLON.Vector3(0, 0, 0);
  const target = new BABYLON.Vector3(0.31, -0.25, 0.11);
  const upperLength = 0.277974;
  const lowerLength = 0.229545;
  const solved = solveShenmue2TwoBonePositions(
    root,
    target,
    upperLength,
    lowerLength,
    BABYLON.Axis.Z,
  );
  assert.ok(Math.abs(
    BABYLON.Vector3.Distance(root, solved.jointPosition) - upperLength,
  ) < 1e-6);
  assert.ok(Math.abs(
    BABYLON.Vector3.Distance(
      solved.jointPosition,
      solved.targetPosition,
    ) - lowerLength,
  ) < 1e-6);
  const direction = solved.targetPosition.subtract(root).normalize();
  const rootToJoint = solved.jointPosition.subtract(root);
  const bendComponent = rootToJoint.subtract(direction.scale(
    BABYLON.Vector3.Dot(rootToJoint, direction),
  ));
  const reflectedNativeBend = BABYLON.Vector3.Cross(
    solved.planeNormal,
    direction,
  ).normalize();
  assert.ok(BABYLON.Vector3.Dot(
    bendComponent,
    reflectedNativeBend,
  ) > 0);
  const legSolved = solveShenmue2TwoBonePositions(
    root,
    target,
    upperLength,
    lowerLength,
    BABYLON.Axis.Z,
    { reverseBend: true },
  );
  const legBend = legSolved.jointPosition.subtract(root).subtract(
    direction.scale(BABYLON.Vector3.Dot(
      legSolved.jointPosition.subtract(root),
      direction,
    )),
  );
  assert.ok(BABYLON.Vector3.Dot(
    legBend,
    BABYLON.Vector3.Cross(direction, legSolved.planeNormal),
  ) > 0);
});

test("S2 two-bone solving retains unreachable targets like S1", () => {
  const root = new BABYLON.Vector3(0, 0, 0);
  const target = new BABYLON.Vector3(3, -2, 1);
  const solved = solveShenmue2TwoBonePositions(
    root,
    target,
    0.4,
    0.3,
    BABYLON.Axis.Z,
  );
  assert.ok(solved.targetPosition.equals(target));
  assert.ok(BABYLON.Vector3.Distance(root, solved.targetPosition) > 0.7);
});

test("S2 arm target conversion reflects native X without a slot override", () => {
  const target = { rx: 0.2, ry: 0.7, rz: 0.1 };
  assert.deepEqual(
    compactTargetDeltaBrowser(target).asArray(),
    [-0.2, 0.7, 0.1],
  );
});

test("S2 leg targets retain the captured pelvis-relative stride", () => {
  // Unscaled absolute compact controls from f086 frame 8. Browser conversion
  // subtracts the root and reflects X; there is no extra native target scale.
  const target = {
    rx: 0.08782923840225264,
    ry: 0.1343551070601852,
    rz: -0.6507588704427083,
  };
  const root = {
    x: 0.001224517822265625,
    y: 0.8430508931477864,
    z: -0.36767578125,
  };
  const browser = compactLegTargetDeltaBrowser(target, root, 1);
  assert.ok(Math.abs(browser.x + 0.0866) < 1e-4);
  assert.ok(Math.abs(browser.y + 0.7087) < 1e-4);
  assert.ok(Math.abs(browser.z + 0.2831) < 1e-4);
});

test("S2 leg target positions retain native absolute actor-space Y", () => {
  const target = {
    rx: 0.08782923840225264,
    ry: 0.1343551070601852,
    rz: -0.6507588704427083,
  };
  const root = {
    x: 0.001224517822265625,
    y: 0.8430508931477864,
    z: -0.36767578125,
  };
  const browser = compactLegTargetPositionBrowser(target, root);
  assert.ok(Math.abs(browser.x + 0.08660472058) < 1e-9);
  assert.ok(Math.abs(browser.y - 0.13435510706) < 1e-9);
  assert.ok(Math.abs(browser.z + 0.28308308919) < 1e-9);
});

test("S2 scheduled actors select native idle and walk banks", () => {
  assert.deepEqual(
    scheduledActorShenmue2MotionSelection(
      {
        actorCode: "00A_",
        actorProfile: { ageCategory: 22, variant: 1, motionSubtype: 0 },
        modelVariantIndex: 0,
      },
      { moving: false },
    ),
    {
      motionId: 0x800f,
      bank: "npc",
      sequenceIndex: 14,
      name: "0x800f",
      loop: true,
    },
  );
  assert.deepEqual(
    scheduledActorShenmue2MotionSelection(
      { actorCode: "00A_" },
      { moving: true },
    ),
    {
      motionId: 0xf03e,
      bank: "motion",
      sequenceIndex: 61,
      name: "0xf03e",
      loop: true,
    },
  );
  assert.equal(scheduledActorShenmue2MotionSelection(
    { actorCode: "00G_" },
    { moving: true },
  ).motionId, 0xf060);
  assert.deepEqual(scheduledActorShenmue2MotionSelection(
    { actorCode: "08C_" },
    { moving: false, nativeMotionId: 0xa805 },
  ), {
    motionId: 0xa805,
    bank: "npcWT00",
    sequenceIndex: 4,
    name: "0xa805",
    loop: true,
  });
});

function sourceEntries(path) {
  return parseMt7(fs.readFileSync(path)).nodes.map((sourceNode) => ({
    sourceNode,
    transform: {
      position: {
        set(x, y, z) {
          this.x = x;
          this.y = y;
          this.z = z;
        },
      },
      rotationQuaternion: null,
    },
  }));
}

const npcMotionPath = new URL(
  "../play/assets/shenmue2-motion/NPC_TBL.MOT",
  import.meta.url,
);
const nativeNpcMotionPath = new URL(
  "../play/assets/shenmue2-motion/NPC.MOT",
  import.meta.url,
);
const globalMotionPath = new URL(
  "../play/assets/shenmue2-motion/MOTION.MOT",
  import.meta.url,
);
const ok1Path = new URL(
  "../play/assets/shenmue2-characters/OK1_L.CHRM",
  import.meta.url,
);

test("every bundled S2 character resolves every authored compact-MOT node", () => {
  const directory = new URL(
    "../play/assets/shenmue2-characters/",
    import.meta.url,
  );
  for (const filename of fs.readdirSync(directory).filter(
    (name) => name.endsWith(".CHRM"),
  )) {
    const selected = scheduledMt7HumanoidMotionNodes({
      _mt7Nodes: sourceEntries(path.join(directory.pathname, filename)),
    });
    const controlled = selected.filter(
      ({ motionNodeIndex }) => Number.isInteger(motionNodeIndex),
    );
    if (filename === "A06_E.CHRM") {
      assert.equal(selected.length, 17, filename);
      assert.equal(selected.shenmue2ReducedNativeHierarchy, true, filename);
    } else {
      assert.ok(selected.length >= 19, filename);
      assert.notEqual(selected.shenmue2ReducedNativeHierarchy, true, filename);
    }
    const byOffset = new Map(selected.map(({ sourceNode }) => [
      sourceNode.offset,
      sourceNode,
    ]));
    const sourceIds = new Set(selected.map(({ sourceNode }) => sourceNode.id));
    const expectedControllers = new Set([
      [0x0e, 0], [0x15, 3], [0x17, 4], [0x10, 6], [0x12, 7],
      [0x01, 8], [0xffbd, 11], [0x09, 14], [0x05, 15],
      [0x06, 16], [0x07, 17], [0x04, 18], [0x0a, 19],
      [0x0b, 20], [0x0c, 21],
    ].filter(([id]) => sourceIds.has(id)).map(([, index]) => index));
    // Some native story models omit renderer nodes that ordinary pedestrian
    // CHRM files expose. This gate requires every directly authored control
    // and does not invent a replacement binding before a native MDC7 capture
    // identifies the corresponding output matrix.
    const authoredRightTerminalAlias = selected.some(({ sourceNode }) => (
      sourceNode.id === 0xffff
      && byOffset.get(sourceNode.parentOffset)?.id === 0x0b
    ));
    if (authoredRightTerminalAlias) expectedControllers.add(21);
    const authoredStoryHeadAlias = selected.some(({ sourceNode }) => (
      sourceNode.id === 0x46
      && byOffset.get(sourceNode.parentOffset)?.id === 0x01
    ));
    if (!sourceIds.has(0xffbd) && authoredStoryHeadAlias) {
      expectedControllers.add(11);
    }
    assert.deepEqual(
      new Set(controlled.map(({ motionNodeIndex }) => motionNodeIndex)),
      expectedControllers,
      filename,
    );
    assert.ok(controlled.length >= 12, filename);
    for (const [upperId, targetId, targetController, terminalController] of [
      [0x15, 0x17, 3, 4],
      [0x10, 0x12, 6, 7],
    ]) {
      const upper = selected.find(({ sourceNode }) => (
        sourceNode.id === upperId
      ));
      const target = selected.find(({ sourceNode }) => (
        sourceNode.id === targetId
      ));
      const lower = byOffset.get(target?.sourceNode.parentOffset);
      assert.equal(upper?.motionNodeIndex, targetController, filename);
      assert.equal(target?.motionNodeIndex, terminalController, filename);
      assert.equal(lower?.parentOffset, upper?.sourceNode.offset, filename);
    }
    for (const [id, controller] of [[0x04, 18], [0x09, 14]]) {
      const authored = selected.find(({ sourceNode }) => sourceNode.id === id);
      if (authored) assert.equal(authored.motionNodeIndex, controller, filename);
    }
  }
});

test("bundled S2 characters retain authored cross-part GPU seams", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    for (const filename of ["JN5_L.CHRM", "SYE_M.CHRM", "CM5_L.CHRM"]) {
      const loader = new Mt7Loader(scene, {
        characterRigSeamMode: "weld",
      });
      const [renderRoot] = loader.load(fs.readFileSync(new URL(
        `../play/assets/shenmue2-characters/${filename}`,
        import.meta.url,
      )));
      const rig = renderRoot._mt7CharacterGpuRig;
      assert.ok(rig, filename);
      assert.ok(renderRoot._mt7CharacterRigSeamGroups.length > 0, filename);
      assert.ok(rig.skinnedMeshes.some(
        (mesh) => mesh.numBoneInfluencers > 1,
      ), filename);
      const meshCountBeforeMerge = renderRoot.getChildMeshes().length;
      const mergedMeshes = loader.mergeCharacterGpuRigMeshes(renderRoot);
      assert.ok(mergedMeshes.length < meshCountBeforeMerge / 2, filename);
      assert.equal(
        renderRoot.metadata.characterMeshCountBeforeMerge,
        meshCountBeforeMerge,
        filename,
      );
      assert.equal(
        renderRoot.metadata.characterMeshCountAfterMerge,
        mergedMeshes.length,
        filename,
      );
      const model = {
        loader,
        renderRoot,
        standingRenderPosition: renderRoot.position.clone(),
        mt7MotionNodes: scheduledMt7HumanoidMotionNodes(renderRoot),
      };
      assert.equal(configureShenmue2Mt7ControllerHierarchy(model), true);
      assert.equal(loader.updateCharacterGpuRig(renderRoot), true);
    }
  } finally {
    engine.dispose();
  }
});

test("A06_E materializes only its two proven non-rendered native arm roots", {
  skip: !fs.existsSync(nativeNpcMotionPath),
}, () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const [renderRoot] = new Mt7Loader(scene).load(fs.readFileSync(new URL(
      "../play/assets/shenmue2-characters/A06_E.CHRM",
      import.meta.url,
    )));
    const motionNodes = scheduledMt7HumanoidMotionNodes(renderRoot);
    assert.equal(motionNodes.length, 17);
    assert.equal(motionNodes.shenmue2ReducedNativeHierarchy, true);
    assert.ok(!motionNodes.some(({ sourceNode }) => (
      sourceNode.id === 0x04 || sourceNode.id === 0x09
    )));
    const model = {
      renderRoot,
      standingRenderPosition: renderRoot.position.clone(),
      mt7MotionNodes: motionNodes,
      motionTranslationScale: 1,
    };
    assert.equal(configureShenmue2Mt7ControllerHierarchy(model), true);
    assert.equal(model.shenmue2VirtualNativeArmRoots, true);
    assert.equal(motionNodes.length, 19);
    const byController = new Map(motionNodes
      .filter(({ motionNodeIndex }) => Number.isInteger(motionNodeIndex))
      .map((entry) => [entry.motionNodeIndex, entry]));
    const torso = byController.get(8).transform;
    for (const [rootController, upperController] of [[14, 15], [18, 19]]) {
      const root = byController.get(rootController);
      assert.equal(root.virtualNativeSolverNode, true);
      assert.equal(
        root.transform.metadata.shenmue2VirtualNativeSolverNode,
        true,
      );
      assert.equal(root.transform.parent, torso);
      assert.equal(
        byController.get(upperController).transform.parent,
        root.transform,
      );
    }
    const resolved = resolveShenmue2NativeMotionId(0x80eb);
    assert.equal(resolved.bank, "npc");
    const [sequence] = Shenmue2MotLoader.parse(
      fs.readFileSync(nativeNpcMotionPath),
      { sequenceIndices: [resolved.sequenceIndex] },
    ).sequences;
    assert.equal(applyShenmue2Mt7MotionPose(model, sequence, 121), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("RYO_M binds its native MDC7 0x46 head output to controller 11", {
  skip: !fs.existsSync(new URL(
    "../play/assets/shenmue2-characters/RYO_M.CHRM",
    import.meta.url,
  )),
}, () => {
  const path = new URL(
    "../play/assets/shenmue2-characters/RYO_M.CHRM",
    import.meta.url,
  );
  const selected = scheduledMt7HumanoidMotionNodes({
    _mt7Nodes: sourceEntries(path),
  });
  const byOffset = new Map(selected.map(({ sourceNode }) => [
    sourceNode.offset,
    sourceNode,
  ]));
  const head = selected.find(({ sourceNode }) => (
    sourceNode.id === 0x46
    && byOffset.get(sourceNode.parentOffset)?.id === 0x01
  ));
  assert.equal(head?.motionNodeIndex, 11);
  assert.equal(head?.motionSolverSlot, 2);
  assert.equal(head?.motionTerminal, false);
});

test("native 19-controller MT7 families remain animatable", {
  skip: !fs.existsSync(npcMotionPath),
}, () => {
  const path = new URL(
    "../play/assets/shenmue2-characters/BA7_L.CHRM",
    import.meta.url,
  );
  if (!fs.existsSync(path)) return;
  const model = {
    mt7MotionNodes: scheduledMt7HumanoidMotionNodes({
      _mt7Nodes: sourceEntries(path),
    }),
    renderRoot: { computeWorldMatrix() {} },
  };
  const [sequence] = Shenmue2MotLoader.parse(
    fs.readFileSync(npcMotionPath),
    { sequenceIndices: [0] },
  ).sequences;
  assert.equal(model.mt7MotionNodes.length, 19);
  assert.equal(applyShenmue2Mt7MotionPose(model, sequence, 0), true);
});

test("S2 controller hierarchy routes shoulders into their authored arms", () => {
  const ids = [0x01, 0x0e, 0x04, 0x0a, 0x09, 0x05, 0x0b, 0x06];
  const transforms = Object.fromEntries(ids.map((id) => [id, { parent: null }]));
  const bodyParent = {};
  transforms[0x01].parent = bodyParent;
  transforms[0x0e].parent = transforms[0x01];
  const model = {
    mt7MotionNodes: [
      ...ids.map((id) => ({
        sourceNode: { id },
        transform: transforms[id],
        motionNodeIndex: id === 0x0e ? 0 : id === 0x01 ? 8 : null,
      })),
      ...Array.from({ length: 12 }, (_, index) => ({
        sourceNode: { id: 0x100 + index },
        transform: { parent: null },
      })),
    ],
  };
  assert.equal(configureShenmue2Mt7ControllerHierarchy(model), true);
  assert.equal(transforms[0x0e].parent, bodyParent);
  assert.equal(transforms[0x01].parent, transforms[0x0e]);
  assert.equal(transforms[0x04].parent, transforms[0x01]);
  assert.equal(transforms[0x0a].parent, transforms[0x04]);
  assert.equal(transforms[0x09].parent, transforms[0x01]);
  assert.equal(transforms[0x05].parent, transforms[0x09]);
  assert.equal(transforms[0x0b].parent, null);
  assert.equal(transforms[0x06].parent, null);
});

test("S2 native rest profiles follow the authored MT7 family selector", {
  skip: !fs.existsSync(new URL(
    "../play/assets/shenmue2-characters/CM5_L.CHRM",
    import.meta.url,
  )),
}, () => {
  for (const [filename, expectedProfile, expectedRest] of [
    ["CM5_L.CHRM", "SEI", 0.102],
    ["OK3_L.CHRM", "SEI", 0.102],
    ["JN1_L.CHRM", "SAM", 0.170],
    ["ST4_L.CHRM", "SAM", 0.170],
    // JUK_L's limb dimensions are nearer the otherwise unused SYE record,
    // but root 0x7008 and the native controller's first word both select SAM.
    ["JUK_L.CHRM", "SAM", 0.170],
  ]) {
    const modelPath = new URL(
      `../play/assets/shenmue2-characters/${filename}`,
      import.meta.url,
    );
    const profile = shenmue2NativeRestProfileForNodes(
      sourceEntries(modelPath),
    );
    assert.equal(profile?.name, expectedProfile, filename);
    assert.equal(profile?.pelvisRest, expectedRest, filename);
    assert.equal(
      profile?.selectorSource,
      "MT7 root family -> SH-4 table 0x8c24f05c",
      filename,
    );
    if (expectedProfile === "SEI") {
      assert.equal(profile?.mirroredLegUpper, 0.22976, filename);
      assert.equal(profile?.mirroredLegLower, 0.24327, filename);
      assert.equal(profile?.armSolverUpper, 0.20225, filename);
      assert.equal(profile?.armSolverLower, 0.17711, filename);
      assert.equal(profile?.armRootX, 0.1131, filename);
      assert.equal(profile?.armRootZ, 0.022, filename);
      assert.equal(profile?.armShoulderZ, 0.103, filename);
    } else if (expectedProfile === "SAM") {
      assert.equal(profile?.mirroredLegUpper, 0.40565, filename);
      assert.equal(profile?.mirroredLegLower, 0.35694, filename);
      assert.equal(profile?.armSolverUpper, 0.27797, filename);
      assert.equal(profile?.armSolverLower, 0.22923, filename);
      assert.equal(profile?.armRootX, 0.18201, filename);
      assert.equal(profile?.armRootZ, 0.045, filename);
      assert.equal(profile?.armShoulderZ, 0.158, filename);
    }
  }
});

test("S2 native rest records replace incidental CHRM limb-vector offsets", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    for (const filename of ["PG3_L.CHRM", "GM1_L.CHRM", "KD2_L.CHRM"]) {
      const modelPath = new URL(
        `../play/assets/shenmue2-characters/${filename}`,
        import.meta.url,
      );
      const [renderRoot] = new Mt7Loader(scene).load(
        fs.readFileSync(modelPath),
      );
      const model = {
        renderRoot,
        mt7MotionNodes: scheduledMt7HumanoidMotionNodes(renderRoot),
      };
      assert.equal(configureShenmue2Mt7ControllerHierarchy(model), true);
      const byId = new Map(model.mt7MotionNodes.map((entry) => [
        entry.sourceNode.id & 0xffff,
        entry.transform,
      ]));
      const profile = model.shenmue2NativeRestProfile;
      for (const [id, expected] of [
        [0x11, profile.features[0]],
        [0x12, profile.features[1]],
        [0x16, profile.mirroredLegUpper],
        [0x17, profile.mirroredLegLower],
        [0x06, profile.features[2]],
        [0x07, profile.features[3]],
        [0x0b, profile.mirroredArmUpper],
        [0x0c, profile.mirroredArmLower],
      ]) {
        const position = byId.get(id).position;
        assert.ok(Math.abs(Math.abs(position.x) - expected) < 1e-9, filename);
        assert.equal(position.y, 0, filename);
        assert.equal(position.z, 0, filename);
      }
      renderRoot.dispose(false, true);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

for (const filename of ["OK1_L.CHRM", "OK6_L.CHRM"]) {
  const path = new URL(
    `../play/assets/shenmue2-characters/${filename}`,
    import.meta.url,
  );
  test(`MT7 ${filename} binds compact MOT by native solver anatomy`, {
    skip: !fs.existsSync(path),
  }, () => {
    const selected = scheduledMt7HumanoidMotionNodes({
      _mt7Nodes: sourceEntries(path),
    });
    const byId = new Map(selected.map((entry) => [entry.sourceNode.id, entry]));
    for (const [id, controller] of [
      [0x0e, 0], [0x15, 3], [0x17, 4], [0x10, 6], [0x12, 7],
      [0x01, 8], [0xffbd, 11],
      [0x09, 14], [0x05, 15], [0x06, 16], [0x07, 17],
      [0x04, 18], [0x0a, 19], [0x0b, 20], [0x0c, 21],
    ]) {
      assert.equal(
        byId.get(id)?.motionNodeIndex,
        controller,
        `${filename}: ${id.toString(16)}`,
      );
    }
    for (const id of [0xffbe, 0xffbf]) {
      assert.equal(byId.get(id)?.motionNodeIndex, null, filename);
      assert.equal(byId.get(id)?.motionTerminal, true, filename);
    }
  });
}

test("S2 walks retarget to each child model's reach and hip height", {
  skip: !fs.existsSync(globalMotionPath),
}, () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const ranges = new Map();
    for (const [filename, motionId] of [
      ["OK6_L.CHRM", 0xf0ff],
      ["CM3_L.CHRM", 0xf03e],
      ["CM5_L.CHRM", 0xf03e],
    ]) {
      const modelPath = new URL(
        `../play/assets/shenmue2-characters/${filename}`,
        import.meta.url,
      );
      if (!fs.existsSync(modelPath)) continue;
      const [renderRoot] = new Mt7Loader(scene).load(
        fs.readFileSync(modelPath),
      );
      const actorRoot = new BABYLON.TransformNode(
        `actor_${filename}`,
        scene,
      );
      const actorScale = 10;
      const groundOffset = scheduledActorGroundOffset(renderRoot, 0)
        * actorScale;
      renderRoot.parent = actorRoot;
      actorRoot.scaling.setAll(actorScale);
      actorRoot.position.y = groundOffset;
      actorRoot.metadata = { scheduledActorGroundOffset: groundOffset };
      const mt7MotionNodes = scheduledMt7HumanoidMotionNodes(renderRoot);
      const byController = new Map(mt7MotionNodes
        .filter(({ motionNodeIndex }) => Number.isInteger(motionNodeIndex))
        .map((entry) => [entry.motionNodeIndex, entry.transform]));
      const model = {
        renderRoot,
        standingRenderPosition: renderRoot.position.clone(),
        mt7MotionNodes,
        motionTranslationScale: 0.1,
      };
      const sequence = Shenmue2MotLoader.parse(
        fs.readFileSync(globalMotionPath),
        { sequenceIndices: [motionId - 0xf001] },
      ).sequences[0];
      const bends = [];
      for (let frame = 0; frame <= sequence.durationFrames; frame += 1) {
        applyShenmue2Mt7MotionPose(model, sequence, frame);
        for (const [hipController, footController] of [[3, 4], [6, 7]]) {
          const hip = byController.get(hipController);
          const foot = byController.get(footController);
          const knee = foot.parent;
          const upperDirection = knee.getAbsolutePosition()
            .subtract(hip.getAbsolutePosition()).normalize();
          const lowerDirection = foot.getAbsolutePosition()
            .subtract(knee.getAbsolutePosition()).normalize();
          bends.push(Math.acos(BABYLON.Scalar.Clamp(
            BABYLON.Vector3.Dot(upperDirection, lowerDirection),
            -1,
            1,
          )) * 180 / Math.PI);
        }
      }
      ranges.set(filename, [Math.min(...bends), Math.max(...bends)]);
      renderRoot.dispose(false, true);
    }
    // CM5's hip is authored substantially lower than CM3's. Omitting the
    // model-specific vertical anchor left it permanently bent 94–118 degrees.
    assert.ok(Math.abs(
      ranges.get("CM5_L.CHRM")[0] - ranges.get("CM3_L.CHRM")[0]
    ) < 0.01);
    assert.ok(Math.abs(
      ranges.get("CM5_L.CHRM")[1] - ranges.get("CM3_L.CHRM")[1]
    ) < 0.01);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("S2 walk arm solves preserve both authored two-bone chains", {
  skip: !fs.existsSync(globalMotionPath),
}, () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    for (const [filename, motionId] of [
      ["CF3_L.CHRM", 0xf0ff],
      ["JN2_L.CHRM", 0xf07e],
      ["ST4_L.CHRM", 0xf09e],
    ]) {
      const modelPath = new URL(
        `../play/assets/shenmue2-characters/${filename}`,
        import.meta.url,
      );
      if (!fs.existsSync(modelPath)) continue;
      const [renderRoot] = new Mt7Loader(scene).load(
        fs.readFileSync(modelPath),
      );
      const mt7MotionNodes = scheduledMt7HumanoidMotionNodes(renderRoot);
      const byController = new Map(mt7MotionNodes
        .filter(({ motionNodeIndex }) => Number.isInteger(motionNodeIndex))
        .map((entry) => [entry.motionNodeIndex, entry.transform]));
      const model = {
        renderRoot,
        standingRenderPosition: renderRoot.position.clone(),
        mt7MotionNodes,
        motionTranslationScale: 1,
      };
      const sequence = Shenmue2MotLoader.parse(
        fs.readFileSync(globalMotionPath),
        { sequenceIndices: [motionId - 0xf001] },
      ).sequences[0];
      const segmentLengths = [null, null];
      for (let frame = 0; frame <= sequence.durationFrames; frame += 1) {
        applyShenmue2Mt7MotionPose(model, sequence, frame);
        [[15, 16, 17], [19, 20, 21]].forEach(
          ([shoulderController, elbowController, handController], index) => {
            const shoulder = byController.get(shoulderController)
              .getAbsolutePosition();
            const elbow = byController.get(elbowController)
              .getAbsolutePosition();
            const hand = byController.get(handController)
              .getAbsolutePosition();
            const lengths = [
              BABYLON.Vector3.Distance(shoulder, elbow),
              BABYLON.Vector3.Distance(elbow, hand),
            ];
            segmentLengths[index] ??= lengths;
            assert.ok(Math.abs(
              lengths[0] - segmentLengths[index][0]
            ) < 1e-5, filename);
            assert.ok(Math.abs(
              lengths[1] - segmentLengths[index][1]
            ) < 1e-5, filename);
            assert.ok(hand.y < shoulder.y, filename);
          },
        );
      }
      renderRoot.dispose(false, true);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("native character-table curves animate preserved MT7 transforms", {
  skip: !fs.existsSync(npcMotionPath) || !fs.existsSync(ok1Path),
}, () => {
  const root = { _mt7Nodes: sourceEntries(ok1Path) };
  const renderPosition = {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
    clone() {
      return { x: this.x, y: this.y, z: this.z };
    },
  };
  const model = {
    mt7MotionNodes: scheduledMt7HumanoidMotionNodes(root),
    renderRoot: { position: renderPosition, computeWorldMatrix() {} },
    standingRenderPosition: { x: 0, y: 0, z: 0 },
  };
  const [sequence] = Shenmue2MotLoader.parse(
    fs.readFileSync(npcMotionPath),
    { sequenceIndices: [0] },
  ).sequences;
  assert.equal(applyShenmue2Mt7MotionPose(model, sequence, 0), true);
  const directlyRotated = model.mt7MotionNodes.filter(
    ({ motionNodeIndex, motionControllerKind, transform }) => (
      Number.isInteger(motionNodeIndex)
      && motionControllerKind === "rotation"
      && transform.rotationQuaternion
    ),
  );
  const starts = directlyRotated.map(
    ({ transform }) => transform.rotationQuaternion.clone(),
  );
  const rootStart = { ...model.renderRoot.position };
  assert.equal(applyShenmue2Mt7MotionPose(model, sequence, 15), true);
  assert.ok(directlyRotated.some(({ transform }, index) => (
    1 - Math.abs(BABYLON.Quaternion.Dot(
      starts[index],
      transform.rotationQuaternion,
    )) > 1e-5
  )));
  assert.notDeepEqual(
    { ...model.renderRoot.position },
    rootStart,
  );
  for (const [kind, count] of [
    ["solverRotation", 1],
    ["solverBasis", 2],
    ["solverTarget", 4],
    ["solverTerminal", 2],
  ]) {
    const retained = model.mt7MotionNodes.filter(
      ({ motionControllerKind }) => motionControllerKind === kind,
    );
    assert.equal(retained.length, count);
    assert.ok(retained.every(({ transform }) => (
      transform.rotationQuaternion === null
    )));
  }
});

test("S2 arm targets drive JN1_L through a length-preserving two-bone solve", {
  skip: !fs.existsSync(globalMotionPath),
}, () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const actorRoot = new BABYLON.TransformNode("actor", scene);
    actorRoot.scaling.setAll(10);
    const renderRoot = new BABYLON.Mesh("render", scene);
    renderRoot.parent = actorRoot;
    const parsedModel = parseMt7(fs.readFileSync(new URL(
      "../play/assets/shenmue2-characters/JN1_L.CHRM",
      import.meta.url,
    )));
    const transforms = new Map();
    for (const sourceNode of parsedModel.nodes) {
      const transform = new BABYLON.TransformNode(
        `node_${sourceNode.offset.toString(16)}`,
        scene,
      );
      transform.position.set(...mt7BrowserVector(sourceNode.position));
      transform.rotationQuaternion = mt7RotationQuaternion(
        sourceNode.rotationRaw,
      );
      transform.scaling.set(...sourceNode.scale);
      transforms.set(sourceNode.offset, transform);
    }
    for (const sourceNode of parsedModel.nodes) {
      transforms.get(sourceNode.offset).parent = (
        transforms.get(sourceNode.parentOffset) || renderRoot
      );
    }
    renderRoot._mt7Nodes = parsedModel.nodes.map((sourceNode) => ({
      sourceNode,
      transform: transforms.get(sourceNode.offset),
    }));
    const motionNodes = scheduledMt7HumanoidMotionNodes(renderRoot);
    const byController = new Map(motionNodes
      .filter(({ motionNodeIndex }) => Number.isInteger(motionNodeIndex))
      .map((entry) => [entry.motionNodeIndex, entry.transform]));
    const byId = new Map(motionNodes.map((entry) => [
      entry.sourceNode.id,
      entry.transform,
    ]));
    const model = {
      renderRoot,
      standingRenderPosition: renderRoot.position.clone(),
      mt7MotionNodes: motionNodes,
      motionTranslationScale: 0.1,
    };
    const sequence = Shenmue2MotLoader.parse(
      fs.readFileSync(globalMotionPath),
      { sequenceIndices: [0xf086 - 0xf001] },
    ).sequences[0];
    renderRoot.computeWorldMatrix(true);
    const pelvis = byId.get(0x0e);
    const torso = byId.get(0x01);
    const bindPositions = new Map(
      [
        pelvis, torso,
        byId.get(0x12),
      ].map((transform) => [
        transform,
        transform.getAbsolutePosition().clone(),
      ]),
    );
    assert.equal(configureShenmue2Mt7ControllerHierarchy(model), true);
    renderRoot.computeWorldMatrix(true);
    assert.equal(torso.parent, pelvis);
    for (const [controller, upperController, rootZ, shoulderZ] of [
      [14, 15, 0.045, 0.158],
      [18, 19, -0.045, -0.158],
    ]) {
      const shoulderRoot = byController.get(controller);
      assert.equal(shoulderRoot.parent, torso);
      assert.deepEqual(
        shoulderRoot.position.asArray(),
        [-0.18201, 0, rootZ],
      );
      assert.deepEqual(
        byController.get(upperController).position.asArray(),
        [0, 0, shoulderZ],
      );
      assert.ok(Math.abs(shoulderRoot.rotationQuaternion.w - 1) < 1e-12);
      assert.ok(Math.abs(shoulderRoot.rotationQuaternion.x) < 1e-12);
      assert.ok(Math.abs(shoulderRoot.rotationQuaternion.y) < 1e-12);
      assert.ok(Math.abs(shoulderRoot.rotationQuaternion.z) < 1e-12);
    }
    for (const [transform, bindPosition] of bindPositions) {
      assert.ok(BABYLON.Vector3.Distance(
        transform.getAbsolutePosition(),
        bindPosition,
      ) < 1e-6);
    }
    const leftHip = byId.get(0x15);
    const leftKnee = byId.get(0x16);
    const leftFoot = byId.get(0x17);
    const bindThighLength = BABYLON.Vector3.Distance(
      leftHip.getAbsolutePosition(),
      leftKnee.getAbsolutePosition(),
    );
    const bindShinLength = BABYLON.Vector3.Distance(
      leftKnee.getAbsolutePosition(),
      leftFoot.getAbsolutePosition(),
    );
    const capturedFrames = [8, 23, 5, 20, 1, 16, 31, 13, 28, 9];
    const browserFirstArmBends = [];
    for (const capturedFrame of capturedFrames) {
      applyShenmue2Mt7MotionPose(model, sequence, capturedFrame);
      const shoulder = byController.get(15).getAbsolutePosition();
      const elbow = byController.get(16).getAbsolutePosition();
      const hand = byController.get(17).getAbsolutePosition();
      browserFirstArmBends.push(Math.acos(BABYLON.Scalar.Clamp(
        BABYLON.Vector3.Dot(
          elbow.subtract(shoulder).normalize(),
          hand.subtract(elbow).normalize(),
        ),
        -1,
        1,
      )) * 180 / Math.PI);
    }
    // The retained native slot-3 matrices span about 11–49 degrees at these
    // synchronized frames. Absolute targets, native limb scaling, and the
    // delta*bind basis composition keep the browser in that same envelope.
    assert.ok(Math.min(...browserFirstArmBends) > 5);
    assert.ok(Math.min(...browserFirstArmBends) < 15);
    assert.ok(Math.max(...browserFirstArmBends) > 45);
    assert.ok(Math.max(...browserFirstArmBends) < 52);
    const shortRigWalk = Shenmue2MotLoader.parse(
      fs.readFileSync(globalMotionPath),
      { sequenceIndices: [0xf09e - 0xf001] },
    ).sequences[0];
    assert.ok(Math.abs(
      shenmue2NativeLegReach(shortRigWalk, {
        features: [0.22975, 0.24326],
      }) - 0.47301
    ) < 1e-6);
    applyShenmue2Mt7MotionPose(model, sequence, 0);
    const firstHand = byController.get(17).getAbsolutePosition().clone();
    const firstFoot = leftFoot.getAbsolutePosition().clone();
    applyShenmue2Mt7MotionPose(model, sequence, 8);
    // The synchronized f086 frame-9758 native matrices place both shoulder
    // controls nearly identity-relative-to-torso. This catches the accidental
    // inverse-torso bind that previously twisted every shoulder about 90°.
    for (const controller of [14, 18]) {
      assert.ok(
        byController.get(controller).rotationQuaternion
          .toEulerAngles().length() < 0.05,
      );
    }
    const upper = byController.get(15).getAbsolutePosition();
    const elbow = byController.get(16).getAbsolutePosition();
    const hand = byController.get(17).getAbsolutePosition();
    assert.ok(BABYLON.Vector3.Distance(firstHand, hand) > 0.05);
    assert.ok(Math.abs(
      BABYLON.Vector3.Distance(upper, elbow) - 0.277974,
    ) < 1e-5);
    assert.ok(Math.abs(
      BABYLON.Vector3.Distance(elbow, hand) - 0.229545,
    ) < 1e-5);
    assert.ok(BABYLON.Vector3.Distance(
      firstFoot,
      leftFoot.getAbsolutePosition(),
    ) > 0.05);
    assert.ok(Math.abs(
      BABYLON.Vector3.Distance(
        leftHip.getAbsolutePosition(),
        leftKnee.getAbsolutePosition(),
      ) - bindThighLength,
    ) < 1e-5);
    assert.ok(Math.abs(
      BABYLON.Vector3.Distance(
        leftKnee.getAbsolutePosition(),
        leftFoot.getAbsolutePosition(),
      ) - bindShinLength,
    ) < 1e-5);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("KP5 0x8036 alternates its native arm-solver gesture slots", () => {
  const modelPath = new URL(
    "../play/assets/shenmue2-characters/KP5_L.CHRM",
    import.meta.url,
  );
  const motionPath = new URL(
    "../play/assets/shenmue2-motion/NPC.MOT",
    import.meta.url,
  );
  if (!fs.existsSync(modelPath) || !fs.existsSync(motionPath)) return;
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const actorRoot = new BABYLON.TransformNode("actor", scene);
    actorRoot.scaling.setAll(10);
    const renderRoot = new BABYLON.Mesh("render", scene);
    renderRoot.parent = actorRoot;
    const parsedModel = parseMt7(fs.readFileSync(modelPath));
    const transforms = new Map();
    for (const sourceNode of parsedModel.nodes) {
      const transform = new BABYLON.TransformNode(
        `node_${sourceNode.offset.toString(16)}`,
        scene,
      );
      transform.position.set(...mt7BrowserVector(sourceNode.position));
      transform.rotationQuaternion = mt7RotationQuaternion(
        sourceNode.rotationRaw,
      );
      transform.scaling.set(...sourceNode.scale);
      transforms.set(sourceNode.offset, transform);
    }
    for (const sourceNode of parsedModel.nodes) {
      transforms.get(sourceNode.offset).parent = (
        transforms.get(sourceNode.parentOffset) || renderRoot
      );
    }
    renderRoot._mt7Nodes = parsedModel.nodes.map((sourceNode) => ({
      sourceNode,
      transform: transforms.get(sourceNode.offset),
    }));
    const motionNodes = scheduledMt7HumanoidMotionNodes(renderRoot);
    const byController = new Map(motionNodes
      .filter(({ motionNodeIndex }) => Number.isInteger(motionNodeIndex))
      .map((entry) => [entry.motionNodeIndex, entry.transform]));
    const model = {
      renderRoot,
      standingRenderPosition: renderRoot.position.clone(),
      mt7MotionNodes: motionNodes,
      motionTranslationScale: 0.1,
    };
    const resolved = resolveShenmue2NativeMotionId(0x8036);
    const sequence = Shenmue2MotLoader.parse(fs.readFileSync(motionPath), {
      sequenceIndices: [resolved.sequenceIndex],
    }).sequences[0];
    applyShenmue2Mt7MotionPose(model, sequence, 100);
    const torsoAtFirstGesture = byController.get(8).getAbsolutePosition();
    assert.ok(
      byController.get(17).getAbsolutePosition().y
      > torsoAtFirstGesture.y,
    );
    assert.ok(
      byController.get(21).getAbsolutePosition().y
      < torsoAtFirstGesture.y,
    );
    applyShenmue2Mt7MotionPose(model, sequence, 510);
    const torsoAtSecondGesture = byController.get(8).getAbsolutePosition();
    assert.ok(
      byController.get(17).getAbsolutePosition().y
      < torsoAtSecondGesture.y,
    );
    assert.ok(
      byController.get(21).getAbsolutePosition().y
      > torsoAtSecondGesture.y,
    );
    assert.ok(Math.abs(
      BABYLON.Vector3.Distance(
        byController.get(19).getAbsolutePosition(),
        byController.get(20).getAbsolutePosition(),
      ) - 0.278035,
    ) < 1e-5);
    assert.ok(Math.abs(
      BABYLON.Vector3.Distance(
        byController.get(20).getAbsolutePosition(),
        byController.get(21).getAbsolutePosition(),
      ) - 0.22943,
    ) < 1e-5);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("S2 MT7 motion poses interpolate from the retained native pose", {
  skip: !fs.existsSync(npcMotionPath) || !fs.existsSync(ok1Path),
}, () => {
  const root = { _mt7Nodes: sourceEntries(ok1Path) };
  const model = {
    mt7MotionNodes: scheduledMt7HumanoidMotionNodes(root),
    renderRoot: { computeWorldMatrix() {} },
  };
  const parsed = Shenmue2MotLoader.parse(fs.readFileSync(npcMotionPath));
  const previous = parsed.sequences[0];
  const target = parsed.sequences[1];
  applyShenmue2Mt7MotionPose(model, previous, 0);
  const controlled = model.mt7MotionNodes.filter(
    ({ motionNodeIndex, motionControllerKind }) => (
      Number.isInteger(motionNodeIndex)
      && ![
        "solverRotation",
        "solverBasis",
        "solverTarget",
        "solverTerminal",
      ].includes(
        motionControllerKind,
      )
    ),
  );
  const previousRotations = controlled.map(
    ({ transform }) => transform.rotationQuaternion.clone(),
  );
  applyShenmue2Mt7MotionPose(model, target, 0, {
    blendFromPose: evaluateShenmue2Mt7ControllerPose(previous, 0),
    blendAmount: 0,
  });
  for (let index = 0; index < controlled.length; index += 1) {
    assert.ok(
      1 - Math.abs(BABYLON.Quaternion.Dot(
        previousRotations[index],
        controlled[index].transform.rotationQuaternion,
      )) < 1e-6,
    );
  }
});

test("native slot-4 poses replace only compact controllers 18 through 21", {
  skip: !fs.existsSync(npcMotionPath) || !fs.existsSync(ok1Path),
}, () => {
  const root = { _mt7Nodes: sourceEntries(ok1Path) };
  const model = {
    mt7MotionNodes: scheduledMt7HumanoidMotionNodes(root),
    renderRoot: { computeWorldMatrix() {} },
  };
  const parsed = Shenmue2MotLoader.parse(fs.readFileSync(npcMotionPath));
  applyShenmue2Mt7MotionPose(model, parsed.sequences[0], 0);
  const controlled = model.mt7MotionNodes.filter(
    ({ motionNodeIndex, motionControllerKind }) => (
      Number.isInteger(motionNodeIndex)
      && ![
        "solverRotation",
        "solverBasis",
        "solverTarget",
        "solverTerminal",
      ].includes(
        motionControllerKind,
      )
    ),
  );
  const baseRotations = controlled.map(
    ({ transform }) => transform.rotationQuaternion.clone(),
  );
  const slot4Controllers = shenmue2MotionControllerIndicesForSlot(4);
  applyShenmue2Mt7MotionPose(model, parsed.sequences[194], 15, {
    controllerIndices: slot4Controllers,
    preserveHorizontalRoot: false,
  });
  let selectedChangeCount = 0;
  for (let index = 0; index < controlled.length; index += 1) {
    const changed = 1 - Math.abs(BABYLON.Quaternion.Dot(
      baseRotations[index],
      controlled[index].transform.rotationQuaternion,
    ));
    if (slot4Controllers.includes(
      controlled[index].motionNodeIndex,
    )) {
      if (changed > 1e-6) selectedChangeCount += 1;
    } else {
      assert.ok(changed < 1e-6, `motion node ${index}`);
    }
  }
  assert.ok(selectedChangeCount > 0);
});
