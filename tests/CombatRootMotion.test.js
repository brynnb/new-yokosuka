import assert from "node:assert/strict";
import test from "node:test";
import {
  createCombatRootMotionApplier,
} from "../play/combat/CombatRootMotion.js";

test("combat root motion maps authored -Z travel into actor forward", () => {
  const root = {
    position: { x: 3, z: 5 },
    rotation: { y: Math.PI / 2 },
  };
  const moved = [];
  const apply = createCombatRootMotionApplier(
    root,
    (position) => moved.push({ ...position }),
  );
  apply({
    playbackRevision: 1,
    generation: 0,
    translation: [0.25, 0, -0.5],
  });
  apply({
    playbackRevision: 1,
    generation: 0,
    translation: [0.75, 0, -2.5],
  });
  assert.ok(Math.abs(root.position.x - 5) < 1e-10);
  assert.ok(Math.abs(root.position.z - 4.5) < 1e-10);
  assert.equal(moved.length, 2);
});

test("a new playback or rebase starts root motion at the current position", () => {
  const root = {
    position: { x: 0, z: 0 },
    rotation: { y: 0 },
  };
  const apply = createCombatRootMotionApplier(root);
  apply({
    playbackRevision: 1,
    generation: 0,
    translation: [0, 0, 0],
  });
  apply({
    playbackRevision: 1,
    generation: 0,
    translation: [0, 0, -1],
  });
  assert.deepEqual(root.position, { x: 0, z: 1 });

  root.position.x = 4;
  root.position.z = 7;
  apply({
    playbackRevision: 1,
    generation: 1,
    translation: [0, 0, -1],
  });
  assert.deepEqual(root.position, { x: 4, z: 7 });
  apply({
    playbackRevision: 1,
    generation: 1,
    translation: [0, 0, -1.5],
  });
  assert.deepEqual(root.position, { x: 4, z: 7.5 });

  apply({
    playbackRevision: 2,
    generation: 0,
    translation: [0.2, 0, -0.2],
  });
  assert.deepEqual(root.position, { x: 4, z: 7.5 });
});

test("a paired victim using attacker yaw crosses over the thrower's shoulder", () => {
  const root = {
    // Victim begins to the right of a thrower at x=0.
    position: { x: 1, z: 0 },
    // Both paired clips use the thrower's right-facing authored orientation.
    rotation: { y: Math.PI / 2 },
  };
  const apply = createCombatRootMotionApplier(root);
  apply({
    playbackRevision: 1,
    generation: 0,
    translation: [-0.006191253662109375, 0, -0.92236328125],
  });
  apply({
    playbackRevision: 1,
    generation: 0,
    translation: [-0.06591796875, 0, 1.5078125],
  });

  assert.ok(root.position.x < 0, "victim finishes left of the thrower");
  assert.ok(
    Math.abs(root.position.x - -1.43017578125) < 1e-10,
    "victim preserves Overthrow's extracted 2.43-unit trajectory",
  );
});
