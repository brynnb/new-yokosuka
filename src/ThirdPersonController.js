import * as BABYLON from "@babylonjs/core";
import {
    DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS,
    actorTurningSince,
    actorYawForMovement,
    boundedTerrainRayOrigin,
    cameraRelativeMovement,
    cameraZoomState,
    constrainCollisionDisplacement,
    controllerMovementSpeed,
    defaultCameraBlockerPredicate,
    defaultStepSurfacePredicate,
    defaultTerrainPredicate,
    exponentialResponse,
    firstPersonMovement,
    firstPersonTurnInput,
    hasCommandModifier,
    keyboardBackwardActive,
    keyboardForwardActive,
    movementKeysForController,
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
    terrainTransitionAllowed,
    trailCameraYaw,
} from "./ThirdPersonControllerRules.js";
import {
    resolveCameraPosition as resolveThirdPersonCameraPosition,
    updateControllerCamera,
} from "./ThirdPersonCamera.js";

// Shenmue collision boundaries and some extracted visual meshes contain
// opposite-winding copies of the same face. Have Babylon choose the face
// opposing movement so its separation epsilon cannot pull the actor into the
// wall when the other copy is encountered.
BABYLON.Collider.DoubleSidedCheck = true;

export * from "./ThirdPersonControllerRules.js";

export class ThirdPersonController {
    constructor(scene, camera, actorRoot, options = {}) {
        if (!scene || !camera || !actorRoot) {
            throw new Error(
                "ThirdPersonController requires a scene, camera, and actor root.",
            );
        }
        this.scene = scene;
        this.camera = camera;
        this.actorRoot = actorRoot;
        this.options = {
            ...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS,
            ...options,
        };
        this.terrainPredicate = options.terrainPredicate
            || defaultTerrainPredicate;
        this.cameraBlockerPredicate = options.cameraBlockerPredicate
            || defaultCameraBlockerPredicate;
        this.stepSurfacePredicate = options.stepSurfacePredicate
            || defaultStepSurfacePredicate;
        this.raycastIndex = options.raycastIndex || null;
        this.keys = new Set();
        this.cameraYaw = actorRoot.rotation.y + Math.PI;
        this.lastActorYaw = actorRoot.rotation.y;
        this.stationaryTurnRemainingSeconds = 0;
        this.stationaryTurnDirection = 0;
        this.cameraPitch = this.options.cameraPitch;
        this.cameraDistance = this.options.cameraDistance;
        this.thirdPersonCameraDistance = this.cameraDistance;
        this.cameraResolvedDistance = this.cameraDistance;
        this.firstPerson = false;
        this.cameraTarget = actorRoot.position.add(
            new BABYLON.Vector3(0, this.options.cameraTargetHeight, 0),
        );
        this.pointerLocked = false;
        this.rightMouseDown = false;
        this.touchLookPointerId = null;
        this.touchLookLastX = 0;
        this.touchLookLastY = 0;
        this.touchPointers = new Map();
        this.touchPinchDistance = null;
        this.touchPinchAccumulator = 0;
        this.noClip = false;
        this.airborne = false;
        this.verticalVelocity = 0;
        this.runToggled = false;
        this.autoRun = false;
        this.movementLocked = false;
        this.touchInput = { x: 0, y: 0, magnitude: 0 };
        this.touchRunning = false;
        this.gamepadLookActive = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.disposed = false;
        this.listeners = [];
        this.safePositionHistory = [];
        this.safePositionSampleSeconds = 0;

        this.scene.collisionsEnabled = true;
        this.collider = BABYLON.MeshBuilder.CreateCylinder(
            `${actorRoot.name || "actor"}_controller_collider`,
            {
                diameter: this.options.playerRadius * 2,
                height: this.options.playerHeight,
                tessellation: 16,
            },
            scene,
        );
        this.collider.isVisible = false;
        this.collider.isPickable = false;
        this.collider.checkCollisions = true;
        this.collider.metadata = {
            ...(this.collider.metadata || {}),
            controllerCollider: true,
            controllerColliderShape: "cylinder",
        };
        this.collider.ellipsoid.set(
            this.options.playerRadius,
            this.options.playerHeight / 2,
            this.options.playerRadius,
        );
        this.collider.ellipsoidOffset.set(
            0,
            this.options.playerHeight / 2,
            0,
        );
        this.collider.position.copyFrom(actorRoot.position);

        this.camera.inputs.clear();
        this.camera.detachControl();

        this.bindInputs();
        this.snapToTerrain(true);
        this.recordSafePosition(0, true);
        this.updateCamera(1);
    }

    listen(target, event, handler, options) {
        target?.addEventListener?.(event, handler, options);
        this.listeners.push(() => (
            target?.removeEventListener?.(event, handler, options)
        ));
    }

    bindingMatches(code, action) {
        const binding = this.options.getKeyBinding?.(action);
        if (!binding) return false;
        if (binding === "ShiftLeft") {
            return code === "ShiftLeft" || code === "ShiftRight";
        }
        return code === binding;
    }

    canonicalInputCode(code) {
        const bindings = [
            ["moveForward", "KeyW"],
            ["moveLeft", "KeyA"],
            ["moveBackward", "KeyS"],
            ["moveRight", "KeyD"],
            ["run", "ShiftLeft"],
        ];
        if (this.options.inputContext === "forklift") {
            bindings.push(
                ["cameraMode", "KeyR"],
                ["forkliftLower", "KeyF"],
                ["forkliftRaise", "KeyE"],
                ["forkliftHorn", "KeyH"],
            );
        } else {
            bindings.push(
                ["autoRun", "KeyQ"],
                ["noClip", "KeyZ"],
                ["cameraMode", "KeyR"],
            );
        }
        const rebound = bindings.find(
            ([action]) => this.bindingMatches(code, action),
        );
        if (rebound) return rebound[1];

        // Once an action has been rebound, its former physical key must stop
        // producing the canonical command. Arrow keys remain independent
        // movement aliases because they are not configurable bindings.
        const formerDefault = bindings.find(([action, canonicalCode]) => (
            Boolean(this.options.getKeyBinding?.(action))
            && (
                code === canonicalCode
                || (canonicalCode === "ShiftLeft" && code === "ShiftRight")
            )
        ));
        return formerDefault ? null : code;
    }

