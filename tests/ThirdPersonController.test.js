import assert from "node:assert/strict";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";
import { InputActionSystem } from "../play/input/InputActions.js";

import {
    DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS,
    ThirdPersonController,
    actorTurningSince,
    actorYawForMovement,
    boundedTerrainRayOrigin,
    cameraRelativeMovement,
    cameraZoomState,
    constrainCollisionDisplacement,
    controllerMovementSpeed,
    defaultCameraBlockerPredicate,
    firstPersonMovement,
    firstPersonTurnInput,
    hasCommandModifier,
    keyboardBackwardActive,
    keyboardForwardActive,
    keyboardMovementSpeedMultiplier,
    movementKeysForController,
    movementKeysWithAutoRun,
    nativeCollisionDisplacementAllowed,
    nativeCollisionEscapeAllowed,
    nativeCollisionPositionClear,
    nativeCollisionRecoveryPathClear,
    nearestWalkableRaySurface,
    normalizedTouchInput,
    orbitPitch,
    orbitYaw,
    shortestAngleDelta,
    targetRelativeMovement,
    targetRelativeMovementDirection,
    toggledCameraModeState,
    trailCameraYaw,
    terrainTransitionAllowed,
} from "../src/ThirdPersonController.js";

test("camera blockers exclude scheduled NPC meshes", () => {
    const enabled = () => true;
    assert.equal(defaultCameraBlockerPredicate({
        isPickable: true,
        isEnabled: enabled,
        checkCollisions: true,
        metadata: {
            cameraBlocker: true,
            scheduledActor: "NOZOMI",
            scheduledActorInstanceId: "NOZOMI:1",
        },
    }), false);
    assert.equal(defaultCameraBlockerPredicate({
        isPickable: true,
        isEnabled: enabled,
        checkCollisions: true,
        metadata: { cameraBlocker: true },
        parent: {
            metadata: {
                scheduledActorInstanceId: "NOZOMI:1",
            },
            parent: null,
        },
    }), false);
    assert.equal(defaultCameraBlockerPredicate({
        isPickable: true,
        isEnabled: enabled,
        checkCollisions: true,
        metadata: {
            cameraBlocker: false,
            scheduledActorOcclusionProxy: true,
        },
    }), false);
    assert.equal(defaultCameraBlockerPredicate({
        isPickable: true,
        isEnabled: enabled,
        checkCollisions: true,
        metadata: { cameraBlocker: true },
    }), true);
});

test("leaves browser and OS keyboard commands untouched", () => {
    assert.equal(DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.runEnabled, true);
    assert.equal(hasCommandModifier({ ctrlKey: true }), true);
    assert.equal(hasCommandModifier({ metaKey: true }), true);
    assert.equal(hasCommandModifier({ altKey: true }), true);
    assert.equal(
        hasCommandModifier({
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: true,
        }),
        false,
    );
});

test("custom controls map to canonical movement keys by input context", () => {
    const bindings = {
        moveForward: "KeyI",
        moveLeft: "KeyJ",
        moveBackward: "KeyK",
        moveRight: "KeyL",
        run: "Space",
        autoRun: "KeyU",
        noClip: "KeyN",
        cameraMode: "KeyC",
        forkliftLower: "KeyV",
        forkliftRaise: "KeyB",
        forkliftHorn: "KeyG",
    };
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            options: {
                inputContext: "exploration",
                getKeyBinding: (action) => bindings[action],
            },
        },
    );

    assert.equal(controller.canonicalInputCode("KeyI"), "KeyW");
    assert.equal(controller.canonicalInputCode("Space"), "ShiftLeft");
    assert.equal(controller.canonicalInputCode("KeyC"), "KeyR");
    assert.equal(controller.canonicalInputCode("KeyB"), "KeyB");
    assert.equal(controller.canonicalInputCode("KeyW"), null);
    assert.equal(controller.canonicalInputCode("ShiftLeft"), null);
    assert.equal(controller.canonicalInputCode("ShiftRight"), null);
    assert.equal(controller.canonicalInputCode("ArrowUp"), "ArrowUp");

    controller.options.inputContext = "forklift";
    assert.equal(controller.canonicalInputCode("KeyB"), "KeyE");
    assert.equal(controller.canonicalInputCode("KeyV"), "KeyF");
    assert.equal(controller.canonicalInputCode("KeyG"), "KeyH");
    assert.equal(controller.canonicalInputCode("KeyC"), "KeyR");
    assert.equal(controller.canonicalInputCode("KeyR"), null);
});

test("adds forward input to the active perspective during auto-run", () => {
    const keys = new Set(["KeyA"]);
    assert.equal(movementKeysWithAutoRun(keys, false), keys);
    assert.deepEqual(
        [...movementKeysWithAutoRun(keys, true)].sort(),
        ["KeyA", "KeyW"],
    );
    assert.deepEqual([...keys], ["KeyA"]);
});

test("suppresses held and auto-run movement while interaction-locked", () => {
    const keys = new Set(["KeyW", "KeyA"]);
    assert.deepEqual(
        [...movementKeysForController(keys, true, true)],
        [],
    );
    assert.equal(
        movementKeysForController(keys, false, false),
        keys,
    );
});

