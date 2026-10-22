import assert from "node:assert/strict";
import test from "node:test";
import * as B from "@babylonjs/core";
import { ThirdPersonController } from "../src/ThirdPersonController.js";
import { WorldRaycastIndex } from "../src/rendering/SceneSpatialIndex.js";
import { recoveryVolumeClear } from "../src/PlayerRecoveryCollision.js";

// Real terrain, mesh geometry and controller recovery; only DOM input/camera
// presentation is disabled. These are collision integration tests, not visuals.
class RecoveryController extends ThirdPersonController {
    bindInputs() {}
    updateCamera() {}
}

function fixture(t, configure = () => {}, { floorWidth = 40 } = {}) {
    const engine = new B.NullEngine();
    const scene = new B.Scene(engine);
    const floor = B.MeshBuilder.CreateGround("floor", { width: floorWidth, height: 40 }, scene);
    floor.metadata = { terrain: true, cameraBlocker: true };
    floor.freezeWorldMatrix();
    const box = (name, position, size, metadata = { cameraBlocker: true }) => {
        const mesh = B.MeshBuilder.CreateBox(name, {
            width: size[0], height: size[1], depth: size[2],
        }, scene);
        mesh.position.set(...position);
        mesh.metadata = metadata;
        mesh.computeWorldMatrix(true);
        return mesh;
    };
    const objects = configure({ scene, box, floor }) || {};
    const actor = new B.TransformNode("player", scene);
    const camera = new B.FreeCamera("camera", B.Vector3.Zero(), scene);
    const controller = new RecoveryController(scene, camera, actor);
    const index = new WorldRaycastIndex(scene, [floor]);
    controller.setRaycastIndex(index);
    t.after(() => { index.dispose(); scene.dispose(); engine.dispose(); });
    return { controller, scene, floor, index, ...objects };
}

test("stuck returns to a previous distant walking position, then to the entrance on repeat", t => {
    const { controller: c } = fixture(t);
    // Record real supported positions, retaining the existing 16-sample policy.
    for (const x of [-6, -4, -0.5, 0]) {
        c.collider.position.x = x;
        c.recordSafePosition(0.5);
    }
    c.keys.add("KeyW");
    c.autoRun = true;
    c.touchInput = { x: 1, y: 1, magnitude: 1 };
    const fallbackPosition = new B.Vector3(10, 0, 0);
    assert.deepEqual(c.recoverFromCollision({ fallbackPosition, now: 0 }), {
        recovered: true, source: "recent-safe",
    });
    assert.deepEqual(c.actorRoot.position.asArray(), [-4, 0, 0]);
    assert.equal(c.keys.size, 0);
    assert.equal(c.autoRun, false);
    assert.equal(c.touchInput.magnitude, 0);
    assert.deepEqual(c.recoverFromCollision({ fallbackPosition, now: 1000 }), {
        recovered: true, source: "world-spawn",
    });
    assert.deepEqual(c.actorRoot.position.asArray(), [10, 0, 0]);
    // Additional retries stay at the entrance, not another saved trap.
    assert.equal(c.recoverFromCollision({ fallbackPosition, now: 2000 }).source, "world-spawn");
    assert.equal(c.recoverFromCollision({ fallbackPosition, now: 32_000 }).source, "recent-safe");
});

test("recovery rejects car geometry even when its native collision edges and center ray are clear", t => {
    const { controller: c } = fixture(t, ({ box }) => ({
        car: box("car-roof", [-4, 1.1, 0], [2, 0.1, 4]),
        side: box("shoulder-obstruction", [-7.75, 1.3, 0], [0.06, 0.2, 0.12]),
    }));
    // Both are visual props with checkCollisions=false, as when COLI owns walking.
    assert.equal(c.nativeCollisionPositionClear(new B.Vector3(-4, 0, 0)), true);
    assert.equal(c.recoveryCandidateAt(-4, 0, 0), null);
    assert.equal(c.recoveryHeadroomClear(new B.Vector3(-8, 0, 0)), true);
    assert.equal(c.recoveryCandidateAt(-8, 0, 0), null);
    c.safePositionHistory = [new B.Vector3(-12, 0, 0), new B.Vector3(-8, 0, 0), new B.Vector3(-4, 0, 0)];
    assert.equal(c.recoverFromCollision({ now: 0 }).source, "recent-safe");
    assert.equal(c.actorRoot.position.x, -12);
});

test("recovery detects containment inside a closed prop without rejecting room interiors", t => {
    const { controller: c } = fixture(t, ({ box }) => {
        box("solid-prop", [-5, 1.5, 0], [4, 5, 4]);
        box("room-shell", [5, 1.5, 0], [4, 5, 4], { terrain: true });
    });
    assert.equal(c.recoveryCandidateAt(-5, 0, 0), null);
    assert.ok(c.recoveryCandidateAt(5, 0, 0));
});