    bindInputs() {
        const canvas = this.scene.getEngine().getRenderingCanvas();
        this.listen(window, "keydown", (event) => {
            const tag = event.target?.tagName;
            if (
                tag === "INPUT"
                || tag === "TEXTAREA"
                || tag === "SELECT"
                || tag === "BUTTON"
            ) return;
            // Browser and OS commands must take precedence over gameplay keys.
            // In particular, Ctrl/Cmd+R should refresh without toggling the
            // first-person camera or being captured as movement input.
            if (hasCommandModifier(event)) return;
            const code = this.canonicalInputCode(event.code);
            if (!code) return;
            if (
                this.options.runEnabled !== false
                &&
                this.options.toggleRun
                && code === "ShiftLeft"
                && !event.repeat
            ) {
                this.toggleRun();
            }
            if (
                this.options.toggleNoClipKey
                && code === this.options.toggleNoClipKey
                && !event.repeat
            ) {
                this.setNoClip(!this.noClip);
            }
            if (
                this.options.toggleFirstPersonKey
                && code === this.options.toggleFirstPersonKey
                && !event.repeat
            ) {
                this.setFirstPerson(!this.firstPerson, {
                    resetThirdPersonView:
                        this.options.resetThirdPersonViewOnFirstPersonExit,
                });
                event.preventDefault();
            }
            if (
                this.options.toggleAutoRunKey
                && code === this.options.toggleAutoRunKey
                && !event.repeat
            ) {
                this.autoRun = !this.autoRun;
                event.preventDefault();
            }
            if (
                this.autoRun
                && [
                    "KeyW",
                    "ArrowUp",
                    "KeyS",
                    "ArrowDown",
                ].includes(code)
            ) {
                this.autoRun = false;
            }
            this.keys.add(code);
            if (
                code !== event.code
                ||
                code.startsWith("Arrow")
                || [
                    "KeyW",
                    "KeyA",
                    "KeyS",
                    "KeyD",
                    "Space",
                    this.options.toggleAutoRunKey,
                ].includes(code)
            ) {
                event.preventDefault();
            }
        });
        this.listen(window, "keyup", (event) => {
            const code = this.canonicalInputCode(event.code);
            if (code) this.keys.delete(code);
        });
        this.listen(window, "blur", () => {
            this.keys.clear();
            this.autoRun = false;
            this.touchLookPointerId = null;
            this.touchPointers.clear();
            this.touchPinchDistance = null;
            this.touchPinchAccumulator = 0;
        });
        this.listen(canvas, "wheel", (event) => {
            event.preventDefault();
            this.applyCameraZoom(event.deltaY);
        }, { passive: false });
        this.listen(canvas, "contextmenu", (event) => event.preventDefault());
        this.listen(canvas, "pointerdown", (event) => {
            if (event.pointerType === "touch") {
                this.touchPointers.set(event.pointerId, {
                    x: event.clientX,
                    y: event.clientY,
                });
                canvas.setPointerCapture?.(event.pointerId);
                if (this.touchPointers.size === 1) {
                    this.touchLookPointerId = event.pointerId;
                    this.touchLookLastX = event.clientX;
                    this.touchLookLastY = event.clientY;
                    this.touchPinchDistance = null;
                    this.touchPinchAccumulator = 0;
                } else {
                    this.touchLookPointerId = null;
                    const [first, second] = [...this.touchPointers.values()];
                    this.touchPinchDistance = Math.hypot(
                        second.x - first.x,
                        second.y - first.y,
                    );
                    this.touchPinchAccumulator = 0;
                }
                event.preventDefault();
                return;
            }
            if (event.button === 2) {
                this.rightMouseDown = true;
                this.lastMouseX = event.clientX;
                this.lastMouseY = event.clientY;
                event.preventDefault();
                return;
            }
            if (
                event.button === 0
                && this.options.requestPointerLockOnClick
                && document.pointerLockElement !== canvas
            ) {
                canvas.requestPointerLock?.();
            }
        });
        this.listen(document, "pointerup", (event) => {
            if (event.button === 2) this.rightMouseDown = false;
            if (this.touchPointers.has(event.pointerId)) {
                this.touchPointers.delete(event.pointerId);
                if (canvas.hasPointerCapture?.(event.pointerId)) {
                    canvas.releasePointerCapture(event.pointerId);
                }
                if (this.touchPointers.size === 1) {
                    const [[pointerId, point]] = this.touchPointers;
                    this.touchLookPointerId = pointerId;
                    this.touchLookLastX = point.x;
                    this.touchLookLastY = point.y;
                } else {
                    this.touchLookPointerId = null;
                }
                this.touchPinchDistance = null;
                this.touchPinchAccumulator = 0;
            }
        }, true);
        this.listen(document, "pointercancel", (event) => {
            if (this.touchPointers.has(event.pointerId)) {
                this.touchPointers.delete(event.pointerId);
                if (this.touchPointers.size === 1) {
                    const [[pointerId, point]] = this.touchPointers;
                    this.touchLookPointerId = pointerId;
                    this.touchLookLastX = point.x;
                    this.touchLookLastY = point.y;
                } else {
                    this.touchLookPointerId = null;
                }
                this.touchPinchDistance = null;
                this.touchPinchAccumulator = 0;
            }
        }, true);
        this.listen(document, "pointermove", (event) => {
            if (this.touchPointers.has(event.pointerId)) {
                this.touchPointers.set(event.pointerId, {
                    x: event.clientX,
                    y: event.clientY,
                });
                if (this.touchPointers.size >= 2) {
                    const [first, second] = [...this.touchPointers.values()];
                    const distance = Math.hypot(
                        second.x - first.x,
                        second.y - first.y,
                    );
                    if (Number.isFinite(this.touchPinchDistance)) {
                        this.touchPinchAccumulator += (
                            this.touchPinchDistance - distance
                        );
                    }
                    this.touchPinchDistance = distance;
                    const threshold = Math.max(
                        1,
                        this.options.touchPinchStepPixels,
                    );
                    while (
                        Math.abs(this.touchPinchAccumulator) >= threshold
                    ) {
                        const direction = Math.sign(
                            this.touchPinchAccumulator,
                        );
                        this.applyCameraZoom(direction);
                        this.touchPinchAccumulator -= direction * threshold;
                    }
                    event.preventDefault();
                    return;
                }
            }
            if (event.pointerId === this.touchLookPointerId) {
                const deltaX = event.clientX - this.touchLookLastX;
                const deltaY = event.clientY - this.touchLookLastY;
                this.touchLookLastX = event.clientX;
                this.touchLookLastY = event.clientY;
                this.orbitBy(
                    deltaX * this.options.touchCameraSensitivity,
                    deltaY * this.options.touchCameraSensitivity,
                );
                event.preventDefault();
                return;
            }
            if (this.pointerLocked) {
                this.orbitBy(
                    event.movementX * this.options.cameraSensitivity,
                    event.movementY * this.options.cameraSensitivity,
                );
                return;
            }
            if (!this.rightMouseDown) return;
            const deltaX = event.clientX - this.lastMouseX;
            const deltaY = event.clientY - this.lastMouseY;
            this.lastMouseX = event.clientX;
            this.lastMouseY = event.clientY;
            this.orbitBy(
                deltaX * this.options.cameraSensitivity,
                deltaY * this.options.cameraSensitivity,
            );
        }, true);
        this.listen(document, "pointerlockchange", () => {
            this.pointerLocked = document.pointerLockElement === canvas;
        });
    }

