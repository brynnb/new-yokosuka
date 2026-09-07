import * as BABYLON from "@babylonjs/core";

export const DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS = Object.freeze({
    walkSpeed: 1.55,
    runSpeed: 6.35,
    runSpeedMultiplier: 1,
    runEnabled: true,
    toggleRun: false,
    noClipEnabled: true,
    turnResponse: 14,
    playerRadius: 0.24,
    playerHeight: 1.72,
    maxStepUp: 0.32,
    stepClearance: 0.025,
    stepProgressEpsilon: 0.005,
    maxDrop: 0.8,
    maxSlopeDegrees: 50,
    gravity: -9.81,
    terminalFallSpeed: -30,
    terrainRayUp: 4,
    terrainRayDown: 12,
    terrainMaxHeight: Number.POSITIVE_INFINITY,
    cameraDistance: 3.2,
    cameraMinDistance: 0.9,
    cameraMaxDistance: 6,
    cameraZoomStep: 0.35,
    cameraTargetHeight: 1.12,
    firstPersonEnabled: true,
    firstPersonHeadHeight: 1.62,
    firstPersonCameraBackOffset: 0,
    firstPersonKeyboardTurnSpeed: 2.2,
    stationaryKeyboardTurnSpeed: 1.65,
    backwardSpeedMultiplier: 0.7,
    lateralSpeedMultiplier: 0.75,
    backpedalTurnAngle: Math.PI / 4,
    touchDeadZone: 0.1,
    touchRunThreshold: 0.82,
    touchRunReleaseThreshold: 0.68,
    stationaryTurnHoldSeconds: 0.1,
    cameraPitch: 0.24,
    cameraMinPitch: -0.35,
    cameraMaxPitch: 1.05,
    cameraSensitivity: 0.0025,
    touchCameraSensitivity: 0.004,
    touchPinchStepPixels: 24,
    cameraTrailSpeed: 3,
    cameraTargetResponse: 14,
    cameraCollisionPadding: 0.08,
    // Keep the camera outside Ryo's torso if a wall is immediately behind
    // him. The player collider guarantees at least this much center clearance.
    cameraMinimumResolvedDistance: 0.16,
    requestPointerLockOnClick: false,
    toggleNoClipKey: null,
    toggleFirstPersonKey: null,
    resetThirdPersonViewOnFirstPersonExit: false,
    toggleAutoRunKey: null,
    onRunToggleChanged: null,
    onFirstPersonChanged: null,
});

export function keyActive(keys, code) {
    return typeof keys?.has === "function"
        ? keys.has(code)
        : Boolean(keys?.[code]);
}

export function hasCommandModifier(event) {
    return Boolean(event?.ctrlKey || event?.metaKey || event?.altKey);
}

export function controllerMovementSpeed(
    running,
    touchActive,
    movementKeys,
    options,
) {
    const runMultiplier = Number.isFinite(options.runSpeedMultiplier)
        ? Math.max(0, options.runSpeedMultiplier)
        : 1;
    const baseSpeed = running
        ? options.runSpeed * runMultiplier
        : options.walkSpeed;
    return baseSpeed * (
        touchActive
            ? 1
            : keyboardMovementSpeedMultiplier(movementKeys, options)
    );
}

export function cameraRelativeMovement(keys, cameraYaw) {
    const forwardInput = (
        (keyActive(keys, "KeyW") || keyActive(keys, "ArrowUp") ? 1 : 0)
        - (keyActive(keys, "KeyS") || keyActive(keys, "ArrowDown") ? 1 : 0)
    );
    const rightInput = (
        (keyActive(keys, "KeyD") || keyActive(keys, "ArrowRight") ? 1 : 0)
        - (keyActive(keys, "KeyA") || keyActive(keys, "ArrowLeft") ? 1 : 0)
    );
    const forwardAngle = cameraYaw + Math.PI;
    const forward = new BABYLON.Vector3(
        Math.sin(forwardAngle),
        0,
        Math.cos(forwardAngle),
    );
    const right = new BABYLON.Vector3(
        Math.sin(forwardAngle + Math.PI / 2),
        0,
        Math.cos(forwardAngle + Math.PI / 2),
    );
    const movement = forward.scale(forwardInput).add(right.scale(rightInput));
    if (movement.lengthSquared() > 1) movement.normalize();
    if (Math.abs(movement.x) < 1e-12) movement.x = 0;
    if (Math.abs(movement.z) < 1e-12) movement.z = 0;
    return movement;
}

