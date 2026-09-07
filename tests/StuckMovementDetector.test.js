import assert from "node:assert/strict";
import test from "node:test";

import { StuckMovementDetector } from "../src/StuckMovementDetector.js";

test("detects sustained input without enough horizontal progress", () => {
    const detector = new StuckMovementDetector({
        durationSeconds: 1,
        minimumDistance: 0.5,
    });

    assert.equal(detector.update({
        moving: true,
        noClip: false,
        position: { x: 0, z: 0 },
        deltaSeconds: 0,
    }), false);
    assert.equal(detector.update({
        moving: true,
        noClip: false,
        position: { x: 0.2, z: 0 },
        deltaSeconds: 0.5,
    }), false);
    assert.equal(detector.update({
        moving: true,
        noClip: false,
        position: { x: 0.2, z: 0 },
        deltaSeconds: 0.5,
    }), true);
});

test("resets after sufficient progress, released input, or no-clip", () => {
    const detector = new StuckMovementDetector();
    const update = (overrides = {}) => detector.update({
        moving: true,
        noClip: false,
        position: { x: 0, z: 0 },
        deltaSeconds: 0.6,
        ...overrides,
    });

    assert.equal(update(), false);
    assert.equal(update({ position: { x: 0.5, z: 0 } }), false);
    assert.equal(update({ moving: false }), false);
    assert.equal(update(), false);
    assert.equal(update({ noClip: true }), false);
});

test("keeps a newly shown warning visible for at least half a second", () => {
    const detector = new StuckMovementDetector({
        durationSeconds: 1,
        minimumDistance: 0.5,
        minimumVisibleSeconds: 0.5,
    });
    const update = (overrides = {}) => detector.update({
        moving: true,
        noClip: false,
        position: { x: 0, z: 0 },
        deltaSeconds: 0,
        ...overrides,
    });

    assert.equal(update(), false);
    assert.equal(update({ deltaSeconds: 1 }), true);
    assert.equal(update({ moving: false, deltaSeconds: 0.25 }), true);
    assert.equal(update({ moving: false, deltaSeconds: 0.24 }), true);
    assert.equal(update({ moving: false, deltaSeconds: 0.02 }), false);
});