    applyCameraZoom(deltaY) {
        const wasFirstPerson = this.firstPerson;
        const previousDistance = this.cameraDistance;
        const zoom = cameraZoomState(
            this.cameraDistance,
            this.firstPerson,
            deltaY,
            this.options,
            this.thirdPersonCameraDistance,
        );
        this.cameraDistance = zoom.cameraDistance;
        this.firstPerson = zoom.firstPerson;
        if ((wasFirstPerson || this.firstPerson) && !this.movementLocked) {
            this.alignActorToFirstPersonView();
        }
        if (!zoom.firstPerson) {
            this.thirdPersonCameraDistance = zoom.cameraDistance;
        } else if (!wasFirstPerson) {
            this.thirdPersonCameraDistance = previousDistance;
        }
        return zoom;
    }

    orbitBy(deltaYaw, deltaPitch) {
        this.cameraYaw = orbitYaw(this.cameraYaw, deltaYaw);
        if (this.firstPerson && !this.movementLocked) {
            this.alignActorToFirstPersonView();
        }
        this.cameraPitch = orbitPitch(
            this.cameraPitch,
            deltaPitch,
            this.options.cameraMinPitch,
            this.options.cameraMaxPitch,
        );
    }

    pickWalkableSurface(
        ray,
        predicate,
        referenceY,
        { maxDrop = null } = {},
    ) {
        const selectionOptions = { maxDrop };
        const nearest = nearestWalkableRaySurface(
            [this.pickWithRay(ray, predicate)],
            referenceY,
            this.options,
            selectionOptions,
        );
        if (nearest) return nearest;
        return nearestWalkableRaySurface(
            this.multiPickWithRay(ray, predicate),
            referenceY,
            this.options,
            selectionOptions,
        );
    }

    setRaycastIndex(raycastIndex) {
        this.raycastIndex = raycastIndex || null;
    }

    pickWithRay(ray, predicate, fastCheck = false, trianglePredicate = null) {
        if (this.raycastIndex) {
            return this.raycastIndex.pickWithRay(
                ray,
                predicate,
                fastCheck,
                trianglePredicate,
            );
        }
        return this.scene.pickWithRay(
            ray,
            predicate,
            fastCheck,
            trianglePredicate,
        );
    }

    multiPickWithRay(ray, predicate, trianglePredicate = null) {
        if (this.raycastIndex) {
            return this.raycastIndex.multiPickWithRay(
                ray,
                predicate,
                trianglePredicate,
            );
        }
        return this.scene.multiPickWithRay(ray, predicate, trianglePredicate);
    }

    sampleTerrain(x, z, referenceY = this.collider.position.y) {
        // Prefer the nearest walkable collision surface around the actor's
        // feet. This keeps the actor supported by short porches, stairs, and
        // other structural meshes after the initial step-up collision has
        // finished. A short ray is important here: using the broad terrain
        // ray for every surface would allow roofs above the actor to win.
        const supportOriginY = boundedTerrainRayOrigin(
            referenceY
                + this.options.maxStepUp
                + this.options.stepClearance,
            this.options.terrainMaxHeight,
        );
        const supportRay = new BABYLON.Ray(
            new BABYLON.Vector3(x, supportOriginY, z),
            BABYLON.Vector3.Down(),
            this.options.maxStepUp
                + this.options.stepClearance
                + this.options.maxDrop,
        );
        const support = this.pickWalkableSurface(
            supportRay,
            this.stepSurfacePredicate,
            referenceY,
        );
        if (support) {
            return support;
        }

        // The authored terrain-only ray is the fallback for spawning,
        // teleporting, or recovering when there is no nearby support. Inspect
        // every hit rather than accepting the first one: interior ceilings are
        // often encountered before the floor but are not walkable terrain.
        const origin = new BABYLON.Vector3(
            x,
            boundedTerrainRayOrigin(
                referenceY + this.options.terrainRayUp,
                this.options.terrainMaxHeight,
            ),
            z,
        );
        const ray = new BABYLON.Ray(
            origin,
            BABYLON.Vector3.Down(),
            this.options.terrainRayUp + this.options.terrainRayDown,
        );
        return this.pickWalkableSurface(
            ray,
            this.terrainPredicate,
            referenceY,
            // Keep distant terrain visible to falling/void logic while still
            // rejecting ceilings, undersides, steep faces, and floors above
            // the actor's authored step-up allowance.
            { maxDrop: Number.POSITIVE_INFINITY },
        );
    }

    sampleStepSurface(x, z, currentY) {
        const originY = boundedTerrainRayOrigin(
            currentY
                + this.options.maxStepUp
                + this.options.stepClearance,
            this.options.terrainMaxHeight,
        );
        const ray = new BABYLON.Ray(
            new BABYLON.Vector3(x, originY, z),
            BABYLON.Vector3.Down(),
            this.options.maxStepUp
                + this.options.stepClearance
                + this.options.stepProgressEpsilon,
        );
        return this.pickWalkableSurface(
            ray,
            this.stepSurfacePredicate,
            currentY,
            { maxDrop: this.options.stepProgressEpsilon },
        );
    }