export function targetRelativeMovement(keys, targetYaw) {
    const forwardInput = (
        (keyActive(keys, "KeyW") || keyActive(keys, "ArrowUp") ? 1 : 0)
        - (keyActive(keys, "KeyS") || keyActive(keys, "ArrowDown") ? 1 : 0)
    );
    const rightInput = (
        (keyActive(keys, "KeyD") || keyActive(keys, "ArrowRight") ? 1 : 0)
        - (keyActive(keys, "KeyA") || keyActive(keys, "ArrowLeft") ? 1 : 0)
    );
    const forward = new BABYLON.Vector3(
        Math.sin(targetYaw),
        0,
        Math.cos(targetYaw),
    );
    const right = new BABYLON.Vector3(
        Math.cos(targetYaw),
        0,
        -Math.sin(targetYaw),
    );
    const movement = forward.scale(forwardInput).add(right.scale(rightInput));
    if (movement.lengthSquared() > 1) movement.normalize();
    if (Math.abs(movement.x) < 1e-12) movement.x = 0;
    if (Math.abs(movement.z) < 1e-12) movement.z = 0;
    return movement;
}

export function targetRelativeMovementDirection(keys, touchInput = null) {
    const forwardInput = touchInput
        ? touchInput.y
        : (
            (keyActive(keys, "KeyW") || keyActive(keys, "ArrowUp") ? 1 : 0)
            - (keyActive(keys, "KeyS") || keyActive(keys, "ArrowDown") ? 1 : 0)
        );
    const rightInput = touchInput
        ? touchInput.x
        : (
            (keyActive(keys, "KeyD") || keyActive(keys, "ArrowRight") ? 1 : 0)
            - (keyActive(keys, "KeyA") || keyActive(keys, "ArrowLeft") ? 1 : 0)
        );
    if (Math.abs(forwardInput) >= Math.abs(rightInput)) {
        if (forwardInput > 0) return "forward";
        if (forwardInput < 0) return "backward";
    }
    if (rightInput > 0) return "right";
    if (rightInput < 0) return "left";
    return null;
}

export function firstPersonMovement(keys, cameraYaw) {
    const forwardInput = (
        (keyActive(keys, "KeyW") || keyActive(keys, "ArrowUp") ? 1 : 0)
        - (keyActive(keys, "KeyS") || keyActive(keys, "ArrowDown") ? 1 : 0)
    );
    if (forwardInput === 0) return BABYLON.Vector3.Zero();
    const forwardAngle = cameraYaw + Math.PI;
    return new BABYLON.Vector3(
        Math.sin(forwardAngle) * forwardInput,
        0,
        Math.cos(forwardAngle) * forwardInput,
    );
}

export function firstPersonTurnInput(keys) {
    return (
        (keyActive(keys, "KeyD") || keyActive(keys, "ArrowRight") ? 1 : 0)
        - (keyActive(keys, "KeyA") || keyActive(keys, "ArrowLeft") ? 1 : 0)
    );
}

export function keyboardForwardActive(keys) {
    return (
        keyActive(keys, "KeyW")
        || keyActive(keys, "ArrowUp")
    );
}

export function keyboardBackwardActive(keys) {
    return (
        keyActive(keys, "KeyS")
        || keyActive(keys, "ArrowDown")
    );
}

export function keyboardMovementSpeedMultiplier(keys, options = {}) {
    if (keyboardForwardActive(keys)) return 1;
    if (keyboardBackwardActive(keys)) {
        return options.backwardSpeedMultiplier
            ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.backwardSpeedMultiplier;
    }
    const lateral = (
        keyActive(keys, "KeyA")
        || keyActive(keys, "ArrowLeft")
        || keyActive(keys, "KeyD")
        || keyActive(keys, "ArrowRight")
    );
    return lateral
        ? (
            options.lateralSpeedMultiplier
            ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.lateralSpeedMultiplier
        )
        : 1;
}

export function movementKeysWithAutoRun(keys, autoRun) {
    if (!autoRun) return keys;
    const movementKeys = new Set(keys);
    movementKeys.add("KeyW");
    return movementKeys;
}

export function movementKeysForController(keys, autoRun, movementLocked) {
    return movementLocked
        ? new Set()
        : movementKeysWithAutoRun(keys, autoRun);
}