test("preserves travel options across a destination reset", () => {
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            options: {
                cameraMinDistance: 0.9,
                cameraMaxDistance: 6,
                cameraDistance: 3.2,
                cameraMinPitch: -0.35,
                cameraMaxPitch: 1.05,
                cameraPitch: 0.24,
                firstPersonEnabled: true,
            },
            runToggled: true,
            autoRun: true,
            noClip: true,
            firstPerson: false,
            cameraDistance: 4.7,
            thirdPersonCameraDistance: 4.7,
            cameraPitch: 0.61,
            collider: { checkCollisions: false },
            updateCamera() {},
            recordSafePosition() {},
        },
    );
    const snapshot = controller.captureTravelState();

    Object.assign(controller, {
        runToggled: false,
        autoRun: false,
        noClip: false,
        firstPerson: false,
        cameraDistance: 3.2,
        thirdPersonCameraDistance: 3.2,
        cameraPitch: 0.24,
    });
    controller.restoreTravelState(snapshot);

    assert.deepEqual(controller.captureTravelState(), snapshot);
    assert.equal(controller.collider.checkCollisions, false);
});

test("no-clip cannot be enabled when the runtime disables it", () => {
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            options: { noClipEnabled: false },
            noClip: false,
            airborne: false,
            verticalVelocity: -2,
            collider: { checkCollisions: true },
        },
    );

    assert.equal(controller.setNoClip(true), false);
    assert.equal(controller.noClip, false);
    assert.equal(controller.collider.checkCollisions, true);
});

test("vehicle reset can preserve an already-grounded tilted pivot", () => {
    let terrainSnaps = 0;
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            options: {
                cameraPitch: 0.24,
                cameraDistance: 3.2,
                cameraTargetHeight: 1.4,
            },
            collider: { position: BABYLON.Vector3.Zero() },
            actorRoot: {
                position: BABYLON.Vector3.Zero(),
                rotation: { y: 0 },
            },
            snapToTerrain() {
                terrainSnaps += 1;
                this.collider.position.y = 0;
                this.actorRoot.position.y = 0;
            },
            updateCamera() {},
        },
    );
    const tippedPivot = new BABYLON.Vector3(4, 1.15, -2);
    controller.reset(tippedPivot, 0.7, { snapToTerrain: false });
    assert.equal(terrainSnaps, 0);
    assert.deepEqual(controller.collider.position.asArray(), [4, 1.15, -2]);
    assert.deepEqual(controller.actorRoot.position.asArray(), [4, 1.15, -2]);

    controller.reset(tippedPivot, 0.7);
    assert.equal(terrainSnaps, 1);
    assert.equal(controller.collider.position.y, 0);
});

test("normalizes camera-relative WASD movement", () => {
    const forward = cameraRelativeMovement(new Set(["KeyW"]), Math.PI);
    const right = cameraRelativeMovement(new Set(["KeyD"]), Math.PI);
    const diagonal = cameraRelativeMovement(
        new Set(["KeyW", "KeyD"]),
        Math.PI,
    );

    assert.ok(BABYLON.Vector3.Distance(
        forward,
        new BABYLON.Vector3(0, 0, 1),
    ) < 1e-12);
    assert.ok(BABYLON.Vector3.Distance(
        right,
        new BABYLON.Vector3(1, 0, 0),
    ) < 1e-12);
    assert.equal(forward.x, 0);
    assert.equal(right.z, 0);
    assert.ok(Math.abs(diagonal.length() - 1) < 1e-12);
});

test("combat movement advances, retreats, and strafes around its target", () => {
    const targetYaw = Math.PI / 2;
    const forward = targetRelativeMovement(new Set(["KeyW"]), targetYaw);
    const backward = targetRelativeMovement(new Set(["KeyS"]), targetYaw);
    const left = targetRelativeMovement(new Set(["KeyA"]), targetYaw);
    const right = targetRelativeMovement(new Set(["KeyD"]), targetYaw);

    assert.ok(BABYLON.Vector3.Distance(
        forward,
        new BABYLON.Vector3(1, 0, 0),
    ) < 1e-12);
    assert.ok(BABYLON.Vector3.Distance(
        backward,
        new BABYLON.Vector3(-1, 0, 0),
    ) < 1e-12);
    assert.ok(BABYLON.Vector3.Distance(
        left,
        new BABYLON.Vector3(0, 0, 1),
    ) < 1e-12);
    assert.ok(BABYLON.Vector3.Distance(
        right,
        new BABYLON.Vector3(0, 0, -1),
    ) < 1e-12);
    assert.equal(targetRelativeMovementDirection(new Set(["KeyW"])), "forward");
    assert.equal(targetRelativeMovementDirection(new Set(["KeyS"])), "backward");
    assert.equal(targetRelativeMovementDirection(new Set(["KeyA"])), "left");
    assert.equal(targetRelativeMovementDirection(new Set(["KeyD"])), "right");
});

test("held Shift dashes in every combat movement direction without turning", () => {
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            movementLocked: false,
            firstPerson: false,
            keys: new Set(["KeyD", "ShiftLeft"]),
            autoRun: false,
            touchInput: { x: 0, y: 0, magnitude: 0 },
            touchRunning: false,
            runToggled: false,
            cameraYaw: 1,
            lastActorYaw: -1,
            stationaryTurnRemainingSeconds: 0,
            noClip: false,
            airborne: false,
            rightMouseDown: false,
            touchLookPointerId: null,
            pointerLocked: false,
            cameraDistance: 3,
            cameraResolvedDistance: 3,
            actorRoot: {
                position: BABYLON.Vector3.Zero(),
                rotation: { y: -1 },
            },
            collider: { position: BABYLON.Vector3.Zero() },
            options: {
                ...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS,
                toggleRun: false,
            },
            moveHorizontal() {
                return null;
            },
            advanceVertical() {
                return null;
            },
            updateCamera() {},
        },
    );

    const movement = controller.update(1 / 60, {
        movementTargetYaw: 0.25,
        actorFacingYaw: 0.25,
        directionalDash: true,
        updateCamera: false,
    });
    assert.equal(movement.running, true);
    assert.equal(movement.combatDirection, "right");
    assert.equal(controller.actorRoot.rotation.y, 0.25);
});