    snapToTerrain(force = false) {
        const sample = this.sampleTerrain(
            this.collider.position.x,
            this.collider.position.z,
        );
        if (
            sample
            && (
                force
                || this.noClip
                || terrainTransitionAllowed(
                    this.collider.position.y,
                    sample,
                    this.options,
                )
            )
        ) {
            this.collider.position.y = sample.height;
            this.airborne = false;
            this.verticalVelocity = 0;
        } else if (!this.noClip) {
            this.airborne = true;
        }
        this.actorRoot.position.copyFrom(this.collider.position);
        return sample;
    }

    nativeCollisionPositionClear(position, margin = 0.035) {
        return nativeCollisionPositionClear(
            this.scene?.meshes || [],
            position,
            this.options.playerRadius,
            margin,
        );
    }

    recoveryHeadroomClear(position) {
        if (!this.scene?.pickWithRay) return true;
        const clearance = Math.max(
            0.05,
            this.options.playerHeight - this.options.stepClearance * 2,
        );
        const ray = new BABYLON.Ray(
            new BABYLON.Vector3(
                position.x,
                position.y + this.options.stepClearance * 2,
                position.z,
            ),
            BABYLON.Vector3.Up(),
            clearance,
        );
        const hit = this.pickWithRay(ray, (mesh) => (
            mesh !== this.collider
            && !mesh?.metadata?.controllerCollider
            && !mesh?.metadata?.collisionDebug
            && !mesh?.metadata?.nativeCollision
            && this.stepSurfacePredicate(mesh)
        ));
        return !hit?.hit;
    }

    recoveryCandidateAt(x, z, referenceY, {
        constrainHeight = true,
    } = {}) {
        const horizontal = { x, y: referenceY, z };
        if (!this.nativeCollisionPositionClear(horizontal)) return null;
        const terrain = this.sampleTerrain(x, z, referenceY);
        if (!terrain || !Number.isFinite(terrain.height)) return null;
        if (
            constrainHeight
            && (
                terrain.height > referenceY + this.options.maxStepUp
                || terrain.height < referenceY - this.options.maxDrop
            )
        ) return null;
        const position = new BABYLON.Vector3(x, terrain.height, z);
        return this.recoveryHeadroomClear(position) ? position : null;
    }

    recordSafePosition(deltaSeconds = 0, force = false) {
        if (!Array.isArray(this.safePositionHistory)) {
            this.safePositionHistory = [];
        }
        this.safePositionSampleSeconds = (
            Number(this.safePositionSampleSeconds) || 0
        ) + Math.max(0, deltaSeconds);
        if (!force && this.safePositionSampleSeconds < 0.5) return false;
        this.safePositionSampleSeconds = 0;
        const position = this.collider.position.clone();
        if (
            this.noClip
            || this.airborne
            || !this.nativeCollisionPositionClear(position)
            || !this.recoveryHeadroomClear(position)
        ) return false;
        const previous = this.safePositionHistory.at(-1);
        if (
            previous
            && BABYLON.Vector3.DistanceSquared(previous, position) < 0.01
        ) return false;
        this.safePositionHistory.push(position);
        if (this.safePositionHistory.length > 16) {
            this.safePositionHistory.shift();
        }
        return true;
    }

    applyRecoveryPosition(position) {
        this.keys.clear();
        this.clearTouchMovement();
        this.autoRun = false;
        this.collider.position.copyFrom(position);
        this.collider.computeWorldMatrix(true);
        this.actorRoot.position.copyFrom(position);
        this.airborne = false;
        this.verticalVelocity = 0;
        this.safePositionHistory.push(position.clone());
        if (this.safePositionHistory.length > 16) {
            this.safePositionHistory.shift();
        }
        this.updateCamera(1);
    }

    recoverFromCollision({ fallbackPosition = null } = {}) {
        const origin = this.collider.position.clone();
        const currentlyClear = this.nativeCollisionPositionClear(origin);
        const latestSafe = this.safePositionHistory.at(-1);
        const preferredAngle = latestSafe
            ? Math.atan2(latestSafe.z - origin.z, latestSafe.x - origin.x)
            : 0;

        // When the player cylinder intersects an authored boundary, search
        // outwards in tight rings. The first valid ring is the nearest known
        // recovery distance; candidates may leave current contacts but may
        // never tunnel through a different boundary.
        if (!currentlyClear) {
            const radialStep = 0.08;
            const maxDistance = 2.5;
            for (
                let radius = radialStep;
                radius <= maxDistance + 1e-6;
                radius += radialStep
            ) {
                const samples = Math.max(
                    16,
                    Math.ceil((Math.PI * 2 * radius) / radialStep),
                );
                for (let index = 0; index < samples; index += 1) {
                    const alternatingIndex = index === 0
                        ? 0
                        : Math.ceil(index / 2) * (index % 2 ? 1 : -1);
                    const angle = preferredAngle
                        + alternatingIndex * (Math.PI * 2 / samples);
                    const candidate = this.recoveryCandidateAt(
                        origin.x + Math.cos(angle) * radius,
                        origin.z + Math.sin(angle) * radius,
                        origin.y,
                    );
                    if (
                        !candidate
                        || !nativeCollisionRecoveryPathClear(
                            this.scene.meshes,
                            origin,
                            candidate,
                            this.options.playerRadius,
                            0.035,
                        )
                    ) continue;
                    this.applyRecoveryPosition(candidate);
                    return { recovered: true, source: "nearby" };
                }
            }
        }

        // A short history is more reliable than guessing which side of a
        // closed boundary represents playable space. It is reset at every
        // world load, so this cannot send the player to a different map.
        for (let index = this.safePositionHistory.length - 1; index >= 0; index -= 1) {
            const saved = this.safePositionHistory[index];
            if (BABYLON.Vector3.DistanceSquared(saved, origin) < 0.16) continue;
            const candidate = this.recoveryCandidateAt(
                saved.x,
                saved.z,
                saved.y,
                { constrainHeight: false },
            );
            if (!candidate) continue;
            this.applyRecoveryPosition(candidate);
            return { recovered: true, source: "recent-safe" };
        }

        if (fallbackPosition) {
            const candidate = this.recoveryCandidateAt(
                fallbackPosition.x,
                fallbackPosition.z,
                fallbackPosition.y,
                { constrainHeight: false },
            ) || fallbackPosition.clone();
            this.applyRecoveryPosition(candidate);
            this.snapToTerrain(true);
            return { recovered: true, source: "world-spawn" };
        }

        return { recovered: false, source: "none" };
    }