export function actorYawForMovement(
    movement,
    cameraYaw,
    firstPerson = false,
    backpedaling = false,
    backpedalTurnInput = 0,
    backpedalTurnAngle = (
        DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.backpedalTurnAngle
    ),
) {
    if (firstPerson) return cameraYaw + Math.PI;
    if (backpedaling) {
        return (
            cameraYaw
            + Math.PI
            + backpedalTurnInput * backpedalTurnAngle
        );
    }
    return Math.atan2(movement.x, movement.z);
}

export function shortestAngleDelta(from, to) {
    let delta = to - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
}

export function actorTurningSince(
    previousYaw,
    currentYaw,
    firstPerson,
    epsilon = 1e-5,
) {
    return Boolean(firstPerson)
        && Math.abs(shortestAngleDelta(previousYaw, currentYaw)) > epsilon;
}

export function boundedTerrainRayOrigin(
    requestedOriginY,
    maximumTerrainHeight,
    clearance = 1e-4,
) {
    return Number.isFinite(maximumTerrainHeight)
        ? Math.min(requestedOriginY, maximumTerrainHeight + clearance)
        : requestedOriginY;
}

export function orbitYaw(cameraYaw, dragDeltaYaw) {
    return cameraYaw + dragDeltaYaw;
}

export function orbitPitch(cameraPitch, dragDeltaPitch, minPitch, maxPitch) {
    return Math.max(
        minPitch,
        Math.min(maxPitch, cameraPitch + dragDeltaPitch),
    );
}

export function cameraZoomState(
    cameraDistance,
    firstPerson,
    wheelDeltaY,
    options = {},
    thirdPersonDistance = null,
) {
    const minimum = options.cameraMinDistance
        ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.cameraMinDistance;
    const maximum = options.cameraMaxDistance
        ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.cameraMaxDistance;
    const step = options.cameraZoomStep
        ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.cameraZoomStep;
    const firstPersonEnabled = options.firstPersonEnabled
        ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.firstPersonEnabled;
    const direction = Math.sign(wheelDeltaY);

    if (direction === 0) {
        return { cameraDistance, firstPerson };
    }
    if (firstPerson) {
        if (direction < 0) return { cameraDistance: minimum, firstPerson };
        return {
            cameraDistance: Number.isFinite(thirdPersonDistance)
                ? Math.max(minimum, Math.min(maximum, thirdPersonDistance))
                : Math.min(maximum, minimum + step),
            firstPerson: false,
        };
    }
    if (
        firstPersonEnabled
        && direction < 0
        && cameraDistance <= minimum + 1e-9
    ) {
        return { cameraDistance: minimum, firstPerson: true };
    }
    return {
        cameraDistance: Math.max(
            minimum,
            Math.min(maximum, cameraDistance + direction * step),
        ),
        firstPerson: false,
    };
}

export function toggledCameraModeState(
    cameraDistance,
    firstPerson,
    options = {},
    thirdPersonDistance = null,
) {
    const minimum = options.cameraMinDistance
        ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.cameraMinDistance;
    const maximum = options.cameraMaxDistance
        ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.cameraMaxDistance;
    const step = options.cameraZoomStep
        ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.cameraZoomStep;
    const firstPersonEnabled = options.firstPersonEnabled
        ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.firstPersonEnabled;
    if (!firstPersonEnabled) return { cameraDistance, firstPerson: false };
    return firstPerson
        ? {
            cameraDistance: Number.isFinite(thirdPersonDistance)
                ? Math.max(minimum, Math.min(maximum, thirdPersonDistance))
                : Math.min(maximum, minimum + step),
            firstPerson: false,
        }
        : {
            cameraDistance: minimum,
            firstPerson: true,
        };
}

export function trailCameraYaw(
    cameraYaw,
    actorYaw,
    trailSpeed,
    deltaSeconds,
) {
    const behindActor = actorYaw + Math.PI;
    return cameraYaw + shortestAngleDelta(cameraYaw, behindActor)
        * Math.min(1, Math.max(0, trailSpeed * deltaSeconds));
}