test("controller movement consumes a semantic action snapshot", () => {
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            movementLocked: false,
            firstPerson: false,
            keys: new Set(),
            autoRun: false,
            touchInput: { x: 0, y: 0, magnitude: 0 },
            touchRunning: false,
            runToggled: true,
            cameraYaw: 0,
            lastActorYaw: 0,
            stationaryTurnRemainingSeconds: 0,
            noClip: false,
            airborne: false,
            rightMouseDown: false,
            touchLookPointerId: null,
            pointerLocked: false,
            cameraDistance: 3,
            cameraResolvedDistance: 3,
            actorRoot: {
                position: BABYLON.Vector3.Zero(),
                rotation: { y: 0 },
            },
            collider: { position: BABYLON.Vector3.Zero() },
            options: {
                ...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS,
                toggleRun: true,
            },
            moveHorizontal(displacement) {
                this.lastDisplacement = displacement;
                return null;
            },
            advanceVertical() {
                return null;
            },
            updateCamera() {},
        },
    );
    const inputSnapshot = {
        value: (name) => ({ moveX: 0.5, moveY: 1 }[name] || 0),
        held: () => false,
    };
    const movement = controller.update(1 / 60, {
        inputSnapshot,
        updateCamera: false,
    });
    assert.equal(movement.moving, true);
    assert.equal(movement.running, true);
    assert.ok(controller.lastDisplacement.lengthSquared() > 0);

    const heldToWalk = controller.update(1 / 60, {
        inputSnapshot: {
            ...inputSnapshot,
            held: (name) => name === "run" || name === "runModifier",
        },
        updateCamera: false,
    });
    assert.equal(heldToWalk.running, false);

    controller.snapToTerrain = () => null;
    for (const firstPerson of [false, true]) {
        for (const [key, direction] of [["KeyA", -1], ["KeyD", 1]]) {
            const actions = new InputActionSystem();
            actions.setButton("keyboard", key, true);
            controller.firstPerson = firstPerson;
            const yaw = controller.cameraYaw;
            const result = controller.update(1 / 60, {
                inputSnapshot: actions.snapshot(), updateCamera: false,
            });
            assert.equal(result.moving, false, `${key} turns without stepping`);
            assert.equal(result.turning, true);
            assert.equal(Math.sign(controller.cameraYaw - yaw), direction);
            const lockedYaw = controller.cameraYaw;
            controller.update(1 / 60, {
                inputSnapshot: actions.snapshot(), lockMovement: true, updateCamera: false,
            });
            assert.equal(controller.cameraYaw, lockedYaw);
        }
    }
    controller.firstPerson = false;
    const actions = new InputActionSystem();
    actions.setButton("keyboard", "KeyD", true);
    const combat = controller.update(1 / 60, {
        inputSnapshot: actions.snapshot(), movementTargetYaw: 0, updateCamera: false,
    });
    assert.equal(combat.moving, true);
    assert.equal(combat.combatDirection, "right");
    actions.setButton("keyboard", "KeyW", true);
    const previousYaw = controller.cameraYaw;
    const walkingTurn = controller.update(1 / 60, {
        inputSnapshot: actions.snapshot(), updateCamera: false,
    });
    assert.equal(walkingTurn.moving, true);
    assert.ok(controller.cameraYaw > previousYaw);
});

test("combat retreat can be accelerated without changing other directions", () => {
    const makeController = (keys) => Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            movementLocked: false,
            firstPerson: false,
            keys: new Set(keys),
            autoRun: false,
            touchInput: { x: 0, y: 0, magnitude: 0 },
            touchRunning: false,
            runToggled: false,
            cameraYaw: 0,
            lastActorYaw: 0,
            stationaryTurnRemainingSeconds: 0,
            noClip: false,
            airborne: false,
            rightMouseDown: false,
            touchLookPointerId: null,
            pointerLocked: false,
            cameraDistance: 3,
            cameraResolvedDistance: 3,
            actorRoot: {
                position: BABYLON.Vector3.Zero(),
                rotation: { y: 0 },
            },
            collider: { position: BABYLON.Vector3.Zero() },
            options: {
                ...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS,
                walkSpeed: 1,
                backwardSpeedMultiplier: 1,
            },
            moveHorizontal(displacement) {
                this.displacement = displacement;
                return null;
            },
            advanceVertical() {
                return null;
            },
            updateCamera() {},
        },
    );
    const options = {
        movementTargetYaw: 0,
        actorFacingYaw: 0,
        targetRelativeBackwardMultiplier: 3,
        updateCamera: false,
    };
    const retreat = makeController(["KeyS"]);
    const advance = makeController(["KeyW"]);

    retreat.update(1 / 20, options);
    advance.update(1 / 20, options);

    assert.ok(Math.abs(retreat.displacement.length() - 0.15) < 1e-12);
    assert.ok(Math.abs(advance.displacement.length() - 0.05) < 1e-12);
});

test("uses tank movement in first person", () => {
    const cameraYaw = 0.4;
    const backward = firstPersonMovement(new Set(["KeyS"]), cameraYaw);
    const cameraForward = firstPersonMovement(new Set(["KeyW"]), cameraYaw);

    assert.ok(BABYLON.Vector3.Dot(backward, cameraForward) < -0.999999);
    assert.deepEqual(
        firstPersonMovement(new Set(["KeyA"]), cameraYaw).asArray(),
        [0, 0, 0],
    );
    assert.equal(firstPersonTurnInput(new Set(["KeyA"])), -1);
    assert.equal(firstPersonTurnInput(new Set(["KeyD"])), 1);
    assert.equal(
        actorYawForMovement(backward, cameraYaw, true),
        cameraYaw + Math.PI,
    );
    assert.equal(
        actorYawForMovement(backward, cameraYaw, false),
        Math.atan2(backward.x, backward.z),
    );
});