    advanceVertical(deltaSeconds) {
        if (this.noClip || !this.airborne) return null;
        const dt = Math.max(0, Math.min(0.05, deltaSeconds));
        if (dt <= 0) return null;
        const previousY = this.collider.position.y;
        this.verticalVelocity = Math.max(
            this.options.terminalFallSpeed,
            this.verticalVelocity + this.options.gravity * dt,
        );
        const nextY = previousY + this.verticalVelocity * dt;
        const landing = this.sampleTerrain(
            this.collider.position.x,
            this.collider.position.z,
            previousY,
        );
        if (
            landing
            && landing.height <= previousY + this.options.maxStepUp
            && landing.height >= nextY - this.options.stepClearance
            && terrainTransitionAllowed(landing.height, landing, {
                ...this.options,
                maxStepUp: Number.POSITIVE_INFINITY,
                maxDrop: Number.POSITIVE_INFINITY,
            })
        ) {
            this.collider.position.y = landing.height;
            this.verticalVelocity = 0;
            this.airborne = false;
            this.actorRoot.position.copyFrom(this.collider.position);
            return landing;
        }
        this.collider.position.y = nextY;
        this.actorRoot.position.copyFrom(this.collider.position);
        return null;
    }

    moveHorizontal(displacement) {
        if (displacement.lengthSquared() <= 1e-12) {
            return this.sampleTerrain(
                this.collider.position.x,
                this.collider.position.z,
            );
        }
        if (this.noClip) {
            this.collider.position.addInPlace(displacement);
            const terrain = this.sampleTerrain(
                this.collider.position.x,
                this.collider.position.z,
            );
            if (terrain) this.collider.position.y = terrain.height;
            this.airborne = false;
            this.verticalVelocity = 0;
            return terrain;
        }
        const previous = this.collider.position.clone();
        // The controller collider is intentionally invisible, so Babylon does
        // not necessarily refresh its world matrix during active-mesh
        // evaluation. Keep collision queries anchored to the current authored
        // position after spawns, warps, and terrain snaps.
        this.collider.computeWorldMatrix(true);
        this.collider.moveWithCollisions(displacement);
        let collisionDisplacement = constrainCollisionDisplacement(
            this.collider.position.subtract(previous),
            displacement,
        );
        if (!nativeCollisionDisplacementAllowed(
            this.scene.meshes,
            previous,
            collisionDisplacement,
            this.options.playerRadius,
        )) {
            collisionDisplacement.setAll(0);
        }
        this.collider.position.copyFrom(
            previous.add(collisionDisplacement),
        );
        const requestedDistance = Math.hypot(
            displacement.x,
            displacement.z,
        );
        const collisionDistance = Math.hypot(
            collisionDisplacement.x,
            collisionDisplacement.z,
        );
        let escapedPenetration = false;
        if (
            requestedDistance - collisionDistance
            > this.options.stepProgressEpsilon
        ) {
            escapedPenetration = nativeCollisionEscapeAllowed(
                this.scene.meshes,
                previous,
                displacement,
                this.options.playerRadius,
            );
            if (escapedPenetration) {
                collisionDisplacement = displacement.clone();
                this.collider.position.copyFrom(previous.add(displacement));
                this.collider.computeWorldMatrix(true);
            }
        }
        const collidedPosition = this.collider.position.clone();
        if (
            !escapedPenetration
            && requestedDistance - collisionDistance
                > this.options.stepProgressEpsilon
        ) {
            const steppedTerrain = this.tryStepUp(previous, displacement);
            if (steppedTerrain) return steppedTerrain;
            this.collider.position.copyFrom(collidedPosition);
        }
        const terrain = this.sampleTerrain(
            this.collider.position.x,
            this.collider.position.z,
            previous.y,
        );
        if (
            !terrain
            || (
                Number.isFinite(terrain.height)
                && terrain.height < previous.y - this.options.maxDrop
            )
        ) {
            this.collider.position.y = previous.y;
            this.airborne = true;
            return null;
        }
        if (!terrainTransitionAllowed(previous.y, terrain, this.options)) {
            this.collider.position.copyFrom(previous);
            return this.sampleTerrain(previous.x, previous.z, previous.y);
        }
        this.collider.position.y = terrain.height;
        this.airborne = false;
        this.verticalVelocity = 0;
        return terrain;
    }

    tryStepUp(previous, displacement) {
        const targetX = previous.x + displacement.x;
        const targetZ = previous.z + displacement.z;
        const stepSurface = this.sampleStepSurface(
            targetX,
            targetZ,
            previous.y,
        );
        if (!terrainTransitionAllowed(previous.y, stepSurface, {
            ...this.options,
            maxDrop: this.options.stepProgressEpsilon,
        })) {
            this.collider.position.copyFrom(previous);
            return null;
        }
        const stepHeight = stepSurface.height - previous.y;
        if (stepHeight <= this.options.stepProgressEpsilon) {
            this.collider.position.copyFrom(previous);
            return null;
        }

        this.collider.position.copyFrom(previous);
        this.collider.position.y = stepSurface.height
            + this.options.stepClearance;
        this.collider.moveWithCollisions(displacement);
        const steppedDisplacement = constrainCollisionDisplacement(
            this.collider.position.subtract(
                new BABYLON.Vector3(
                    previous.x,
                    this.collider.position.y,
                    previous.z,
                ),
            ),
            displacement,
        );
        const steppedDistance = Math.hypot(
            steppedDisplacement.x,
            steppedDisplacement.z,
        );
        if (
            steppedDistance
            <= this.options.stepProgressEpsilon
        ) {
            this.collider.position.copyFrom(previous);
            return null;
        }

        this.collider.position.x = previous.x + steppedDisplacement.x;
        this.collider.position.z = previous.z + steppedDisplacement.z;
        const landing = this.sampleStepSurface(
            this.collider.position.x,
            this.collider.position.z,
            previous.y,
        );
        if (!terrainTransitionAllowed(previous.y, landing, this.options)) {
            this.collider.position.copyFrom(previous);
            return null;
        }
        this.collider.position.y = landing.height;
        this.airborne = false;
        this.verticalVelocity = 0;
        return landing;
    }