export function terrainTransitionAllowed(currentY, terrainSample, options = {}) {
    if (!terrainSample || !Number.isFinite(terrainSample.height)) return false;
    const maxStepUp = options.maxStepUp
        ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.maxStepUp;
    const maxDrop = options.maxDrop
        ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.maxDrop;
    const maxSlopeDegrees = options.maxSlopeDegrees
        ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.maxSlopeDegrees;
    const heightDelta = terrainSample.height - currentY;
    const normalY = Math.max(-1, Math.min(1, terrainSample.normal?.y ?? 1));
    const slopeDegrees = Math.acos(normalY) * 180 / Math.PI;
    return heightDelta <= maxStepUp
        && heightDelta >= -maxDrop
        && slopeDegrees <= maxSlopeDegrees;
}

export function nearestWalkableRaySurface(
    hits,
    currentY,
    options = {},
    { maxDrop = null } = {},
) {
    const allowedDrop = maxDrop
        ?? options.maxDrop
        ?? DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.maxDrop;
    const candidates = [];
    for (const hit of hits || []) {
        if (!hit?.hit || !hit.pickedPoint) continue;
        // Grounding is a geometry query, so use the picked triangle's face
        // normal rather than its interpolated vertex normals. MT5 stair
        // treads share smoothed render normals with their vertical risers;
        // near an edge that can make a flat tread appear steeper than the
        // controller's slope limit and incorrectly turn it into a hole.
        const normal = (
            hit.getNormal?.(true, false) || BABYLON.Vector3.Up()
        ).normalize();
        const surface = {
            height: hit.pickedPoint.y,
            normal,
            mesh: hit.pickedMesh,
        };
        if (!terrainTransitionAllowed(currentY, surface, {
            ...options,
            maxDrop: allowedDrop,
        })) {
            continue;
        }
        candidates.push({
            distance: Number.isFinite(hit.distance)
                ? hit.distance
                : Number.POSITIVE_INFINITY,
            surface,
        });
    }
    candidates.sort((left, right) => left.distance - right.distance);
    return candidates[0]?.surface || null;
}

export function constrainCollisionDisplacement(actual, requested) {
    const result = actual.clone();
    for (const axis of ["x", "y", "z"]) {
        const requestedAxis = requested[axis];
        const actualAxis = actual[axis];
        if (
            Math.abs(requestedAxis) < 1e-12
            || Math.sign(actualAxis) !== Math.sign(requestedAxis)
        ) {
            result[axis] = 0;
            continue;
        }
        result[axis] = Math.sign(requestedAxis) * Math.min(
            Math.abs(actualAxis),
            Math.abs(requestedAxis),
        );
    }
    return result;
}

function pointSegmentDistanceSquared2d(point, start, end) {
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared <= 1e-12) {
        return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
    }
    const amount = Math.max(0, Math.min(1, (
        (point[0] - start[0]) * dx + (point[1] - start[1]) * dz
    ) / lengthSquared));
    const nearestX = start[0] + dx * amount;
    const nearestZ = start[1] + dz * amount;
    return (point[0] - nearestX) ** 2 + (point[1] - nearestZ) ** 2;
}

function orientation2d(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1])
        - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentDistanceSquared2d(a, b, c, d) {
    const abC = orientation2d(a, b, c);
    const abD = orientation2d(a, b, d);
    const cdA = orientation2d(c, d, a);
    const cdB = orientation2d(c, d, b);
    if (
        ((abC <= 0 && abD >= 0) || (abD <= 0 && abC >= 0))
        && ((cdA <= 0 && cdB >= 0) || (cdB <= 0 && cdA >= 0))
    ) {
        return 0;
    }
    return Math.min(
        pointSegmentDistanceSquared2d(a, c, d),
        pointSegmentDistanceSquared2d(b, c, d),
        pointSegmentDistanceSquared2d(c, a, b),
        pointSegmentDistanceSquared2d(d, a, b),
    );
}

const NATIVE_COLLISION_PLAYER_HEIGHT = 2;
const NATIVE_COLLISION_VERTICAL_EPSILON = 0.05;