test("full-body clearance accepts walkable slopes and rejects transformed or batched side obstructions", t => {
    const { controller: c, scene } = fixture(t);
    const slope = B.MeshBuilder.CreateGround("slope", { width: 8, height: 8 }, scene);
    slope.rotation.z = Math.PI / 6;
    slope.metadata = { terrain: true };
    assert.equal(recoveryVolumeClear([slope], B.Vector3.Zero(), c.options, c.collider), true);

    const side = B.MeshBuilder.CreateBox("side", { width: 0.06, height: 0.2, depth: 0.1 }, scene);
    side.position.set(0.25, 1.3, 0);
    const distant = B.MeshBuilder.CreateBox("distant", { size: 0.1 }, scene);
    distant.position.x = 10;
    const merged = B.Mesh.MergeMeshes([side, distant], true);
    merged.metadata = { cameraBlocker: true };
    const root = new B.TransformNode("transformed-prop", scene);
    root.rotation.y = Math.PI / 4;
    merged.parent = root;
    assert.equal(recoveryVolumeClear([merged], B.Vector3.Zero(), c.options, c.collider), false);
});

test("a closed prop test does not treat an open enclosure as filled solid space", t => {
    const { controller: c, scene } = fixture(t);
    const shell = B.MeshBuilder.CreateBox("open-shell", { size: 8 }, scene);
    // Remove the top and bottom: this is a wall enclosure, not a solid object.
    const indices = shell.getIndices();
    const vertices = shell.getVerticesData(B.VertexBuffer.PositionKind);
    shell.setIndices(indices.filter((_, index) => {
        const triangle = Math.floor(index / 3) * 3;
        const ys = [0, 1, 2].map(offset => vertices[indices[triangle + offset] * 3 + 1]);
        return !(ys[0] === ys[1] && ys[1] === ys[2]);
    }));
    shell.metadata = { cameraBlocker: true };
    assert.equal(recoveryVolumeClear([shell], B.Vector3.Zero(), c.options, c.collider), true);
});

test("recovery observes moved, disabled, and disposed props immediately through the spatial index", t => {
    const { controller: c, obstacle } = fixture(t, ({ box }) => ({
        obstacle: box("moving-obstacle", [7, 1, 0], [1, 2, 1]),
    }));
    assert.ok(c.recoveryCandidateAt(4, 0, 0));
    obstacle.position.x = 4;
    assert.equal(c.recoveryCandidateAt(4, 0, 0), null);
    obstacle.setEnabled(false);
    assert.ok(c.recoveryCandidateAt(4, 0, 0));
    obstacle.setEnabled(true);
    assert.equal(c.recoveryCandidateAt(4, 0, 0), null);
    obstacle.dispose();
    assert.ok(c.recoveryCandidateAt(4, 0, 0));
});

test("recovery checks native walls at the final floor height and preserves door state", t => {
    const { controller: c, door } = fixture(t, ({ box }) => {
        const door = box("native-door", [4.1, 1, 0], [0.01, 2, 2], {
            nativeCollision: true,
            nativeCollisionSegments: [[[0, -1], [0, 1]]],
            nativeCollisionSegmentYRanges: [[-1, 1]],
        });
        door.checkCollisions = true;
        door.isPickable = false;
        return { door };
    });
    // Saved height is above the native wall; actual terrain resolves to y=0.
    assert.equal(c.recoveryCandidateAt(4, 0, 4, { constrainHeight: false }), null);
    door.checkCollisions = false;
    assert.ok(c.recoveryCandidateAt(4, 0, 4, { constrainHeight: false }));
});

test("missing ground, unsupported footprint, low ceilings and invalid coordinates fail safely", t => {
    const { controller: c } = fixture(t, ({ box }) => {
        box("low-ceiling", [0, 1.6, 4], [1, 0.1, 1], { terrain: true });
    }, { floorWidth: 2 });
    assert.equal(c.recoveryCandidateAt(0.9, 0, 0), null);
    assert.equal(c.recoveryCandidateAt(0, 4, 0), null);
    assert.equal(c.recoveryCandidateAt(NaN, 0, 0), null);
    c.safePositionHistory = [];
    const before = c.actorRoot.position.clone();
    assert.deepEqual(c.recoverFromCollision({ fallbackPosition: new B.Vector3(5, 0, 0), now: 0 }), {
        recovered: false, source: "blocked-spawn",
    });
    assert.ok(c.actorRoot.position.equals(before));
    assert.deepEqual(c.recoverFromCollision({ now: 1000 }), { recovered: false, source: "none" });
});

test("the entrance is used when history is only centimetres away, and reset clears repeat state", t => {
    const { controller: c } = fixture(t);
    c.safePositionHistory = [new B.Vector3(0.4, 0, 0)];
    assert.equal(c.recoverFromCollision({ fallbackPosition: new B.Vector3(8, 0, 0), now: 0 }).source, "world-spawn");
    c.reset(B.Vector3.Zero());
    assert.equal(c.lastRecoveryRequestAt, null);
    assert.equal(c.safePositionHistory.length, 1);
    c.safePositionHistory.push(new B.Vector3(4, 0, 0));
    assert.equal(c.recoverFromCollision({ fallbackPosition: new B.Vector3(8, 0, 0), now: 1000 }).source, "recent-safe");
});

test("recovery cancels an active approach instead of walking back into the obstacle", async t => {
    const { controller: c } = fixture(t);
    const rejected = assert.rejects(c.approachTo(new B.Vector3(1, 0, 0), 0), { name: "AbortError" });
    c.recoverFromCollision({ fallbackPosition: new B.Vector3(8, 0, 0), now: 0 });
    await rejected;
    assert.equal(c.approach, null);
});