    resolveCameraPosition(target, desired) {
        const resolved = resolveThirdPersonCameraPosition({
            scene: this.scene,
            pickWithRay: (ray, predicate) => this.pickWithRay(ray, predicate),
            blockerPredicate: this.cameraBlockerPredicate,
            options: this.options,
            target,
            desired,
        });
        this.cameraResolvedDistance = resolved.distance;
        return resolved.position;
    }

    updateCamera(deltaSeconds) {
        updateControllerCamera(this, deltaSeconds);
    }

    update(deltaSeconds, {
        lockMovement = false,
        updateCamera = true,
        movementTargetYaw = null,
        actorFacingYaw = null,
        directionalDash = false,
        targetRelativeBackwardMultiplier = 1,
        inputSnapshot = null,
    } = {}) {
        const dt = Math.max(0, Math.min(0.05, deltaSeconds));
        if (this.approach) {
            if (lockMovement) this.cancelApproach(new Error("The player is busy."));
            else return this.updateApproach(dt, updateCamera);
        }
        const movementLocked = this.movementLocked || Boolean(lockMovement);
        const targetRelative = (
            !this.firstPerson && Number.isFinite(movementTargetYaw)
        );
        const keyboardTurn = movementLocked ? 0 : inputSnapshot
            ? inputSnapshot.value("turn")
            : firstPersonTurnInput(this.keys);
        const resolvedMovementInput = inputSnapshot && !movementLocked
            ? normalizedTouchInput(
                inputSnapshot.value("moveX") + (targetRelative ? keyboardTurn : 0),
                inputSnapshot.value("moveY"),
                0,
            )
            : null;
        const touchActive = (
            !movementLocked
            && (resolvedMovementInput || this.touchInput).magnitude > 0
        );
        const movementInput = resolvedMovementInput || this.touchInput;
        const movementKeys = inputSnapshot
            ? new Set()
            : new Set(movementKeysForController(
                this.keys,
                this.autoRun,
                movementLocked,
            ));
        const keyboardForward = inputSnapshot
            ? movementInput.y > this.options.touchDeadZone
            : keyboardForwardActive(movementKeys);
        const backpedaling = (
            !keyboardForward
            && (
                (
                    touchActive
                    && movementInput.y < -this.options.touchDeadZone
                )
                || (
                    !touchActive
                    && keyboardBackwardActive(movementKeys)
                )
            )
        );
        // Keyboard A/D turns during exploration; analog sticks remain directional.
        if (this.firstPerson || (!targetRelative && keyboardTurn !== 0)) {
            const turnInput = Math.max(
                -1,
                Math.min(
                    1,
                    keyboardTurn
                        + (this.firstPerson && touchActive ? movementInput.x : 0),
                ),
            );
            const turnSpeed = keyboardForward
                ? this.options.firstPersonKeyboardTurnSpeed
                : this.options.stationaryKeyboardTurnSpeed;
            this.cameraYaw += turnInput
                * turnSpeed
                * dt;
            if (!movementLocked) this.alignActorToFirstPersonView();
        }
        if (!inputSnapshot && !targetRelative) {
            for (const key of ["KeyA", "KeyD", "ArrowLeft", "ArrowRight"]) {
                movementKeys.delete(key);
            }
        }
        let movement = this.firstPerson
            ? firstPersonMovement(movementKeys, this.cameraYaw)
            : targetRelative
                ? targetRelativeMovement(movementKeys, movementTargetYaw)
                : cameraRelativeMovement(movementKeys, this.cameraYaw);
        if (touchActive) {
            let touchMovement;
            if (this.firstPerson) {
                const forwardAngle = this.cameraYaw + Math.PI;
                touchMovement = new BABYLON.Vector3(
                    Math.sin(forwardAngle) * Math.sign(movementInput.y),
                    0,
                    Math.cos(forwardAngle) * Math.sign(movementInput.y),
                );
            } else {
                const forwardAngle = targetRelative
                    ? movementTargetYaw
                    : this.cameraYaw + Math.PI;
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
                touchMovement = forward.scale(movementInput.y)
                    .add(right.scale(movementInput.x));
                if (touchMovement.lengthSquared() > 0) {
                    touchMovement.normalize();
                }
            }
            movement = movement.add(touchMovement);
            if (movement.lengthSquared() > 1) movement.normalize();
        }
        const moving = movement.lengthSquared() > 1e-10;
        const combatDirection = targetRelative
            ? targetRelativeMovementDirection(
                movementKeys,
                touchActive ? movementInput : null,
            )
            : null;
        const dashHeld = inputSnapshot
            ? inputSnapshot.held("run")
            : (
                this.keys.has("ShiftLeft")
                || this.keys.has("ShiftRight")
            );
        const resolvedContinuousRun = inputSnapshot
            ? this.options.toggleRun
                && inputSnapshot.held("runModifier")
                ? !this.runToggled
                : (
                    inputSnapshot.held("run")
                    || (
                        this.options.toggleRun
                        && this.runToggled
                        && keyboardForward
                    )
                )
            : this.touchRunning;
        const running = this.options.runEnabled !== false
            && moving && (
            directionalDash
                ? (
                    (touchActive && (
                        inputSnapshot ? dashHeld : this.touchRunning
                    ))
                    || (!touchActive && dashHeld)
                )
                : !backpedaling && (
                    (touchActive && resolvedContinuousRun)
                    || (
                        !touchActive && keyboardForward
                        && (
                            this.options.toggleRun
                                ? this.runToggled
                                : dashHeld
                        )
                    )
                )
        );
        const baseSpeed = controllerMovementSpeed(
            running,
            touchActive,
            movementKeys,
            this.options,
        );
        const speed = baseSpeed * (
            combatDirection === "backward"
                ? Math.max(0, targetRelativeBackwardMultiplier)
                : 1
        );
        let terrain = null;
        if (moving) {
            terrain = this.moveHorizontal(movement.scale(speed * dt));
            const targetYaw = Number.isFinite(actorFacingYaw)
                ? actorFacingYaw
                : actorYawForMovement(
                    movement,
                    this.cameraYaw,
                    this.firstPerson,
                    backpedaling,
                    backpedaling ? firstPersonTurnInput(movementKeys) : 0,
                    this.options.backpedalTurnAngle,
                );
            if (Number.isFinite(actorFacingYaw)) {
                this.actorRoot.rotation.y = targetYaw;
            } else {
                this.actorRoot.rotation.y += shortestAngleDelta(
                    this.actorRoot.rotation.y,
                    targetYaw,
                ) * exponentialResponse(this.options.turnResponse, dt);
            }
        } else {
            terrain = this.snapToTerrain();
        }
        const landing = this.advanceVertical(dt);
        if (landing) terrain = landing;
        this.actorRoot.position.copyFrom(this.collider.position);
        this.recordSafePosition(dt);
        const cameraFollowing = moving
            && !this.firstPerson
            && !this.rightMouseDown
            && !this.gamepadLookActive
            && this.touchLookPointerId === null
            && !this.pointerLocked;
        if (cameraFollowing) {
            this.cameraYaw = trailCameraYaw(
                this.cameraYaw,
                this.actorRoot.rotation.y,
                this.options.cameraTrailSpeed,
                dt,
            );
        }
        if (updateCamera) this.updateCamera(dt);
        const actorYawChanged = actorTurningSince(
            this.lastActorYaw,
            this.actorRoot.rotation.y,
            this.firstPerson || (!targetRelative && keyboardTurn !== 0),
        );
        if (actorYawChanged) {
            this.stationaryTurnDirection = Math.sign(shortestAngleDelta(
                this.lastActorYaw,
                this.actorRoot.rotation.y,
            ));
            this.stationaryTurnRemainingSeconds = (
                this.options.stationaryTurnHoldSeconds
            );
        } else {
            this.stationaryTurnRemainingSeconds = Math.max(
                0,
                this.stationaryTurnRemainingSeconds - dt,
            );
        }
        this.lastActorYaw = this.actorRoot.rotation.y;
        const turning = (this.firstPerson || !moving)
            && this.stationaryTurnRemainingSeconds > 0;
        return {
            moving,
            backpedaling,
            turning,
            turnDirection: turning ? this.stationaryTurnDirection : 0,
            running,
            speed: moving ? speed : 0,
            movement,
            terrain,
            pointerLocked: this.pointerLocked,
            cameraFollowing,
            cameraDistance: this.cameraDistance,
            cameraResolvedDistance: this.cameraResolvedDistance,
            firstPerson: this.firstPerson,
            noClip: this.noClip,
            runToggled: this.runToggled,
            autoRun: this.autoRun,
            movementLocked,
            combatDirection,
        };
    }