function activeNativeCollisionSegments(
    meshes,
    lowerY = null,
    upperY = null,
) {
    const segments = [];
    for (const mesh of meshes || []) {
        if (
            !mesh?.checkCollisions
            || !mesh.isEnabled?.()
            || !mesh.metadata?.nativeCollision
        ) continue;
        const offsetX = Number(mesh.position?.x) || 0;
        const offsetY = Number(mesh.position?.y) || 0;
        const offsetZ = Number(mesh.position?.z) || 0;
        for (const [index, segment] of (
            mesh.metadata.nativeCollisionSegments || []
        ).entries()) {
            const yRange = mesh.metadata.nativeCollisionSegmentYRanges?.[index];
            if (
                Number.isFinite(lowerY)
                && Number.isFinite(upperY)
                && yRange
                && (
                    yRange[1] + offsetY < lowerY
                    || yRange[0] + offsetY > upperY
                )
            ) continue;
            segments.push([
                [segment[0][0] + offsetX, segment[0][1] + offsetZ],
                [segment[1][0] + offsetX, segment[1][1] + offsetZ],
            ]);
        }
    }
    return segments;
}

export function nativeCollisionPositionClear(
    meshes,
    position,
    playerRadius,
    margin = 0,
) {
    const point = [position.x, position.z];
    const clearanceSquared = Math.max(0, playerRadius + margin) ** 2;
    const lowerY = Number.isFinite(position.y)
        ? position.y - NATIVE_COLLISION_VERTICAL_EPSILON
        : null;
    const upperY = Number.isFinite(position.y)
        ? position.y + NATIVE_COLLISION_PLAYER_HEIGHT
            + NATIVE_COLLISION_VERTICAL_EPSILON
        : null;
    return activeNativeCollisionSegments(meshes, lowerY, upperY)
        .every((segment) => (
            pointSegmentDistanceSquared2d(point, ...segment)
                >= clearanceSquared
        ));
}

export function nativeCollisionRecoveryPathClear(
    meshes,
    startPosition,
    endPosition,
    playerRadius,
    margin = 0,
    epsilon = 1e-4,
) {
    const start = [startPosition.x, startPosition.z];
    const end = [endPosition.x, endPosition.z];
    const clearance = Math.max(0, playerRadius + margin);
    const finiteHeights = [startPosition.y, endPosition.y]
        .filter(Number.isFinite);
    const lowerY = finiteHeights.length > 0
        ? Math.min(...finiteHeights) - NATIVE_COLLISION_VERTICAL_EPSILON
        : null;
    const upperY = finiteHeights.length > 0
        ? Math.max(...finiteHeights) + NATIVE_COLLISION_PLAYER_HEIGHT
            + NATIVE_COLLISION_VERTICAL_EPSILON
        : null;
    const segments = activeNativeCollisionSegments(meshes, lowerY, upperY);
    const contacts = new Set();

    for (const segment of segments) {
        if (
            pointSegmentDistanceSquared2d(start, ...segment)
            < Math.max(0, clearance - epsilon) ** 2
        ) contacts.add(segment);
        if (
            pointSegmentDistanceSquared2d(end, ...segment)
            < clearance ** 2
        ) return false;
    }

    // A recovery may leave boundaries already intersecting the player, but it
    // may not tunnel through any other authored boundary on the way out.
    const sweptClearanceSquared = Math.max(0, clearance - epsilon) ** 2;
    return segments.every((segment) => {
        const sweptDistanceSquared = segmentDistanceSquared2d(
            start,
            end,
            ...segment,
        );
        if (contacts.has(segment)) {
            // The path may begin within the player's radial clearance, but
            // its center may never cross the contacted boundary itself.
            return sweptDistanceSquared > epsilon ** 2;
        }
        return sweptDistanceSquared >= sweptClearanceSquared;
    });
}

export function nativeCollisionDisplacementAllowed(
    meshes,
    position,
    displacement,
    playerRadius,
    epsilon = 1e-4,
) {
    const start = [position.x, position.z];
    const end = [
        position.x + displacement.x,
        position.z + displacement.z,
    ];
    const lowerY = Number.isFinite(position.y)
        ? position.y - NATIVE_COLLISION_VERTICAL_EPSILON
        : null;
    const upperY = Number.isFinite(position.y)
        ? position.y + NATIVE_COLLISION_PLAYER_HEIGHT
            + NATIVE_COLLISION_VERTICAL_EPSILON
        : null;
    const segments = activeNativeCollisionSegments(meshes, lowerY, upperY);
    const clearanceSquared = Math.max(0, playerRadius - epsilon) ** 2;
    const penetrating = segments.some((segment) => (
        pointSegmentDistanceSquared2d(start, ...segment) < clearanceSquared
    ));
    if (penetrating) {
        return nativeCollisionEscapeAllowed(
            meshes,
            position,
            displacement,
            playerRadius,
            epsilon,
        );
    }
    return segments.every((segment) => (
        segmentDistanceSquared2d(start, end, ...segment)
        >= clearanceSquared
    ));
}