test("third-person backpedaling keeps the actor facing forward", () => {
    const cameraYaw = 0.4;
    const backward = cameraRelativeMovement(new Set(["KeyS"]), cameraYaw);

    assert.equal(keyboardBackwardActive(new Set(["KeyS"])), true);
    assert.equal(keyboardBackwardActive(new Set(["KeyW"])), false);
    assert.equal(
        actorYawForMovement(backward, cameraYaw, false, true),
        cameraYaw + Math.PI,
    );
    assert.equal(
        actorYawForMovement(
            backward,
            cameraYaw,
            false,
            true,
            -1,
            Math.PI / 4,
        ),
        cameraYaw + Math.PI - Math.PI / 4,
    );
    assert.equal(
        actorYawForMovement(
            backward,
            cameraYaw,
            false,
            true,
            1,
            Math.PI / 4,
        ),
        cameraYaw + Math.PI + Math.PI / 4,
    );
});

test("first-person backward input is classified as backpedaling", () => {
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            movementLocked: false,
            firstPerson: true,
            keys: new Set(["KeyS"]),
            autoRun: false,
            touchInput: { x: 0, y: 0, magnitude: 0 },
            touchRunning: false,
            runToggled: true,
            cameraYaw: 0,
            lastActorYaw: 0,
            stationaryTurnRemainingSeconds: 0,
            noClip: false,
            airborne: false,
            actorRoot: {
                position: BABYLON.Vector3.Zero(),
                rotation: { y: 0 },
            },
            collider: { position: BABYLON.Vector3.Zero() },
            options: {
                ...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS,
                toggleRun: true,
            },
            moveHorizontal() {
                return null;
            },
            advanceVertical() {
                return null;
            },
            updateCamera() {},
            alignActorToFirstPersonView() {
                this.actorRoot.rotation.y = this.cameraYaw + Math.PI;
            },
        },
    );

    const movement = controller.update(1 / 60);
    assert.equal(movement.backpedaling, true);
    assert.equal(movement.running, false);
});

test("slows backward and lateral-only keyboard movement", () => {
    const options = {
        backwardSpeedMultiplier: 0.7,
        lateralSpeedMultiplier: 0.75,
    };
    assert.equal(keyboardMovementSpeedMultiplier(
        new Set(["KeyW", "KeyA"]),
        options,
    ), 1);
    assert.equal(keyboardMovementSpeedMultiplier(
        new Set(["KeyS"]),
        options,
    ), 0.7);
    assert.equal(keyboardMovementSpeedMultiplier(
        new Set(["KeyA"]),
        options,
    ), 0.75);
    assert.equal(keyboardForwardActive(new Set(["KeyW", "KeyD"])), true);
    assert.equal(keyboardForwardActive(new Set(["KeyD"])), false);
});

test("run speed multiplier scales running without changing walking", () => {
    const options = {
        ...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS,
        walkSpeed: 1.5,
        runSpeed: 6,
        runSpeedMultiplier: 10,
    };
    assert.equal(
        controllerMovementSpeed(true, false, new Set(["KeyW"]), options),
        60,
    );
    assert.equal(
        controllerMovementSpeed(false, false, new Set(["KeyW"]), options),
        1.5,
    );
    assert.equal(
        controllerMovementSpeed(true, true, new Set(), options),
        60,
    );
});

test("normalizes touch input with a dead zone and capped magnitude", () => {
    assert.deepEqual(normalizedTouchInput(0.04, -0.03, 0.1), {
        x: 0,
        y: 0,
        magnitude: 0,
    });
    assert.deepEqual(normalizedTouchInput(0.6, 0.8, 0.1), {
        x: 0.6,
        y: 0.8,
        magnitude: 1,
    });
    const capped = normalizedTouchInput(3, 4, 0.1);
    assert.ok(Math.abs(capped.x - 0.6) < 1e-12);
    assert.ok(Math.abs(capped.y - 0.8) < 1e-12);
    assert.equal(capped.magnitude, 1);
});

test("uses joystick magnitude hysteresis for touch running", () => {
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            options: {
                touchDeadZone: 0.1,
                touchRunThreshold: 0.82,
                touchRunReleaseThreshold: 0.68,
            },
            autoRun: true,
            touchInput: { x: 0, y: 0, magnitude: 0 },
            touchRunning: false,
        },
    );

    assert.equal(controller.setTouchMovement(0, 0.9).running, true);
    assert.equal(controller.setTouchMovement(0, 0.75).running, true);
    assert.equal(controller.setTouchMovement(0, 0.6).running, false);
    assert.equal(
        controller.setTouchMovement(0, 1, { running: false }).running,
        false,
    );
    assert.equal(
        controller.setTouchMovement(0, 0.2, { running: true }).running,
        true,
    );
    controller.setTouchMovement(0, -0.5);
    assert.equal(controller.autoRun, false);
    controller.clearTouchMovement();
    assert.deepEqual(controller.touchInput, { x: 0, y: 0, magnitude: 0 });
    assert.equal(controller.touchRunning, false);
});

test("removes collision-engine drift outside the requested direction", () => {
    const constrained = constrainCollisionDisplacement(
        new BABYLON.Vector3(0.2, -0.05, 0.6),
        new BABYLON.Vector3(0, 0, 0.7),
    );
    assert.deepEqual(constrained.asArray(), [0, 0, 0.6]);

    const diagonal = constrainCollisionDisplacement(
        new BABYLON.Vector3(0.4, 0, -0.1),
        new BABYLON.Vector3(0.2, 0, 0.2),
    );
    assert.deepEqual(diagonal.asArray(), [0.2, 0, 0]);
});