    approachTo(position, yaw, { signal } = {}) {
        if (![position?.x, position?.y, position?.z, yaw].every(Number.isFinite)) {
            return Promise.reject(new Error("Invalid interaction position."));
        }
        if (signal?.aborted) return Promise.reject(signal.reason);
        this.cancelApproach();
        return new Promise((resolve, reject) => {
            const onAbort = () => this.cancelApproach(signal.reason);
            this.approach = {
                position: position.clone(), yaw, resolve, reject,
                elapsed: 0, stalled: 0,
                cleanup: () => signal?.removeEventListener("abort", onAbort),
            };
            signal?.addEventListener("abort", onAbort, { once: true });
        });
    }

    cancelApproach(error = new DOMException("Interaction cancelled", "AbortError")) {
        const approach = this.approach;
        if (!approach) return;
        this.approach = null;
        approach.cleanup();
        approach.reject(error);
    }

    updateApproach(dt, updateCamera) {
        const approach = this.approach;
        const delta = approach.position.subtract(this.collider.position);
        delta.y = 0;
        const distance = delta.length();
        const arriving = distance <= 0.01;
        const yaw = arriving ? approach.yaw : Math.atan2(delta.x, delta.z);
        const turn = shortestAngleDelta(this.actorRoot.rotation.y, yaw);
        const yawStep = Math.sign(turn) * Math.min(Math.abs(turn), Math.PI * dt);
        this.actorRoot.rotation.y += yawStep;
        const speed = this.options.walkSpeed;
        const walking = !arriving && Math.abs(turn) < Math.PI / 6;
        const before = this.collider.position.clone();
        // Reuse ordinary terrain, step and wall collision checks. Never snap
        // through an obstruction to complete an interaction.
        const terrain = walking
            ? this.moveHorizontal(delta.scale(Math.min(distance, speed * dt) / distance))
            : this.snapToTerrain();
        this.advanceVertical(dt);
        this.actorRoot.position.copyFrom(this.collider.position);
        const travelled = Math.hypot(before.x - this.collider.position.x, before.z - this.collider.position.z);
        approach.elapsed += dt;
        approach.stalled = walking && travelled < speed * dt * 0.1
            ? approach.stalled + dt : 0;
        const finished = arriving && Math.abs(turn) <= Math.PI * dt
            && Math.abs(this.collider.position.y - approach.position.y) < this.options.maxStepUp;
        if (finished) {
            this.actorRoot.rotation.y = approach.yaw;
            this.approach = null;
            approach.cleanup();
            approach.resolve();
        } else if (approach.stalled > 1 || approach.elapsed > 12) {
            this.cancelApproach(new Error("Couldn't reach the interaction point. Move closer and try again."));
        }
        if (this.firstPerson) this.cameraYaw = this.actorRoot.rotation.y + Math.PI;
        this.lastActorYaw = this.actorRoot.rotation.y;
        this.stationaryTurnRemainingSeconds = 0;
        this.recordSafePosition(dt);
        if (updateCamera) this.updateCamera(dt);
        return {
            moving: travelled > 1e-6, running: false, backpedaling: false,
            turning: !walking && Math.abs(yawStep) > 1e-6,
            turnDirection: Math.sign(yawStep), speed: walking ? speed : 0,
            movement: walking ? delta.normalize() : BABYLON.Vector3.Zero(), terrain,
            movementLocked: true, cameraFollowing: false,
            firstPerson: this.firstPerson, noClip: this.noClip,
            pointerLocked: this.pointerLocked, runToggled: this.runToggled, autoRun: false,
        };
    }

    setMovementLocked(locked) {
        this.movementLocked = Boolean(locked);
        if (this.movementLocked) {
            this.autoRun = false;
            this.keys.clear();
            this.clearTouchMovement();
        }
        return this.movementLocked;
    }