export function nativeCollisionEscapeAllowed(
    meshes,
    position,
    displacement,
    playerRadius,
    epsilon = 1e-4,
) {
    const start = [position.x, position.z];
    const end = [
        position.x + displacement.x,
        position.z + displacement.z,
    ];
    const radius = Math.max(0, playerRadius);
    const contacts = [];
    const otherSegments = [];

    const lowerY = Number.isFinite(position.y)
        ? position.y - NATIVE_COLLISION_VERTICAL_EPSILON
        : null;
    const upperY = Number.isFinite(position.y)
        ? position.y + NATIVE_COLLISION_PLAYER_HEIGHT
            + NATIVE_COLLISION_VERTICAL_EPSILON
        : null;
    for (const adjusted of activeNativeCollisionSegments(
        meshes,
        lowerY,
        upperY,
    )) {
        const startDistance = Math.sqrt(
            pointSegmentDistanceSquared2d(start, ...adjusted),
        );
        if (startDistance < radius - epsilon) {
            contacts.push({ segment: adjusted, startDistance });
        } else {
            otherSegments.push(adjusted);
        }
    }
    if (contacts.length === 0) return false;

    // Every surface currently penetrating the player's cylinder must become
    // farther away. This permits escape from a wall or corner, but never
    // movement deeper into one of the active contacts.
    if (contacts.some(({ segment, startDistance }) => (
        Math.sqrt(pointSegmentDistanceSquared2d(end, ...segment))
        <= startDistance + epsilon
        || segmentDistanceSquared2d(start, end, ...segment) <= epsilon ** 2
    ))) {
        return false;
    }

    // The swept cylinder must not encounter a different authored boundary
    // while escaping. This is what makes the recovery safe at corners and in
    // narrow passages rather than simply turning collision off for a frame.
    const minimumClearanceSquared = Math.max(0, radius - epsilon) ** 2;
    return otherSegments.every((segment) => (
        segmentDistanceSquared2d(start, end, ...segment)
        >= minimumClearanceSquared
    ));
}

export function exponentialResponse(response, deltaSeconds) {
    return 1 - Math.exp(-Math.max(0, response) * Math.max(0, deltaSeconds));
}

export function normalizedTouchInput(x, y, deadZone = 0.1) {
    const rawX = Number.isFinite(x) ? x : 0;
    const rawY = Number.isFinite(y) ? y : 0;
    const rawMagnitude = Math.hypot(rawX, rawY);
    if (rawMagnitude <= Math.max(0, deadZone)) {
        return { x: 0, y: 0, magnitude: 0 };
    }
    const magnitude = Math.min(1, rawMagnitude);
    const scale = magnitude / rawMagnitude;
    return {
        x: rawX * scale,
        y: rawY * scale,
        magnitude,
    };
}

export function defaultTerrainPredicate(mesh) {
    return Boolean(
        mesh?.isPickable
        && mesh.isEnabled()
        && mesh.metadata?.terrain === true,
    );
}

function belongsToCameraIgnoredActor(mesh) {
    for (let node = mesh; node; node = node.parent) {
        const metadata = node.metadata;
        if (
            metadata?.cameraBlocker === false
            || metadata?.scheduledActor
            || metadata?.scheduledActorInstanceId
            || metadata?.scheduledActorDebugSelectionProxy
            || metadata?.scheduledActorOcclusionProxy
        ) {
            return true;
        }
    }
    return false;
}

export function defaultCameraBlockerPredicate(mesh) {
    return Boolean(
        mesh?.isPickable
        && mesh.isEnabled()
        // Include attached click/occlusion boxes in the rejection. Some of
        // those proxies carry their own metadata instead of the NPC's.
        && !belongsToCameraIgnoredActor(mesh)
        && (
            mesh.metadata?.cameraBlocker === true
            || mesh.metadata?.terrain === true
            || mesh.checkCollisions
        ),
    );
}

export function defaultStepSurfacePredicate(mesh) {
    return Boolean(
        mesh?.isPickable
        && mesh.isEnabled()
        && !mesh.metadata?.controllerCollider
        && !mesh.metadata?.collisionDebug
        && (
            mesh.metadata?.terrain === true
            || mesh.checkCollisions
        ),
    );
}