test("native collision permits only movement out of existing penetration", () => {
    const nativeWall = (segments) => ({
        checkCollisions: true,
        isEnabled: () => true,
        position: BABYLON.Vector3.Zero(),
        metadata: {
            nativeCollision: true,
            nativeCollisionSegments: segments,
        },
    });
    const wall = nativeWall([[[0, -2], [0, 2]]]);
    const position = new BABYLON.Vector3(-0.23, 0, 0);

    assert.equal(nativeCollisionEscapeAllowed(
        [wall],
        position,
        new BABYLON.Vector3(-0.1, 0, 0),
        0.24,
    ), true);
    assert.equal(nativeCollisionEscapeAllowed(
        [wall],
        position,
        new BABYLON.Vector3(0.1, 0, 0),
        0.24,
    ), false);
    assert.equal(nativeCollisionEscapeAllowed(
        [wall],
        position,
        new BABYLON.Vector3(0, 0, 0.1),
        0.24,
    ), false);
    assert.equal(nativeCollisionEscapeAllowed(
        [wall],
        position,
        new BABYLON.Vector3(0.5, 0, 0),
        0.24,
    ), false);

    const secondWall = nativeWall([[[-0.31, -2], [-0.31, 2]]]);
    assert.equal(nativeCollisionEscapeAllowed(
        [wall, secondWall],
        position,
        new BABYLON.Vector3(-0.1, 0, 0),
        0.24,
    ), false);
});

test("native collision recovery validates endpoints and prevents tunneling", () => {
    const nativeWall = (segments) => ({
        checkCollisions: true,
        isEnabled: () => true,
        position: BABYLON.Vector3.Zero(),
        metadata: {
            nativeCollision: true,
            nativeCollisionSegments: segments,
        },
    });
    const wall = nativeWall([[[0, -2], [0, 2]]]);
    const secondWall = nativeWall([[[-0.65, -2], [-0.65, 2]]]);
    const penetrating = new BABYLON.Vector3(-0.23, 0, 0);
    const clear = new BABYLON.Vector3(-0.32, 0, 0);

    assert.equal(nativeCollisionPositionClear([wall], penetrating, 0.24), false);
    assert.equal(nativeCollisionPositionClear([wall], clear, 0.24), true);
    assert.equal(nativeCollisionRecoveryPathClear(
        [wall],
        penetrating,
        clear,
        0.24,
    ), true);
    assert.equal(nativeCollisionRecoveryPathClear(
        [wall, secondWall],
        penetrating,
        new BABYLON.Vector3(-0.95, 0, 0),
        0.24,
    ), false);
    assert.equal(nativeCollisionRecoveryPathClear(
        [wall],
        penetrating,
        new BABYLON.Vector3(0.32, 0, 0),
        0.24,
    ), false);
    assert.equal(nativeCollisionDisplacementAllowed(
        [wall],
        new BABYLON.Vector3(-0.4, 0, 0),
        new BABYLON.Vector3(0.8, 0, 0),
        0.24,
    ), false);
    assert.equal(nativeCollisionDisplacementAllowed(
        [wall],
        new BABYLON.Vector3(-0.4, 0, 0),
        new BABYLON.Vector3(0, 0, 0.5),
        0.24,
    ), true);
});

test("three-dimensional native walls only block their authored floor", () => {
    const upperFloorWall = {
        checkCollisions: true,
        isEnabled: () => true,
        position: BABYLON.Vector3.Zero(),
        metadata: {
            nativeCollision: true,
            nativeCollisionSegments: [[[0, -2], [0, 2]]],
            nativeCollisionSegmentYRanges: [[10, 12]],
        },
    };
    assert.equal(nativeCollisionDisplacementAllowed(
        [upperFloorWall],
        new BABYLON.Vector3(-0.4, 0, 0),
        new BABYLON.Vector3(0.8, 0, 0),
        0.24,
    ), true);
    assert.equal(nativeCollisionDisplacementAllowed(
        [upperFloorWall],
        new BABYLON.Vector3(-0.4, 10, 0),
        new BABYLON.Vector3(0.8, 0, 0),
        0.24,
    ), false);
});

test("turns through the shortest wrapped angle", () => {
    const from = Math.PI - 0.1;
    const to = -Math.PI + 0.1;
    assert.ok(Math.abs(shortestAngleDelta(from, to) - 0.2) < 1e-12);
});

test("detects first-person yaw changes as stationary turning", () => {
    assert.equal(actorTurningSince(0.2, 0.4, true), true);
    assert.equal(actorTurningSince(0.2, 0.4, false), false);
    assert.equal(actorTurningSince(0.2, 0.2, true), false);
    assert.equal(
        actorTurningSince(Math.PI - 0.1, -Math.PI + 0.1, true),
        true,
    );
});

test("orbits horizontally in the right-drag direction", () => {
    assert.equal(orbitYaw(0.5, 0.25), 0.75);
    assert.equal(orbitYaw(0.5, -0.25), 0.25);
});

test("first-person orbit keeps actor facing aligned with the view", () => {
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            cameraYaw: 0.5,
            cameraPitch: 0.2,
            firstPerson: true,
            actorRoot: { rotation: { y: 0 } },
            options: {
                cameraMinPitch: -0.35,
                cameraMaxPitch: 1.05,
            },
        },
    );
    controller.orbitBy(0.25, 0);
    assert.equal(controller.cameraYaw, 0.75);
    assert.equal(controller.actorRoot.rotation.y, 0.75 + Math.PI);
});