    setTouchMovement(x, y, { running = null } = {}) {
        this.touchInput = normalizedTouchInput(
            x,
            y,
            this.options.touchDeadZone,
        );
        if (typeof running === "boolean") {
            this.touchRunning = running;
        } else if (
            this.touchInput.magnitude >= this.options.touchRunThreshold
        ) {
            this.touchRunning = true;
        } else if (
            this.touchInput.magnitude
            <= this.options.touchRunReleaseThreshold
        ) {
            this.touchRunning = false;
        }
        if (this.touchInput.y < -this.options.touchDeadZone) {
            this.autoRun = false;
        }
        return { ...this.touchInput, running: this.touchRunning };
    }

    clearTouchMovement() {
        this.touchInput = { x: 0, y: 0, magnitude: 0 };
        this.touchRunning = false;
    }

    setGamepadLookActive(active) {
        this.gamepadLookActive = Boolean(active);
    }

    captureTravelState() {
        return {
            runToggled: this.runToggled,
            autoRun: this.autoRun,
            noClip: this.noClip,
            firstPerson: this.firstPerson,
            cameraDistance: this.cameraDistance,
            thirdPersonCameraDistance: this.thirdPersonCameraDistance,
            cameraPitch: this.cameraPitch,
        };
    }

    restoreTravelState(snapshot) {
        if (!snapshot) return;
        const minimum = this.options.cameraMinDistance;
        const maximum = this.options.cameraMaxDistance;
        const clampDistance = (value, fallback) => Math.max(
            minimum,
            Math.min(maximum, Number.isFinite(value) ? value : fallback),
        );
        this.runToggled = snapshot.runToggled === true;
        this.autoRun = snapshot.autoRun === true;
        this.setNoClip(snapshot.noClip === true);
        this.thirdPersonCameraDistance = clampDistance(
            snapshot.thirdPersonCameraDistance,
            this.options.cameraDistance,
        );
        this.firstPerson = (
            snapshot.firstPerson === true
            && this.options.firstPersonEnabled
        );
        this.cameraDistance = this.firstPerson
            ? minimum
            : clampDistance(
                snapshot.cameraDistance,
                this.thirdPersonCameraDistance,
            );
        this.cameraPitch = Math.max(
            this.options.cameraMinPitch,
            Math.min(
                this.options.cameraMaxPitch,
                Number.isFinite(snapshot.cameraPitch)
                    ? snapshot.cameraPitch
                    : this.options.cameraPitch,
            ),
        );
        this.updateCamera(1);
    }

    setNoClip(enabled) {
        this.noClip = this.options.noClipEnabled !== false
            && Boolean(enabled);
        this.collider.checkCollisions = !this.noClip;
        if (this.noClip) {
            this.airborne = false;
            this.verticalVelocity = 0;
        }
        return this.noClip;
    }

    setFirstPerson(enabled, {
        resetThirdPersonView =
            this.options.resetThirdPersonViewOnFirstPersonExit,
    } = {}) {
        const wasFirstPerson = this.firstPerson;
        const firstPerson = Boolean(enabled) && this.options.firstPersonEnabled;
        if (firstPerson) {
            if (!this.firstPerson) {
                this.thirdPersonCameraDistance = this.cameraDistance;
            }
            this.cameraDistance = this.options.cameraMinDistance;
        } else if (this.firstPerson) {
            this.cameraDistance = Math.max(
                this.options.cameraMinDistance,
                Math.min(
                    this.options.cameraMaxDistance,
                    this.thirdPersonCameraDistance,
                ),
            );
            if (resetThirdPersonView) {
                this.cameraYaw = this.actorRoot.rotation.y + Math.PI;
                this.cameraPitch = this.options.cameraPitch;
            }
        }
        this.firstPerson = firstPerson;
        if (firstPerson && !this.movementLocked) {
            this.alignActorToFirstPersonView();
        }
        this.updateCamera(1);
        if (wasFirstPerson !== firstPerson) {
            this.options.onFirstPersonChanged?.(firstPerson, wasFirstPerson);
        }
        return this.firstPerson;
    }

    toggleRun() {
        if (this.options.runEnabled === false) return this.runToggled;
        this.runToggled = !this.runToggled;
        this.options.onRunToggleChanged?.(this.runToggled);
        return this.runToggled;
    }

    alignActorToFirstPersonView() {
        this.actorRoot.rotation.y = this.cameraYaw + Math.PI;
        return this.actorRoot.rotation.y;
    }

    reset(
        position = BABYLON.Vector3.Zero(),
        yaw = 0,
        { snapToTerrain = true } = {},
    ) {
        this.cancelApproach();
        this.runToggled = false;
        this.autoRun = false;
        this.gamepadLookActive = false;
        this.clearTouchMovement();
        this.safePositionHistory = [];
        this.safePositionSampleSeconds = 0;
        this.collider.position.copyFrom(position);
        this.airborne = false;
        this.verticalVelocity = 0;
        this.actorRoot.position.copyFrom(position);
        this.actorRoot.rotation.y = yaw;
        this.lastActorYaw = yaw;
        this.stationaryTurnRemainingSeconds = 0;
        this.stationaryTurnDirection = 0;
        this.cameraYaw = yaw + Math.PI;
        this.cameraPitch = this.options.cameraPitch;
        this.cameraDistance = this.options.cameraDistance;
        this.thirdPersonCameraDistance = this.cameraDistance;
        this.firstPerson = false;
        this.cameraTarget = position.add(
            new BABYLON.Vector3(0, this.options.cameraTargetHeight, 0),
        );
        if (snapToTerrain) this.snapToTerrain(true);
        this.recordSafePosition(0, true);
        this.updateCamera(1);
    }

    requestPointerLock() {
        this.scene.getEngine().getRenderingCanvas()?.requestPointerLock?.();
    }

    dispose() {
        if (this.disposed) return;
        this.cancelApproach();
        this.disposed = true;
        for (const remove of this.listeners.splice(0)) remove();
        this.keys.clear();
        this.clearTouchMovement();
        this.touchLookPointerId = null;
        this.touchPointers.clear();
        this.touchPinchDistance = null;
        this.touchPinchAccumulator = 0;
        this.collider.dispose();
        if (document.pointerLockElement) document.exitPointerLock?.();
    }
}