test("first-person orbit preserves actor facing while interaction-locked", () => {
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            cameraYaw: 0.5,
            cameraPitch: 0.2,
            firstPerson: true,
            movementLocked: true,
            actorRoot: { rotation: { y: 1.25 } },
            options: {
                cameraMinPitch: -0.35,
                cameraMaxPitch: 1.05,
            },
        },
    );
    controller.orbitBy(0.25, 0);
    assert.equal(controller.cameraYaw, 0.75);
    assert.equal(controller.actorRoot.rotation.y, 1.25);
});

test("orbits vertically in mouse-look direction and clamps pitch", () => {
    assert.equal(orbitPitch(0.2, -0.1, -0.35, 1.05), 0.1);
    assert.ok(Math.abs(
        orbitPitch(0.2, 0.1, -0.35, 1.05) - 0.3,
    ) < 1e-12);
    assert.equal(orbitPitch(1, 0.5, -0.35, 1.05), 1.05);
});

test("enters first person beyond minimum zoom and scrolls back out", () => {
    const options = {
        cameraMinDistance: 0.9,
        cameraMaxDistance: 6,
        cameraZoomStep: 0.35,
        firstPersonEnabled: true,
    };
    assert.deepEqual(cameraZoomState(1.25, false, -1, options), {
        cameraDistance: 0.9,
        firstPerson: false,
    });
    assert.deepEqual(cameraZoomState(0.9, false, -1, options), {
        cameraDistance: 0.9,
        firstPerson: true,
    });
    assert.deepEqual(cameraZoomState(0.9, true, 1, options), {
        cameraDistance: 1.25,
        firstPerson: false,
    });
    assert.deepEqual(toggledCameraModeState(3.2, false, options), {
        cameraDistance: 0.9,
        firstPerson: true,
    });
    assert.deepEqual(toggledCameraModeState(0.9, true, options), {
        cameraDistance: 1.25,
        firstPerson: false,
    });
    assert.deepEqual(toggledCameraModeState(
        0.9,
        true,
        options,
        4.7,
    ), {
        cameraDistance: 4.7,
        firstPerson: false,
    });
    assert.deepEqual(cameraZoomState(0.9, true, 1, options, 4.7), {
        cameraDistance: 4.7,
        firstPerson: false,
    });
});

test("forklift first-person exit resets to the chase camera", () => {
    const changes = [];
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            actorRoot: { rotation: { y: 0.75 } },
            firstPerson: true,
            cameraYaw: -1.2,
            cameraPitch: 0.8,
            cameraDistance: 0.9,
            thirdPersonCameraDistance: 4.2,
            options: {
                firstPersonEnabled: true,
                cameraMinDistance: 0.9,
                cameraMaxDistance: 6,
                cameraPitch: 0.24,
                resetThirdPersonViewOnFirstPersonExit: true,
                onFirstPersonChanged: (...change) => changes.push(change),
            },
            updateCamera: () => {},
        },
    );

    controller.setFirstPerson(false);

    assert.equal(controller.firstPerson, false);
    assert.equal(controller.cameraDistance, 4.2);
    assert.equal(controller.cameraYaw, 0.75 + Math.PI);
    assert.equal(controller.cameraPitch, 0.24);
    assert.deepEqual(changes, [[false, true]]);
});

test("trails the camera toward the shortest angle behind the actor", () => {
    assert.ok(Math.abs(
        trailCameraYaw(0, Math.PI / 2, 3, 0.1) + Math.PI * 0.15,
    ) < 1e-12);
    assert.ok(Math.abs(
        trailCameraYaw(0.2, -Math.PI + 0.2, 3, 1) - 0.2,
    ) < 1e-12);
});

test("pulls the camera in front of a wall on the player sightline", () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const wall = BABYLON.MeshBuilder.CreateBox("wall", {
        width: 4,
        height: 4,
        depth: 0.1,
    }, scene);
    wall.position.z = 1;
    wall.isPickable = true;
    wall.metadata = { cameraBlocker: true };
    wall.computeWorldMatrix(true);

    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            scene,
            noClip: false,
            cameraBlockerPredicate: (mesh) => (
                mesh.metadata?.cameraBlocker === true
            ),
            cameraResolvedDistance: 0,
            options: {
                cameraCollisionPadding: 0.08,
                cameraMinimumResolvedDistance: 0.16,
            },
        },
    );
    const resolved = controller.resolveCameraPosition(
        BABYLON.Vector3.Zero(),
        new BABYLON.Vector3(0, 0, 3),
    );

    assert.ok(resolved.z > 0.8 && resolved.z < 0.95);
    assert.equal(resolved.x, 0);
    assert.equal(resolved.y, 0);
    assert.equal(controller.cameraResolvedDistance, resolved.z);

    controller.noClip = true;
    const noClipResolved = controller.resolveCameraPosition(
        BABYLON.Vector3.Zero(),
        new BABYLON.Vector3(0, 0, 3),
    );
    assert.ok(noClipResolved.z > 0.8 && noClipResolved.z < 0.95);

    engine.dispose();
});

test("accepts walkable terrain and rejects cliffs, drops, and steep slopes", () => {
    const options = {
        maxStepUp: 0.32,
        maxDrop: 0.8,
        maxSlopeDegrees: 50,
    };
    assert.equal(terrainTransitionAllowed(0, {
        height: 0.2,
        normal: BABYLON.Vector3.Up(),
    }, options), true);
    assert.equal(terrainTransitionAllowed(0, {
        height: 0.5,
        normal: BABYLON.Vector3.Up(),
    }, options), false);
    assert.equal(terrainTransitionAllowed(0, {
        height: -1,
        normal: BABYLON.Vector3.Up(),
    }, options), false);
    assert.equal(terrainTransitionAllowed(0, {
        height: 0,
        normal: new BABYLON.Vector3(1, 0, 0),
    }, options), false);
});

test("terrain slope uses geometric faces instead of smoothed render normals", () => {
    const calls = [];
    const surface = nearestWalkableRaySurface([{
        hit: true,
        distance: 1,
        pickedPoint: new BABYLON.Vector3(0, 0, 0),
        pickedMesh: { name: "flat_stair_tread" },
        getNormal(useWorldCoordinates, useVerticesNormals) {
            calls.push([useWorldCoordinates, useVerticesNormals]);
            return useVerticesNormals
                ? new BABYLON.Vector3(0.85, 0.53, 0)
                : BABYLON.Vector3.Up();
        },
    }], 0, {
        maxStepUp: 0.32,
        maxDrop: 0.8,
        maxSlopeDegrees: 50,
    });

    assert.ok(surface);
    assert.equal(surface.mesh.name, "flat_stair_tread");
    assert.deepEqual(calls, [[true, false]]);
    assert.deepEqual(surface.normal.asArray(), [0, 1, 0]);
});

test("airborne actors accelerate downward and land on crossed terrain", () => {
    const actorRoot = { position: BABYLON.Vector3.Zero() };
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            noClip: false,
            airborne: true,
            verticalVelocity: 0,
            collider: { position: new BABYLON.Vector3(0, 1, 0) },
            actorRoot,
            options: {
                gravity: -10,
                terminalFallSpeed: -30,
                maxStepUp: 0.32,
                maxSlopeDegrees: 50,
                stepClearance: 0.025,
            },
            sampleTerrain: () => null,
        },
    );
    assert.equal(controller.advanceVertical(0.05), null);
    assert.equal(controller.verticalVelocity, -0.5);
    assert.ok(Math.abs(controller.collider.position.y - 0.975) < 1e-12);

    controller.collider.position.y = 0.1;
    controller.verticalVelocity = -2;
    controller.sampleTerrain = () => ({
        height: 0,
        normal: BABYLON.Vector3.Up(),
    });
    const landing = controller.advanceVertical(0.05);
    assert.equal(landing.height, 0);
    assert.equal(controller.collider.position.y, 0);
    assert.equal(controller.verticalVelocity, 0);
    assert.equal(controller.airborne, false);
});

test("walking beyond a terrain edge enters free fall instead of reverting", () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    const dock = BABYLON.MeshBuilder.CreateGround("dock", {
        width: 2,
        height: 2,
    }, scene);
    dock.isPickable = true;
    dock.checkCollisions = true;
    dock.metadata = { terrain: true };
    dock.computeWorldMatrix(true);
    const collider = BABYLON.MeshBuilder.CreateSphere("collider", {
        diameter: 0.48,
    }, scene);
    collider.position.set(0, 0, 0.9);
    collider.ellipsoid.set(0.24, 0.86, 0.24);
    collider.ellipsoidOffset.set(0, 0.86, 0);
    collider.checkCollisions = true;
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            scene,
            collider,
            actorRoot: { position: collider.position.clone() },
            noClip: false,
            airborne: false,
            verticalVelocity: 0,
            options: { ...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS },
            terrainPredicate: (mesh) => mesh.metadata?.terrain === true,
            stepSurfacePredicate: (mesh) => mesh.metadata?.terrain === true,
        },
    );

    const terrain = controller.moveHorizontal(
        new BABYLON.Vector3(0, 0, 0.4),
    );
    controller.advanceVertical(0.05);
    assert.equal(terrain, null);
    assert.equal(controller.airborne, true);
    assert.ok(Math.abs(controller.collider.position.z - 1.3) < 1e-6);
    assert.ok(controller.collider.position.y < 0);

    scene.dispose();
    engine.dispose();
});

test("collision movement refreshes an invisible collider after a spawn", () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    const wall = BABYLON.MeshBuilder.CreateBox("origin wall", {
        width: 2,
        height: 3,
        depth: 2,
    }, scene);
    wall.position.y = 1.5;
    wall.checkCollisions = true;
    wall.computeWorldMatrix(true);
    const collider = BABYLON.MeshBuilder.CreateSphere("collider", {
        diameter: 0.48,
    }, scene);
    collider.isVisible = false;
    collider.ellipsoid.set(0.24, 0.86, 0.24);
    collider.ellipsoidOffset.set(0, 0.86, 0);
    collider.checkCollisions = true;
    collider.computeWorldMatrix(true);
    // Simulate a world spawn after Babylon cached the collider at the origin.
    collider.position.set(5, 0, 0);
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            scene,
            collider,
            actorRoot: { position: collider.position.clone() },
            noClip: false,
            airborne: false,
            verticalVelocity: 0,
            options: { ...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS },
            sampleTerrain: () => ({
                height: 0,
                normal: BABYLON.Vector3.Up(),
            }),
        },
    );

    controller.moveHorizontal(new BABYLON.Vector3(0.2, 0, 0));

    assert.ok(Math.abs(collider.position.x - 5.2) < 1e-6);
    assert.equal(collider.position.y, 0);

    scene.dispose();
    engine.dispose();
});

test("double-sided angled walls do not pull the controller inward", () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    const wall = new BABYLON.Mesh("double-sided angled wall", scene);
    const wallData = new BABYLON.VertexData();
    wallData.positions = [
        -5, -2, -5,
        5, -2, 5,
        5, 2, 5,
        -5, 2, -5,
    ];
    wallData.indices = [
        0, 1, 2,
        0, 2, 3,
        2, 1, 0,
        3, 2, 0,
    ];
    wallData.applyToMesh(wall);
    wall.checkCollisions = true;

    const collider = BABYLON.MeshBuilder.CreateSphere("collider", {
        diameter: 0.48,
    }, scene);
    collider.isVisible = false;
    collider.ellipsoid.set(0.24, 0.86, 0.24);
    collider.ellipsoidOffset.set(0, 0.86, 0);
    collider.checkCollisions = true;
    collider.position.set(-0.3, 0, 0.3);
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            scene,
            collider,
            actorRoot: { position: collider.position.clone() },
            noClip: false,
            airborne: false,
            verticalVelocity: 0,
            options: { ...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS },
            sampleTerrain: () => ({
                height: 0,
                normal: BABYLON.Vector3.Up(),
            }),
            tryStepUp: () => null,
        },
    );

    const distanceFromWall = () => (
        (collider.position.z - collider.position.x) / Math.SQRT2
    );
    for (let index = 0; index < 10; index += 1) {
        controller.moveHorizontal(new BABYLON.Vector3(0.08, 0, -0.08));
    }
    assert.ok(distanceFromWall() >= 0.24);

    const contactDistance = distanceFromWall();
    controller.moveHorizontal(new BABYLON.Vector3(-0.08, 0, 0.08));
    assert.ok(distanceFromWall() > contactDistance + 0.1);

    scene.dispose();
    engine.dispose();
});

test("a controller overlapping native collision can move out but not in", () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    const wall = new BABYLON.Mesh("native wall", scene);
    const wallData = new BABYLON.VertexData();
    wallData.positions = [
        0, -2, -5,
        0, -2, 5,
        0, 2, 5,
        0, 2, -5,
    ];
    wallData.indices = [
        0, 1, 2,
        0, 2, 3,
        2, 1, 0,
        3, 2, 0,
    ];
    wallData.applyToMesh(wall);
    wall.checkCollisions = true;
    wall.metadata = {
        nativeCollision: true,
        nativeCollisionSegments: [[[0, -5], [0, 5]]],
    };

    const collider = BABYLON.MeshBuilder.CreateCylinder("collider", {
        diameter: 0.48,
        height: 1.72,
        tessellation: 16,
    }, scene);
    collider.isVisible = false;
    collider.ellipsoid.set(0.24, 0.86, 0.24);
    collider.ellipsoidOffset.set(0, 0.86, 0);
    collider.checkCollisions = true;
    collider.position.set(-0.23, 0, 0);
    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            scene,
            collider,
            actorRoot: { position: collider.position.clone() },
            noClip: false,
            airborne: false,
            verticalVelocity: 0,
            options: { ...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS },
            sampleTerrain: () => ({
                height: 0,
                normal: BABYLON.Vector3.Up(),
            }),
            tryStepUp: () => null,
        },
    );

    controller.moveHorizontal(new BABYLON.Vector3(-0.1, 0, 0));
    assert.ok(Math.abs(collider.position.x + 0.33) < 1e-6);

    collider.position.set(-0.23, 0, 0);
    collider.computeWorldMatrix(true);
    controller.moveHorizontal(new BABYLON.Vector3(0.1, 0, 0));
    assert.ok(collider.position.x <= -0.23 + 1e-6);

    scene.dispose();
    engine.dispose();
});

test("terrain height caps skip an interior roof and find the floor below", () => {
    assert.equal(boundedTerrainRayOrigin(6, 2), 2.0001);
    assert.equal(boundedTerrainRayOrigin(1, 2), 1);
    assert.equal(boundedTerrainRayOrigin(6, Infinity), 6);

    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const floor = BABYLON.MeshBuilder.CreateBox("floor", {
        width: 4,
        height: 0.1,
        depth: 4,
    }, scene);
    const roof = BABYLON.MeshBuilder.CreateBox("roof", {
        width: 4,
        height: 0.1,
        depth: 4,
    }, scene);
    roof.position.y = 3;
    floor.computeWorldMatrix(true);
    roof.computeWorldMatrix(true);

    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            scene,
            collider: { position: new BABYLON.Vector3(0, 3.05, 0) },
            terrainPredicate: () => true,
            stepSurfacePredicate: () => true,
            options: {
                maxStepUp: 0.32,
                stepClearance: 0.025,
                maxDrop: 0.8,
                maxSlopeDegrees: 50,
                terrainRayUp: 4,
                terrainRayDown: 12,
                terrainMaxHeight: 2,
            },
        },
    );
    const terrain = controller.sampleTerrain(0, 0, 3.05);
    assert.ok(terrain);
    assert.equal(terrain.mesh, floor);
    assert.ok(terrain.height < 0.1);

    scene.dispose();
    engine.dispose();
});

test("terrain sampling skips an interior ceiling without a map height cap", () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const floor = BABYLON.MeshBuilder.CreateBox("floor", {
        width: 4,
        height: 0.1,
        depth: 4,
    }, scene);
    floor.position.y = -0.05;
    const ceiling = BABYLON.MeshBuilder.CreateBox("ceiling", {
        width: 4,
        height: 0.1,
        depth: 4,
    }, scene);
    ceiling.position.y = 2.65;
    floor.computeWorldMatrix(true);
    ceiling.computeWorldMatrix(true);

    const controller = Object.assign(
        Object.create(ThirdPersonController.prototype),
        {
            scene,
            collider: { position: BABYLON.Vector3.Zero() },
            terrainPredicate: () => true,
            stepSurfacePredicate: () => true,
            options: {
                maxStepUp: 0.32,
                stepClearance: 0.025,
                stepProgressEpsilon: 0.005,
                maxDrop: 0.8,
                maxSlopeDegrees: 50,
                terrainRayUp: 4,
                terrainRayDown: 12,
                terrainMaxHeight: Number.POSITIVE_INFINITY,
            },
        },
    );

    const terrain = controller.sampleTerrain(0, 0, 0);
    assert.ok(terrain);
    assert.equal(terrain.mesh, floor);
    assert.ok(Math.abs(terrain.height) < 1e-6);

    scene.dispose();
    engine.dispose();
});
