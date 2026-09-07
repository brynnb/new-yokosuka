import * as BABYLON from "@babylonjs/core";
import { FORKLIFT_MAXIMUM_LIFT } from "./ForkliftRig.js";
import {
    createAnimatedBox,
    createDynamicForkliftBodies,
    disposeDynamicForkliftBodies,
    ensureForkliftPhysics,
} from "./ForkliftPhysicsBodies.js";
import {
    activeForkliftLoad as cargoLoadForForklift,
    applyCargoServerState,
    revokeCargoLocalOwnership,
} from "./ForkliftCargoOwnership.js";
import {
    ALL_COLLISIONS,
    CARGO_AUTO_RIGHT_SECONDS,
    CARGO_ISLAND_CONTACT_MARGIN,
    CARGO_MASS,
    CARGO_NETWORK_INTERVAL_SECONDS,
    COLLISION,
    CONTACT_MEMORY_SECONDS,
    DEFAULT_FORKLIFT_PHYSICS_TUNING,
    EXTERNAL_SUPPORT_CONTACT_MEMORY_SECONDS,
    EXTERNAL_SUPPORT_SETTLE_SECONDS,
    FORK_CARGO_OFF_GROUND_LIFT,
    FORK_STACK_RELEASE_COOLDOWN_SECONDS,
    FORK_SUPPORT_MAX_UPRIGHT_SPEED,
    FORK_SUPPORT_MEMORY_SECONDS,
    FORK_SUPPORT_UPRIGHT_SPEED,
    FORKLIFT_CHASSIS_CENTER,
    FORKLIFT_ENTRY_SETTLE_SECONDS,
    FORKLIFT_FORK_ASSEMBLY_MASS,
    FORKLIFT_FRICTION_ENGAGE_UP_DOT,
    FORKLIFT_FRICTION_RELEASE_UP_DOT,
    FORKLIFT_HALF_TRACK,
    FORKLIFT_HALF_WHEELBASE,
    FORKLIFT_HYDRAULIC_FORCE,
    FORKLIFT_LOAD_BACKREST,
    FORKLIFT_TINE_CENTER_X,
    FORKLIFT_TINE_CENTER_Y,
    FORKLIFT_TINE_CENTER_Z,
    FORKLIFT_TINE_DIMENSIONS,
    FORKLIFT_UPRIGHT_FRICTION,
    MAX_CARGO_ANGULAR_SPEED,
    MAX_CARGO_LINEAR_SPEED,
    REMOTE_INTERPOLATION_SHARPNESS,
    bodyState,
    cargoBottomFacesDown,
    cargoColliderBands,
    cargoContactSupportsFromBelow,
    cargoMembershipWithForkSupport,
    cargoRestingPoseOnSupport,
    cargoSupportedByForklift,
    clamp,
    clampBodyVelocity,
    constrainedForkLateralVelocity,
    constrainedForkLongitudinalVelocity,
    constrainedForkVerticalVelocity,
    forkTineCollisionEnabled,
    forkliftBodyCollideMask,
    forkliftChassisFriction,
    forkliftCompoundTineCollideMask,
    forkliftCompoundTineTranslation,
    forkliftConstrainedLift,
    forkliftCenterOfMass,
    forkliftDriveAcceleration,
    forkliftEntryIsSettling,
    forkliftAntiRollForce,
    forkliftSuspensionForce,
    forkliftTireSlipSpeed,
    interpolationAlpha,
    normalizedQuaternion,
    orientedBoxesIntersect,
    quaternionAxes,
    setShapeFilters,
    transformedDirection,
    transformedPoint,
    worldPoseForLocalPoint,
} from "./ForkliftCargoRules.js";

export {
    CARGO_AUTO_RIGHT_SECONDS,
    CARGO_CONTACT_RELEASE_SECONDS,
    CARGO_NETWORK_INTERVAL_SECONDS,
    CARGO_UPRIGHT_DOT_THRESHOLD,
    DEFAULT_FORKLIFT_PHYSICS_TUNING,
    FORKLIFT_ENTRY_SETTLE_SECONDS,
    FORKLIFT_LOAD_BACKREST,
    cargoBottomFacesDown,
    cargoColliderBands,
    cargoContactSupportsFromBelow,
    cargoMembershipWithForkSupport,
    cargoNearSupportBelow,
    cargoRestingPoseOnSupport,
    cargoSupportedByForklift,
    collisionGroupsCanCollide,
    constrainedForkLateralVelocity,
    constrainedForkLongitudinalVelocity,
    constrainedForkVerticalVelocity,
    forkTineCollisionEnabled,
    forkliftBodyCollideMask,
    forkliftCenterOfMass,
    forkliftChassisFriction,
    forkliftCompoundTineCollideMask,
    forkliftCompoundTineTranslation,
    forkliftConstrainedLift,
    forkliftDriveAcceleration,
    forkliftEntryIsSettling,
    forkliftAntiRollForce,
    forkliftSuspensionForce,
    forkliftTireSlipSpeed,
    orientedBoxesIntersect,
} from "./ForkliftCargoRules.js";

export class ForkliftCargoPhysics {
    static async create(scene, {
        groundY = 0,
        onClaim = () => false,
        onUpdate = () => false,
        localPlayerId = () => null,
        pickWithRay = null,
    } = {}) {
        await ensureForkliftPhysics(scene);
        return new ForkliftCargoPhysics(scene, {
            groundY,
            onClaim,
            onUpdate,
            localPlayerId,
            pickWithRay,
        });
    }

    constructor(scene, {
        groundY,
        onClaim,
        onUpdate,
        localPlayerId,
        pickWithRay,
    }) {
        this.scene = scene;
        this.onClaim = onClaim;
        this.onUpdate = onUpdate;
        this.localPlayerId = localPlayerId;
        this.pickWithRay = pickWithRay
            || ((...args) => this.scene.pickWithRay(...args));
        this.elapsedSeconds = 0;
        this.entries = new Map();
        this.bodyKinds = new Map();
        this.forkliftActive = false;
        this.disposed = false;
        this.groundY = groundY;
        this.staticTerrain = [];
        this.forkliftProxies = new Map();
        this.activeForkliftId = null;
        const physicsPlugin = scene.getPhysicsEngine()?.getPhysicsPlugin();
        this.physicsCollisionObservable = physicsPlugin?.onCollisionObservable
            || null;
        this.physicsCollisionObserver = (
            this.physicsCollisionObservable?.add((event) => {
                this.#recordDynamicForkliftGroundImpact(event);
                this.#recordExternalSupportContact(
                    event.collider,
                    event.collidedAgainst,
                    event.point,
                    event.normal,
                );
                this.#recordExternalSupportContact(
                    event.collidedAgainst,
                    event.collider,
                    event.point,
                    event.normal?.scale(-1),
                );
            }) || null
        );
    }

    #recordDynamicForkliftGroundImpact(event) {
        if (
            event?.type === BABYLON.PhysicsEventType.COLLISION_FINISHED
            || !Number.isFinite(event?.impulse)
        ) {
            return;
        }
        const pairs = [
            [event.collider, event.collidedAgainst],
            [event.collidedAgainst, event.collider],
        ];
        for (const [forkliftBody, otherBody] of pairs) {
            if (this.bodyKinds.get(otherBody) !== "ground") continue;
            for (const proxy of this.forkliftProxies.values()) {
                const dynamic = proxy.dynamic;
                if (dynamic?.aggregate.body !== forkliftBody) continue;
                dynamic.groundImpactImpulse = Math.max(
                    dynamic.groundImpactImpulse || 0,
                    Math.abs(event.impulse),
                );
                return;
            }
        }
    }

    #recordExternalSupportContact(
        cargoBody,
        supportingBody,
        contactPoint,
        contactNormal,
    ) {
        const cargoKind = this.bodyKinds.get(cargoBody);
        const supportingKind = this.bodyKinds.get(supportingBody);
        if (
            !cargoKind?.startsWith("cargo:")
            || !(
                supportingKind === "ground"
                || supportingKind?.startsWith("cargo:")
            )
        ) {
            return;
        }
        const entry = this.entries.get(cargoKind.slice("cargo:".length));
        if (
            !entry
            || !cargoContactSupportsFromBelow({
                cargoPosition: entry.node.position,
                cargoOrientation: (
                    entry.node.rotationQuaternion
                    || BABYLON.Quaternion.Identity()
                ),
                contactPoint,
                contactNormal,
            })
        ) {
            return;
        }
        if (
            this.elapsedSeconds - entry.lastExternalSupportAt
            > EXTERNAL_SUPPORT_CONTACT_MEMORY_SECONDS
        ) {
            entry.externalSupportStartedAt = this.elapsedSeconds;
        }
        entry.lastExternalSupportAt = this.elapsedSeconds;
    }

    #setForkSupportedCargoCollision(supported = new Set()) {
        for (const entry of this.entries.values()) {
            const forkSupported = supported.has(entry.id);
            setShapeFilters(
                entry.containerShape,
                cargoMembershipWithForkSupport(
                    COLLISION.cargoUpper | COLLISION.cargoLower,
                    forkSupported,
                ),
                ALL_COLLISIONS,
            );
            setShapeFilters(
                entry.lowerShape,
                cargoMembershipWithForkSupport(
                    COLLISION.cargoLower,
                    forkSupported,
                ),
                ALL_COLLISIONS & ~COLLISION.forkliftTine,
            );
        }
    }

    #cargoSupportBelow(entry) {
        const cargo = {
            position: entry.node.position,
            orientation: (
                entry.node.rotationQuaternion
                || BABYLON.Quaternion.Identity()
            ),
            halfExtents: entry.dimensions.scale(0.5),
        };
        let nearest = null;
        for (const other of this.entries.values()) {
            if (other === entry) continue;
            const pose = cargoRestingPoseOnSupport(cargo, {
                position: other.node.position,
                orientation: (
                    other.node.rotationQuaternion
                    || BABYLON.Quaternion.Identity()
                ),
                halfExtents: other.dimensions.scale(0.5),
            });
            if (!pose) continue;
            const distance = Math.abs(pose.position.y - cargo.position.y);
            if (!nearest || distance < nearest.distance) {
                nearest = { other, pose, distance };
            }
        }
        return nearest;
    }

    #settleCargoOnSupport(entry, support) {
        const body = entry.aggregate.body;
        entry.node.position.copyFrom(support.pose.position);
        entry.node.rotationQuaternion.copyFrom(support.pose.orientation);
        body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
        body.setLinearVelocity(BABYLON.Vector3.Zero());
        body.setAngularVelocity(BABYLON.Vector3.Zero());
        body.setTargetTransform(
            support.pose.position,
            support.pose.orientation,
        );
        body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
        entry.forkSupportReleaseUntil = (
            this.elapsedSeconds + FORK_STACK_RELEASE_COOLDOWN_SECONDS
        );
    }

    #createAnimatedBox(
        name,
        extents,
        membership,
        collide,
        localCenter = null,
        initialPosition = null,
        animated = true,
    ) {
        return createAnimatedBox({
            scene: this.scene,
            bodyKinds: this.bodyKinds,
            name,
            extents,
            membership,
            collide,
            localCenter,
            initialPosition,
            animated,
        });
    }

    addStaticTerrain(meshes) {
        for (const mesh of meshes || []) {
            if (
                !mesh?.isEnabled()
                || typeof mesh.getTotalVertices !== "function"
                || mesh.getTotalVertices() <= 0
                || mesh.physicsBody
            ) {
                continue;
            }
            const shape = new BABYLON.PhysicsShapeMesh(mesh, this.scene);
            setShapeFilters(
                shape,
                COLLISION.ground,
                COLLISION.forkliftBody
                    | COLLISION.forkliftTine
                    | COLLISION.cargoUpper
                    | COLLISION.cargoLower,
            );
            shape.material = { friction: 0.82, restitution: 0.01 };
            const aggregate = new BABYLON.PhysicsAggregate(
                mesh,
                shape,
                { mass: 0, friction: 0.82, restitution: 0.01 },
                this.scene,
            );
            this.staticTerrain.push({ mesh, shape, aggregate });
            this.bodyKinds.set(aggregate.body, "ground");
        }
        return this.staticTerrain.length;
    }

    addCargo({
        id,
        visualRoot,
        dimensions,
        position,
        orientation = BABYLON.Quaternion.Identity(),
        state = null,
    }) {
        if (this.entries.has(id)) return this.entries.get(id);
        const node = new BABYLON.TransformNode(`cargo_physics_${id}`, this.scene);
        node.position.copyFrom(position);
        node.rotationQuaternion = orientation.clone().normalize();
        visualRoot.parent = node;
        visualRoot.position.setAll(0);
        visualRoot.rotationQuaternion = null;
        visualRoot.rotation.setAll(0);

        const bands = cargoColliderBands(dimensions);
        const upper = new BABYLON.PhysicsShapeBox(
            bands.upper.center,
            BABYLON.Quaternion.Identity(),
            bands.upper.extents,
            this.scene,
        );
        setShapeFilters(upper, COLLISION.cargoUpper, ALL_COLLISIONS);
        upper.material = { friction: 0.86, restitution: 0.001 };
        const lower = new BABYLON.PhysicsShapeBox(
            bands.lower.center,
            BABYLON.Quaternion.Identity(),
            bands.lower.extents,
            this.scene,
        );
        setShapeFilters(
            lower,
            COLLISION.cargoLower,
            ALL_COLLISIONS & ~COLLISION.forkliftTine,
        );
        lower.material = { friction: 0.86, restitution: 0.001 };
        const container = new BABYLON.PhysicsShapeContainer(this.scene);
        container.addChild(upper);
        container.addChild(lower);
        setShapeFilters(
            container,
            COLLISION.cargoUpper | COLLISION.cargoLower,
            ALL_COLLISIONS,
        );
        const aggregate = new BABYLON.PhysicsAggregate(
            node,
            container,
            {
                mass: CARGO_MASS,
                friction: 0.86,
                restitution: 0.001,
                startAsleep: Boolean(state?.sleeping),
            },
            this.scene,
        );
        aggregate.body.setLinearDamping(0.18);
        aggregate.body.setAngularDamping(0.5);
        aggregate.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
        aggregate.body.setCollisionCallbackEnabled(true);

        const entry = {
            id,
            node,
            visualRoot,
            dimensions: dimensions.clone(),
            aggregate,
            shapes: [container, upper, lower],
            containerShape: container,
            lowerShape: lower,
            ownerId: "",
            localOwner: false,
            lastContactAt: Number.NEGATIVE_INFINITY,
            claimAttemptAt: Number.NEGATIVE_INFINITY,
            networkAccumulator: 0,
            releaseSent: false,
            targetPosition: position.clone(),
            targetOrientation: orientation.clone().normalize(),
            targetLinearVelocity: BABYLON.Vector3.Zero(),
            targetAngularVelocity: BABYLON.Vector3.Zero(),
            collisionObserver: null,
            forkSupportActive: false,
            forkSupportUntil: Number.NEGATIVE_INFINITY,
            forkSupportLateralOffset: 0,
            externalSupportStartedAt: Number.NEGATIVE_INFINITY,
            lastExternalSupportAt: Number.NEGATIVE_INFINITY,
            forkSupportReleaseUntil: Number.NEGATIVE_INFINITY,
        };
        entry.collisionObserver = aggregate.body
            .getCollisionObservable()
            .add((event) => {
                const collidedKind = this.bodyKinds.get(
                    event.collidedAgainst,
                );
                if (
                    !this.forkliftActive
                    || ![
                        "activeForklift",
                        "activeForkliftSupport",
                    ].includes(collidedKind)
                ) {
                    return;
                }
                entry.lastContactAt = this.elapsedSeconds;
            });
        this.entries.set(id, entry);
        this.bodyKinds.set(aggregate.body, `cargo:${id}`);
        if (state) this.applyServerState(state);
        return entry;
    }

    removeCargo(id) {
        const entry = this.entries.get(id);
        if (!entry) return null;
        if (entry.collisionObserver) {
            entry.aggregate.body
                .getCollisionObservable()
                .remove(entry.collisionObserver);
        }
        this.bodyKinds.delete(entry.aggregate.body);
        entry.aggregate.dispose();
        for (const shape of entry.shapes) shape.dispose();
        entry.node.dispose();
        this.entries.delete(id);
        return entry;
    }

    #groundedCargoPosition(entry, position) {
        const ownNodes = new Set([
            entry.visualRoot,
            ...entry.visualRoot.getDescendants(false),
        ]);
        const ray = new BABYLON.Ray(
            new BABYLON.Vector3(
                position.x,
                position.y + 0.05,
                position.z,
            ),
            BABYLON.Vector3.Down(),
            100,
        );
        const hit = this.pickWithRay(ray, (mesh) => (
            mesh?.isEnabled()
            && mesh.isPickable
            && !ownNodes.has(mesh)
            && !mesh.metadata?.collisionDebug
            && (
                mesh.metadata?.terrain === true
                || mesh.metadata?.forkliftCargo === true
                || mesh.metadata?.playerVehicle === true
                || mesh.metadata?.interactiveForklift
                || mesh.checkCollisions
            )
        ));
        if (!hit?.hit || !hit.pickedPoint) return position;
        position.y = hit.pickedPoint.y + entry.dimensions.y / 2;
        return position;
    }

    applyServerState(state) {
        const entry = this.entries.get(state?.id);
        return applyCargoServerState({
            entry,
            state,
            localPlayerId: this.localPlayerId(),
            groundPosition: (cargo, position) => (
                this.#groundedCargoPosition(cargo, position)
            ),
        });
    }

    handleDisconnect() {
        revokeCargoLocalOwnership(this.entries.values());
    }

    activeForkliftLoad() {
        return cargoLoadForForklift({
            forkliftActive: this.forkliftActive,
            proxy: this.forkliftProxies.get(this.activeForkliftId),
            entries: this.entries.values(),
        });
    }

    needsSimulation() {
        if (this.disposed) return false;
        if (
            this.activeForkliftId
            && this.hasDynamicForklift(this.activeForkliftId)
        ) {
            return true;
        }
        return [...this.entries.values()].some((entry) => entry.localOwner);
    }

    #hideForkliftProxy(proxy) {
        const hiddenPosition = new BABYLON.Vector3(0, -1000, 0);
        const identity = BABYLON.Quaternion.Identity();
        for (const part of [
            proxy.chassis,
            ...proxy.tines,
            proxy.support,
            proxy.backrest,
        ]) {
            part.aggregate.body.setTargetTransform(hiddenPosition, identity);
            part.node.position.copyFrom(hiddenPosition);
            part.node.rotationQuaternion.copyFrom(identity);
            part.pose.position.copyFrom(hiddenPosition);
            part.pose.orientation.copyFrom(identity);
        }
    }

    #forkliftProxy(id) {
        if (this.forkliftProxies.has(id)) {
            return this.forkliftProxies.get(id);
        }
        const chassis = this.#createAnimatedBox(
            `forklift_cargo_chassis_${id}`,
            new BABYLON.Vector3(1.28, 1.75, 1.35),
            COLLISION.forkliftBody,
            forkliftBodyCollideMask(),
        );
        const tines = [-0.498, 0.498].map((x, index) => (
            this.#createAnimatedBox(
                `forklift_cargo_tine_${id}_${index}`,
                new BABYLON.Vector3(0.12, 0.055, 1.09),
                COLLISION.forkliftTine,
                forkliftCompoundTineCollideMask(0),
                // Keep the physical tine just inside a ground-level crate's
                // lower insertion band. Raising the authored fork then makes
                // this collider meet and support the upper 90%.
                new BABYLON.Vector3(x, 0.075, -1.213),
            )
        ));
        const support = this.#createAnimatedBox(
            `forklift_cargo_support_${id}`,
            new BABYLON.Vector3(1.14, 0.06, 0.96),
            COLLISION.forkliftSupport,
            COLLISION.forkSupportedCargo,
            new BABYLON.Vector3(0, 0.075, -1.213),
        );
        const backrest = this.#createAnimatedBox(
            `forklift_cargo_backrest_${id}`,
            new BABYLON.Vector3(
                FORKLIFT_LOAD_BACKREST.dimensions.x,
                FORKLIFT_LOAD_BACKREST.dimensions.y,
                FORKLIFT_LOAD_BACKREST.dimensions.z,
            ),
            COLLISION.forkliftBody,
            COLLISION.cargoUpper | COLLISION.cargoLower,
            new BABYLON.Vector3(
                FORKLIFT_LOAD_BACKREST.center.x,
                FORKLIFT_LOAD_BACKREST.center.y,
                FORKLIFT_LOAD_BACKREST.center.z,
            ),
        );
        const proxy = {
            chassis,
            tines,
            support,
            backrest,
            supportActive: false,
            supportActiveUntil: Number.NEGATIVE_INFINITY,
            tineCollisionActive: false,
            lift: 0,
            liftDelta: 0,
            carrierPosition: BABYLON.Vector3.Zero(),
            carrierDelta: BABYLON.Vector3.Zero(),
            carrierPositionInitialized: false,
            dynamicActive: false,
            dynamic: null,
            dynamicLoadKey: "",
        };
        this.forkliftProxies.set(id, proxy);
        this.#hideForkliftProxy(proxy);
        return proxy;
    }

    activateDynamicForklift(id, {
        position,
        orientation,
        linearVelocity = BABYLON.Vector3.Zero(),
        angularVelocity = BABYLON.Vector3.Zero(),
        tuning = {},
        forkLift = 0,
        carriedLoad = 0,
        loadHeightFraction = 0,
    }) {
        const proxy = this.#forkliftProxy(id);
        this.#hideForkliftProxy(proxy);
        if (proxy.dynamic) this.#disposeDynamicForklift(proxy);
        proxy.dynamic = createDynamicForkliftBodies({
            scene: this.scene,
            bodyKinds: this.bodyKinds,
            id,
            position,
            orientation,
            linearVelocity,
            angularVelocity,
            tuning,
            forkLift,
            elapsedSeconds: this.elapsedSeconds,
        });
        proxy.dynamicActive = true;
        this.#updateDynamicForkliftMass(
            proxy,
            tuning,
            carriedLoad,
            loadHeightFraction,
        );
        return this.dynamicForkliftPose(id);
    }

    #disposeDynamicForklift(proxy) {
        if (!proxy?.dynamic) return;
        disposeDynamicForkliftBodies(proxy.dynamic, this.bodyKinds);
        proxy.dynamic = null;
    }

    deactivateDynamicForklift(id) {
        const proxy = this.forkliftProxies.get(id);
        if (!proxy?.dynamicActive) return null;
        const pose = this.dynamicForkliftPose(id);
        proxy.dynamicActive = false;
        proxy.dynamicLoadKey = "";
        this.#disposeDynamicForklift(proxy);
        return pose;
    }

    hasDynamicForklift(id) {
        return Boolean(this.forkliftProxies.get(id)?.dynamicActive);
    }

    #updateDynamicForkliftTines(proxy, lift) {
        const dynamic = proxy?.dynamic;
        if (!dynamic) return 0;
        const nextLift = clamp(
            Number(lift) || 0,
            0,
            FORKLIFT_MAXIMUM_LIFT,
        );
        const actualLift = forkliftConstrainedLift(
            dynamic.node.position,
            dynamic.forkNode.position,
            (
                dynamic.node.rotationQuaternion
                || BABYLON.Quaternion.Identity()
            ),
        );
        const collisionLift = Math.max(actualLift, nextLift);
        for (const tineShape of dynamic.tineShapes) {
            setShapeFilters(
                tineShape,
                COLLISION.forkliftTine,
                forkliftCompoundTineCollideMask(collisionLift),
            );
        }
        setShapeFilters(
            dynamic.forkShape,
            COLLISION.forkliftTine,
            forkliftCompoundTineCollideMask(collisionLift),
        );
        dynamic.forkConstraint.setAxisMotorTarget(
            BABYLON.PhysicsConstraintAxis.LINEAR_X,
            nextLift,
        );
        dynamic.forkTargetLift = nextLift;
        return actualLift;
    }

    #updateDynamicForkliftMass(
        proxy,
        tuningOverrides,
        carriedLoad,
        loadHeightFraction,
    ) {
        const tuning = {
            ...DEFAULT_FORKLIFT_PHYSICS_TUNING,
            ...tuningOverrides,
        };
        const load = clamp(Number(carriedLoad) || 0, 0, 1);
        const lift = clamp(Number(loadHeightFraction) || 0, 0, 1);
        const centerOfMass = forkliftCenterOfMass({
            baseHeight: tuning.centerOfMassHeight,
            load,
            lift,
            loadInfluence: tuning.loadInfluence,
        });
        const key = [
            tuning.mass,
            tuning.centerOfMassHeight,
            load.toFixed(3),
            lift.toFixed(3),
            tuning.loadInfluence,
        ].join(":");
        if (key === proxy.dynamicLoadKey) return tuning;
        proxy.dynamicLoadKey = key;
        const body = proxy.dynamic?.aggregate.body;
        if (!body) return tuning;
        const computed = body.computeMassProperties();
        body.setMassProperties({
            ...computed,
            mass: Math.max(
                1,
                tuning.mass - FORKLIFT_FORK_ASSEMBLY_MASS,
            ) + CARGO_MASS * load,
            centerOfMass,
        });
        return tuning;
    }

    dynamicForkliftPose(id) {
        const proxy = this.forkliftProxies.get(id);
        if (!proxy?.dynamicActive) return null;
        const orientation = (
            proxy.dynamic.node.rotationQuaternion
            || BABYLON.Quaternion.Identity()
        ).clone().normalize();
        const centerOffset = BABYLON.Vector3.TransformNormal(
            new BABYLON.Vector3(
                FORKLIFT_CHASSIS_CENTER.x,
                FORKLIFT_CHASSIS_CENTER.y,
                FORKLIFT_CHASSIS_CENTER.z,
            ),
            BABYLON.Matrix.FromQuaternionToRef(
                orientation,
                BABYLON.Matrix.Identity(),
            ),
        );
        const body = proxy.dynamic.aggregate.body;
        return {
            position: proxy.dynamic.node.position.subtract(centerOffset),
            orientation,
            linearVelocity: body.getLinearVelocity(),
            angularVelocity: body.getAngularVelocity(),
            forkLift: forkliftConstrainedLift(
                proxy.dynamic.node.position,
                proxy.dynamic.forkNode.position,
                orientation,
            ),
        };
    }

    consumeDynamicForkliftGroundImpact(id) {
        const dynamic = this.forkliftProxies.get(id)?.dynamic;
        if (!dynamic) return 0;
        const impulse = Number(dynamic.groundImpactImpulse) || 0;
        dynamic.groundImpactImpulse = 0;
        return impulse;
    }

    #dynamicWheelContacts(dynamic, pose, tuning) {
        const physics = this.scene.getPhysicsEngine();
        if (!physics) return [];
        const body = dynamic.aggregate.body;
        const up = transformedDirection(BABYLON.Axis.Y, pose.orientation);
        const contacts = [];
        for (const z of [-FORKLIFT_HALF_WHEELBASE, FORKLIFT_HALF_WHEELBASE]) {
            for (const x of [-FORKLIFT_HALF_TRACK, FORKLIFT_HALF_TRACK]) {
                const mount = transformedPoint(
                    pose.position,
                    new BABYLON.Vector3(x, tuning.wheelMountHeight, z),
                    pose.orientation,
                );
                const rayEnd = mount.subtract(
                    up.scale(tuning.suspensionMaximumLength),
                );
                const hit = physics.raycast(mount, rayEnd, {
                    membership: COLLISION.forkliftBody,
                    collideWith: COLLISION.ground,
                    ignoreBody: body,
                });
                if (
                    !hit?.hasHit
                    || this.bodyKinds.get(hit.body) !== "ground"
                ) {
                    continue;
                }
                const point = hit.hitPointWorld.clone();
                const normal = hit.hitNormalWorld.clone().normalize();
                const centerOffset = point.subtract(dynamic.node.position);
                const pointVelocity = pose.linearVelocity.add(
                    BABYLON.Vector3.Cross(
                        pose.angularVelocity,
                        centerOffset,
                    ),
                );
                const normalSpeed = BABYLON.Vector3.Dot(
                    pointVelocity,
                    normal,
                );
                const suspensionForce = forkliftSuspensionForce({
                    hitDistance: hit.hitDistance,
                    restLength: tuning.suspensionRestLength,
                    normalSpeed,
                    stiffness: tuning.wheelSuspensionStiffness,
                    damping: tuning.wheelSuspensionDamping,
                    maximumForce: tuning.wheelSuspensionMaximumForce,
                });
                if (suspensionForce > 0) {
                    body.applyForce(normal.scale(suspensionForce), point);
                }
                contacts.push({
                    point,
                    normal,
                    front: z > 0,
                    side: Math.sign(x),
                    compression: Math.max(
                        0,
                        tuning.suspensionRestLength - hit.hitDistance,
                    ),
                    compressionSpeed: -normalSpeed,
                    suspensionForce,
                    normalForce: suspensionForce,
                });
            }
        }
        return contacts;
    }

    #applyDynamicAntiRollBar(body, wheelContacts, up, tuning) {
        for (const front of [false, true]) {
            const axleContacts = wheelContacts.filter(
                (contact) => contact.front === front,
            );
            const left = axleContacts.find((contact) => contact.side < 0);
            const right = axleContacts.find((contact) => contact.side > 0);
            if (!left || !right) continue;
            const force = forkliftAntiRollForce({
                leftCompression: left.compression,
                rightCompression: right.compression,
                leftCompressionSpeed: left.compressionSpeed,
                rightCompressionSpeed: right.compressionSpeed,
                stiffness: tuning.antiRollStiffness,
                damping: tuning.antiRollDamping,
                leftSupportForce: left.suspensionForce,
                rightSupportForce: right.suspensionForce,
            });
            if (Math.abs(force) <= 1e-6) continue;
            body.applyForce(up.scale(force), left.point);
            body.applyForce(up.scale(-force), right.point);
            left.normalForce += force;
            right.normalForce -= force;
        }
    }

    stepDynamicForklift(id, {
        throttle = 0,
        steeringAngle = 0,
        forkLift = 0,
        carriedLoad = 0,
        loadHeightFraction = 0,
        tuning: tuningOverrides = {},
    } = {}, deltaSeconds = 1 / 60) {
        const proxy = this.forkliftProxies.get(id);
        if (!proxy?.dynamicActive) return null;
        const dynamic = proxy.dynamic;
        if (
            dynamic.settling
            && forkliftEntryIsSettling(
                dynamic.settleUntil,
                this.elapsedSeconds,
            )
        ) {
            dynamic.aggregate.body.setTargetTransform(
                dynamic.settleChassisPosition,
                dynamic.settleOrientation,
            );
            dynamic.forkAggregate.body.setTargetTransform(
                dynamic.settleForkPosition,
                dynamic.settleOrientation,
            );
            dynamic.aggregate.body.setLinearVelocity(
                BABYLON.Vector3.Zero(),
            );
            dynamic.aggregate.body.setAngularVelocity(
                BABYLON.Vector3.Zero(),
            );
            dynamic.forkAggregate.body.setLinearVelocity(
                BABYLON.Vector3.Zero(),
            );
            dynamic.forkAggregate.body.setAngularVelocity(
                BABYLON.Vector3.Zero(),
            );
            const pose = this.dynamicForkliftPose(id);
            const up = transformedDirection(
                BABYLON.Axis.Y,
                pose.orientation,
            );
            return {
                ...pose,
                forwardSpeed: 0,
                upDot: up.y,
                tiltAngle: Math.acos(clamp(up.y, -1, 1)),
                settling: true,
            };
        }
        if (dynamic.settling) {
            // Release the chassis and hydraulic assembly on the same frame
            // with an explicit zero-energy state.
            dynamic.aggregate.body.setTargetTransform(
                dynamic.settleChassisPosition,
                dynamic.settleOrientation,
            );
            dynamic.forkAggregate.body.setTargetTransform(
                dynamic.settleForkPosition,
                dynamic.settleOrientation,
            );
            dynamic.aggregate.body.setMotionType(
                BABYLON.PhysicsMotionType.DYNAMIC,
            );
            dynamic.forkAggregate.body.setMotionType(
                BABYLON.PhysicsMotionType.DYNAMIC,
            );
            dynamic.aggregate.body.setLinearVelocity(
                BABYLON.Vector3.Zero(),
            );
            dynamic.aggregate.body.setAngularVelocity(
                BABYLON.Vector3.Zero(),
            );
            dynamic.forkAggregate.body.setLinearVelocity(
                BABYLON.Vector3.Zero(),
            );
            dynamic.forkAggregate.body.setAngularVelocity(
                BABYLON.Vector3.Zero(),
            );
            dynamic.settling = false;
        }
        this.#updateDynamicForkliftTines(proxy, forkLift);
        const tuning = this.#updateDynamicForkliftMass(
            proxy,
            tuningOverrides,
            carriedLoad,
            loadHeightFraction,
        );
        const body = proxy.dynamic.aggregate.body;
        const pose = this.dynamicForkliftPose(id);
        const orientation = pose.orientation;
        const forward = transformedDirection(BABYLON.Axis.Z, orientation);
        const right = transformedDirection(BABYLON.Axis.X, orientation);
        const up = transformedDirection(BABYLON.Axis.Y, orientation);
        const linearVelocity = pose.linearVelocity;
        const angularVelocity = pose.angularVelocity;
        const surfaceFriction = forkliftChassisFriction(
            up.y,
            proxy.dynamic.surfaceFriction,
        );
        if (surfaceFriction !== proxy.dynamic.surfaceFriction) {
            proxy.dynamic.surfaceFriction = surfaceFriction;
            proxy.dynamic.chassisShape.material = {
                friction: surfaceFriction,
                restitution: 0.001,
            };
        }
        // Once the chassis is on its side, the wheels are no longer valid
        // contact patches. Fade their artificial drive/grip forces away and
        // let the high-friction chassis/ground contact stop the vehicle.
        const tireContact = clamp(
            (up.y - FORKLIFT_FRICTION_ENGAGE_UP_DOT)
                / (
                    FORKLIFT_FRICTION_RELEASE_UP_DOT
                    - FORKLIFT_FRICTION_ENGAGE_UP_DOT
                ),
            0,
            1,
        );
        const forwardSpeed = BABYLON.Vector3.Dot(linearVelocity, forward);
        const lateralSpeed = BABYLON.Vector3.Dot(linearVelocity, right);
        const dt = Math.max(1 / 240, Number(deltaSeconds) || 0);
        const input = clamp(Number(throttle) || 0, -1, 1);
        const targetSpeed = input >= 0
            ? input * tuning.maximumForwardSpeed
            : input * tuning.maximumReverseSpeed;
        const changingDirection = (
            input !== 0
            && forwardSpeed !== 0
            && Math.sign(input) !== Math.sign(forwardSpeed)
        );
        const response = input === 0
            ? tuning.rollingDeceleration
            : changingDirection
                ? tuning.brakeAcceleration
                : tuning.driveAcceleration;
        const measuredAcceleration = (
            (forwardSpeed - dynamic.previousForwardSpeed) / dt
        );
        dynamic.previousForwardSpeed = forwardSpeed;
        const accelerationAlpha = interpolationAlpha(
            dt,
            tuning.accelerationFilterResponse,
        );
        dynamic.filteredForwardAcceleration += (
            measuredAcceleration - dynamic.filteredForwardAcceleration
        ) * accelerationAlpha;
        const desiredAcceleration = forkliftDriveAcceleration({
            targetSpeed,
            forwardSpeed,
            filteredAcceleration: dynamic.filteredForwardAcceleration,
            gain: tuning.speedControllerGain,
            damping: tuning.speedControllerDamping,
            maximumDriveAcceleration: response,
            maximumBrakeAcceleration: response,
        });
        const wheelContacts = this.#dynamicWheelContacts(
            dynamic,
            pose,
            tuning,
        );
        this.#applyDynamicAntiRollBar(body, wheelContacts, up, tuning);
        const frontContacts = wheelContacts.filter((contact) => contact.front);
        const lateralAcceleration = (
            -lateralSpeed * tuning.tireGrip * tireContact
        );
        const desiredYawRate = (
            forwardSpeed / (FORKLIFT_HALF_WHEELBASE * 2)
            * Math.tan(Number(steeringAngle) || 0)
        );
        const yawRate = BABYLON.Vector3.Dot(angularVelocity, up);
        const tireSlipSpeed = forkliftTireSlipSpeed(
            lateralSpeed,
            yawRate,
            desiredYawRate,
        );
        const steeringAcceleration = (
            (desiredYawRate - yawRate)
            * tuning.steeringGrip
            * tireContact
        );
        // Use an equal/opposite axle force pair for steering. It supplies the
        // requested yaw torque without adding sideways momentum; with the
        // wheel centered, the same couple actively damps residual yaw.
        const rearContacts = wheelContacts.filter((contact) => !contact.front);
        // Build one combined tire force per wheel and clamp it to that
        // contact's friction circle. Steering, cornering, and acceleration
        // therefore share the available grip instead of creating force from
        // independent, unbounded controllers.
        for (const contact of wheelContacts) {
            const contactForward = forward.subtract(
                contact.normal.scale(BABYLON.Vector3.Dot(
                    forward,
                    contact.normal,
                )),
            );
            if (contactForward.lengthSquared() <= 1e-8) continue;
            contactForward.normalize();
            const contactRight = BABYLON.Vector3.Cross(
                contact.normal,
                contactForward,
            ).normalize();
            const driveForce = contact.front && frontContacts.length > 0
                ? desiredAcceleration
                    * tuning.mass
                    * tireContact
                    / frontContacts.length
                : 0;
            const lateralForce = wheelContacts.length > 0
                ? lateralAcceleration * tuning.mass / wheelContacts.length
                : 0;
            const steeringForce = contact.front && frontContacts.length > 0
                ? steeringAcceleration
                    * tuning.mass
                    * 0.5
                    / frontContacts.length
                : !contact.front && rearContacts.length > 0
                    ? -steeringAcceleration
                        * tuning.mass
                        * 0.5
                        / rearContacts.length
                    : 0;
            const tireForce = contactForward.scale(driveForce).add(
                contactRight.scale(lateralForce + steeringForce),
            );
            const maximumTireForce = (
                contact.normalForce
                * Math.max(0, tuning.tireFrictionCoefficient)
            );
            const tireForceLength = tireForce.length();
            if (tireForceLength > maximumTireForce && tireForceLength > 0) {
                tireForce.scaleInPlace(maximumTireForce / tireForceLength);
            }
            body.applyForce(tireForce, contact.point);
        }

        const tiltAngle = Math.acos(clamp(up.y, -1, 1));
        return {
            ...pose,
            forwardSpeed,
            tireContact,
            tireSlipSpeed,
            upDot: up.y,
            tiltAngle,
        };
    }

    syncForkliftPoses(
        fleet,
        activeForkliftId = null,
        excludedForkliftIds = [],
    ) {
        const seen = new Set();
        this.forkliftActive = Boolean(activeForkliftId);
        this.activeForkliftId = activeForkliftId;
        if (!this.forkliftActive) this.#setForkSupportedCargoCollision();
        const excluded = new Set(excludedForkliftIds);
        for (const entry of fleet || []) {
            if (
                !entry?.id
                || !entry?.rig
                || (
                    !entry.root?.isEnabled()
                    && !entry.networkOwnerId
                )
            ) {
                continue;
            }
            seen.add(entry.id);
            const proxy = this.#forkliftProxy(entry.id);
            if (excluded.has(entry.id)) {
                this.#hideForkliftProxy(proxy);
                continue;
            }
            const bodyKind = entry.id === activeForkliftId
                ? "activeForklift"
                : "parkedForklift";
            this.bodyKinds.set(proxy.chassis.aggregate.body, bodyKind);
            for (const tine of proxy.tines) {
                this.bodyKinds.set(tine.aggregate.body, bodyKind);
            }
            this.bodyKinds.set(
                proxy.support.aggregate.body,
                entry.id === activeForkliftId
                    ? "activeForkliftSupport"
                    : "parkedForklift",
            );
            this.bodyKinds.set(
                proxy.backrest.aggregate.body,
                bodyKind,
            );
            this.#updateForkliftProxy(proxy, entry.rig, entry.state);
        }
        for (const [id, proxy] of this.forkliftProxies) {
            if (!seen.has(id)) this.#hideForkliftProxy(proxy);
        }
    }

    #updateForkliftProxy(proxy, rig, state) {
        const nextLift = Number(state?.lift) || 0;
        proxy.liftDelta = nextLift - proxy.lift;
        proxy.lift = nextLift;
        proxy.tineCollisionActive = forkTineCollisionEnabled(
            proxy.lift,
            proxy.supportActive,
        );
        if (!proxy.dynamicActive) {
            const chassisPose = worldPoseForLocalPoint(
                rig.root,
                new BABYLON.Vector3(0, 0.875, 0.08),
            );
            proxy.chassis.aggregate.body.setTargetTransform(
                chassisPose.position,
                chassisPose.orientation,
            );
            proxy.chassis.pose.position.copyFrom(chassisPose.position);
            proxy.chassis.pose.orientation.copyFrom(chassisPose.orientation);
        } else {
            const hiddenPosition = new BABYLON.Vector3(0, -1000, 0);
            proxy.chassis.aggregate.body.setTargetTransform(
                hiddenPosition,
                BABYLON.Quaternion.Identity(),
            );
            proxy.chassis.node.position.copyFrom(hiddenPosition);
        }
        for (const tine of proxy.tines) {
            setShapeFilters(
                tine.shape,
                COLLISION.forkliftTine,
                forkliftCompoundTineCollideMask(proxy.lift),
            );
            const local = tine.localCenter.clone();
            local.y += Number(state?.lift) || 0;
            const pose = worldPoseForLocalPoint(rig.root, local);
            tine.aggregate.body.setTargetTransform(
                !proxy.dynamicActive
                    ? pose.position
                    : new BABYLON.Vector3(0, -1000, 0),
                pose.orientation,
            );
            // Keep the authored pose available for penetration/support tests
            // even while the physical collider is parked out of the scene.
            tine.pose.position.copyFrom(pose.position);
            tine.pose.orientation.copyFrom(pose.orientation);
        }
        const carrierPosition = proxy.tines[0].pose.position
            .add(proxy.tines[1].pose.position)
            .scale(0.5);
        if (proxy.carrierPositionInitialized) {
            carrierPosition.subtractToRef(
                proxy.carrierPosition,
                proxy.carrierDelta,
            );
        } else {
            proxy.carrierDelta.setAll(0);
            proxy.carrierPositionInitialized = true;
        }
        proxy.carrierPosition.copyFrom(carrierPosition);
        {
            const local = proxy.backrest.localCenter.clone();
            local.y += Number(state?.lift) || 0;
            const pose = worldPoseForLocalPoint(rig.root, local);
            proxy.backrest.aggregate.body.setTargetTransform(
                pose.position,
                pose.orientation,
            );
            proxy.backrest.pose.position.copyFrom(pose.position);
            proxy.backrest.pose.orientation.copyFrom(pose.orientation);
        }
        if (proxy.supportActive) {
            const local = proxy.support.localCenter.clone();
            local.y += Number(state?.lift) || 0;
            const pose = worldPoseForLocalPoint(rig.root, local);
            proxy.support.aggregate.body.setTargetTransform(
                pose.position,
                pose.orientation,
            );
            proxy.support.pose.position.copyFrom(pose.position);
            proxy.support.pose.orientation.copyFrom(pose.orientation);
        } else {
            const hiddenPosition = new BABYLON.Vector3(0, -1000, 0);
            proxy.support.aggregate.body.setTargetTransform(
                hiddenPosition,
                BABYLON.Quaternion.Identity(),
            );
            proxy.support.pose.position.copyFrom(hiddenPosition);
            proxy.support.pose.orientation.copyFrom(
                BABYLON.Quaternion.Identity(),
            );
        }
    }

    #supportedCargoSet() {
        const proxy = this.forkliftProxies.get(this.activeForkliftId);
        if (!proxy) {
            this.#setForkSupportedCargoCollision();
            return new Set();
        }
        if (proxy.lift <= 0) {
            for (const entry of this.entries.values()) {
                entry.forkSupportActive = false;
                entry.forkSupportUntil = Number.NEGATIVE_INFINITY;
            }
            this.#setForkSupportedCargoCollision();
            proxy.supportActive = false;
            proxy.supportActiveUntil = Number.NEGATIVE_INFINITY;
            const hiddenPosition = new BABYLON.Vector3(0, -1000, 0);
            proxy.support.aggregate.body.setTargetTransform(
                hiddenPosition,
                BABYLON.Quaternion.Identity(),
            );
            proxy.support.pose.position.copyFrom(hiddenPosition);
            proxy.support.pose.orientation.copyFrom(
                BABYLON.Quaternion.Identity(),
            );
            return new Set();
        }
        const tines = proxy.tines.map((tine) => ({
            position: tine.pose.position,
            orientation: tine.pose.orientation,
            halfExtents: tine.halfExtents,
        }));
        const supportPosition = tines[0].position
            .add(tines[1].position)
            .scale(0.5);
        const supportOrientation = tines[0].orientation;
        const requestedLiftDelta = proxy.dynamicActive
            ? proxy.dynamic.forkTargetLift - proxy.lift
            : proxy.liftDelta;
        const supported = new Set();
        let transferredLoad = false;
        for (const entry of this.entries.values()) {
            const cargoSupport = entry.forkSupportActive
                ? this.#cargoSupportBelow(entry)
                : null;
            const externalSupportStable = (
                this.elapsedSeconds - entry.lastExternalSupportAt
                    <= EXTERNAL_SUPPORT_CONTACT_MEMORY_SECONDS
                && this.elapsedSeconds - entry.externalSupportStartedAt
                    >= EXTERNAL_SUPPORT_SETTLE_SECONDS
            );
            const transferringLoad = (
                entry.forkSupportActive
                && requestedLiftDelta < -1e-5
                && (
                    externalSupportStable
                    || cargoSupport
                )
            );
            if (transferringLoad) {
                entry.forkSupportActive = false;
                entry.forkSupportUntil = Number.NEGATIVE_INFINITY;
                if (cargoSupport) {
                    this.#settleCargoOnSupport(entry, cargoSupport);
                } else {
                    const velocity = (
                        entry.aggregate.body.getLinearVelocity()
                    );
                    entry.aggregate.body.setLinearVelocity(
                        new BABYLON.Vector3(
                            velocity.x,
                            Math.min(0, velocity.y),
                            velocity.z,
                        ),
                    );
                    entry.aggregate.body.setAngularVelocity(
                        BABYLON.Vector3.Zero(),
                    );
                }
                transferredLoad = true;
            }
            const newlyEngaged = (
                !transferringLoad
                && requestedLiftDelta >= -1e-5
                && this.elapsedSeconds >= entry.forkSupportReleaseUntil
                && (!externalSupportStable || requestedLiftDelta > 1e-5)
                && forkTineCollisionEnabled(
                    proxy.lift,
                    entry.forkSupportActive,
                )
                && cargoSupportedByForklift({
                    position: entry.node.position,
                    orientation: entry.node.rotationQuaternion,
                    dimensions: entry.dimensions,
                }, tines)
            );
            const supportAxes = quaternionAxes(supportOrientation);
            const supportOffset = entry.node.position.subtract(
                supportPosition,
            );
            const verticalOffset = BABYLON.Vector3.Dot(
                supportOffset,
                supportAxes[1],
            );
            const longitudinalOffset = BABYLON.Vector3.Dot(
                supportOffset,
                supportAxes[2],
            );
            const expectedVerticalOffset = (
                entry.dimensions.y / 2
                + proxy.support.halfExtents.y
            );
            const remainsOnFork = (
                entry.forkSupportActive
                && Math.abs(verticalOffset - expectedVerticalOffset) <= 0.24
                && Math.abs(longitudinalOffset) <= (
                    entry.dimensions.z / 2
                    + proxy.support.halfExtents.z
                    - entry.dimensions.z * 0.25
                )
            );
            if (newlyEngaged || remainsOnFork) {
                if (!entry.forkSupportActive) {
                    entry.forkSupportLateralOffset = BABYLON.Vector3.Dot(
                        supportOffset,
                        supportAxes[0],
                    );
                }
                entry.forkSupportActive = true;
                entry.forkSupportUntil = (
                    this.elapsedSeconds + FORK_SUPPORT_MEMORY_SECONDS
                );
                supported.add(entry.id);
            } else if (
                entry.forkSupportActive
                && this.elapsedSeconds <= entry.forkSupportUntil
            ) {
                supported.add(entry.id);
            } else {
                entry.forkSupportActive = false;
            }
        }
        if (supported.size > 0) {
            proxy.supportActiveUntil = (
                this.elapsedSeconds + FORK_SUPPORT_MEMORY_SECONDS
            );
        } else if (transferredLoad) {
            proxy.supportActiveUntil = Number.NEGATIVE_INFINITY;
        }
        proxy.supportActive = (
            supported.size > 0
            || this.elapsedSeconds <= proxy.supportActiveUntil
        );
        this.#setForkSupportedCargoCollision(supported);
        if (proxy.supportActive) {
            proxy.support.aggregate.body.setTargetTransform(
                supportPosition,
                supportOrientation,
            );
            proxy.support.pose.position.copyFrom(supportPosition);
            proxy.support.pose.orientation.copyFrom(supportOrientation);
        } else {
            const hiddenPosition = new BABYLON.Vector3(0, -1000, 0);
            proxy.support.aggregate.body.setTargetTransform(
                hiddenPosition,
                BABYLON.Quaternion.Identity(),
            );
            proxy.support.pose.position.copyFrom(hiddenPosition);
            proxy.support.pose.orientation.copyFrom(
                BABYLON.Quaternion.Identity(),
            );
        }
        return supported;
    }

    #stabilizeSupportedCargo(entry, proxy, deltaSeconds) {
        const orientation = entry.node.rotationQuaternion
            || BABYLON.Quaternion.Identity();
        const up = quaternionAxes(orientation)[1];
        const correction = BABYLON.Vector3.Cross(
            up,
            BABYLON.Axis.Y,
        ).scale(FORK_SUPPORT_UPRIGHT_SPEED);
        const correctionLength = correction.length();
        if (correctionLength > FORK_SUPPORT_MAX_UPRIGHT_SPEED) {
            correction.scaleInPlace(
                FORK_SUPPORT_MAX_UPRIGHT_SPEED / correctionLength,
            );
        }
        const angularVelocity = entry.aggregate.body.getAngularVelocity();
        entry.aggregate.body.setAngularVelocity(new BABYLON.Vector3(
            correction.x,
            angularVelocity.y,
            correction.z,
        ));
        const linearVelocity = entry.aggregate.body.getLinearVelocity();
        let supportedVelocity = constrainedForkLateralVelocity({
            cargoPosition: entry.node.position,
            cargoVelocity: linearVelocity,
            supportPosition: proxy.support.pose.position,
            supportOrientation: proxy.support.pose.orientation,
            lateralOffset: entry.forkSupportLateralOffset,
        });
        supportedVelocity = constrainedForkLongitudinalVelocity({
            cargoVelocity: supportedVelocity,
            supportVelocity: deltaSeconds > 1e-6
                ? proxy.carrierDelta.scale(1 / deltaSeconds)
                : BABYLON.Vector3.Zero(),
            supportOrientation: proxy.support.pose.orientation,
            deltaSeconds,
        });
        const expectedVerticalOffset = (
            entry.dimensions.y / 2
            + proxy.support.halfExtents.y
        );
        supportedVelocity = constrainedForkVerticalVelocity({
            cargoPosition: entry.node.position,
            cargoVelocity: supportedVelocity,
            supportPosition: proxy.support.pose.position,
            supportOrientation: proxy.support.pose.orientation,
            expectedVerticalOffset,
            supportVerticalSpeed: deltaSeconds > 1e-6
                ? proxy.liftDelta / deltaSeconds
                : 0,
        });
        entry.aggregate.body.setLinearVelocity(supportedVelocity);
    }

    #hasActiveForkliftContact(entry) {
        const proxy = this.forkliftProxies.get(this.activeForkliftId);
        if (!proxy) return false;
        const cargoBox = {
            position: entry.node.position,
            orientation: entry.node.rotationQuaternion,
            halfExtents: entry.dimensions.scale(0.5),
        };
        const parts = [
            proxy.chassis,
            proxy.backrest,
        ];
        if (proxy.tineCollisionActive) parts.push(...proxy.tines);
        if (proxy.supportActive) parts.push(proxy.support);
        return parts.some((part) => (
            orientedBoxesIntersect(cargoBox, {
                position: part.pose.position,
                orientation: part.pose.orientation,
                halfExtents: part.halfExtents,
            })
        ));
    }

    #cargoContactSet() {
        const connected = new Set();
        for (const entry of this.entries.values()) {
            if (this.#hasActiveForkliftContact(entry)) {
                connected.add(entry.id);
            }
        }
        let changed = true;
        while (changed) {
            changed = false;
            for (const entry of this.entries.values()) {
                if (connected.has(entry.id)) continue;
                const entryBox = {
                    position: entry.node.position,
                    orientation: entry.node.rotationQuaternion,
                    halfExtents: entry.dimensions.scale(0.5).add(
                        new BABYLON.Vector3(
                            CARGO_ISLAND_CONTACT_MARGIN,
                            CARGO_ISLAND_CONTACT_MARGIN,
                            CARGO_ISLAND_CONTACT_MARGIN,
                        ),
                    ),
                };
                for (const connectedID of connected) {
                    const other = this.entries.get(connectedID);
                    const otherBox = {
                        position: other.node.position,
                        orientation: other.node.rotationQuaternion,
                        halfExtents: other.dimensions.scale(0.5).add(
                            new BABYLON.Vector3(
                                CARGO_ISLAND_CONTACT_MARGIN,
                                CARGO_ISLAND_CONTACT_MARGIN,
                                CARGO_ISLAND_CONTACT_MARGIN,
                            ),
                        ),
                    };
                    if (!orientedBoxesIntersect(entryBox, otherBox)) continue;
                    connected.add(entry.id);
                    changed = true;
                    break;
                }
            }
        }
        return connected;
    }

    simulate(deltaSeconds) {
        if (this.disposed) return;
        const dt = Math.max(0, Math.min(0.05, deltaSeconds));
        this.elapsedSeconds += dt;
        const localID = this.localPlayerId();
        const activeForkliftProxy = this.forkliftProxies.get(
            this.activeForkliftId,
        );
        const supportedCargo = this.forkliftActive
            ? this.#supportedCargoSet()
            : new Set();
        const cargoContacts = this.forkliftActive
            ? this.#cargoContactSet()
            : new Set();
        for (const entry of this.entries.values()) {
            const touching = (
                this.forkliftActive
                && (
                    cargoContacts.has(entry.id)
                    || this.elapsedSeconds - entry.lastContactAt
                        <= CONTACT_MEMORY_SECONDS
                )
            );
            if (
                touching
                && !entry.ownerId
                && !entry.localOwner
                && this.elapsedSeconds - entry.claimAttemptAt >= 0.2
            ) {
                entry.claimAttemptAt = this.elapsedSeconds;
                this.onClaim(entry.id);
            }
            if (entry.localOwner) {
                if (supportedCargo.has(entry.id)) {
                    this.#stabilizeSupportedCargo(
                        entry,
                        activeForkliftProxy,
                        dt,
                    );
                }
                clampBodyVelocity(
                    entry.aggregate.body,
                    "getLinearVelocity",
                    "setLinearVelocity",
                    MAX_CARGO_LINEAR_SPEED,
                );
                clampBodyVelocity(
                    entry.aggregate.body,
                    "getAngularVelocity",
                    "setAngularVelocity",
                    MAX_CARGO_ANGULAR_SPEED,
                );
                entry.networkAccumulator += dt;
                const contactResumed = touching && entry.releaseSent;
                const contactEnded = !touching && !entry.releaseSent;
                if (contactResumed) entry.releaseSent = false;
                if (contactEnded) entry.releaseSent = true;
                if (
                    localID
                    && (
                        entry.networkAccumulator
                            >= CARGO_NETWORK_INTERVAL_SECONDS
                        || contactResumed
                        || contactEnded
                    )
                ) {
                    entry.networkAccumulator = 0;
                    this.onUpdate(bodyState(entry), { touching });
                }
                continue;
            }
        }
    }

    updatePresentation(deltaSeconds) {
        if (this.disposed) return;
        const dt = Math.max(0, Math.min(0.25, deltaSeconds));
        const alpha = interpolationAlpha(
            dt,
            REMOTE_INTERPOLATION_SHARPNESS,
        );
        for (const entry of this.entries.values()) {
            if (entry.localOwner) continue;
            BABYLON.Vector3.LerpToRef(
                entry.node.position,
                entry.targetPosition,
                alpha,
                entry.node.position,
            );
            entry.node.rotationQuaternion = BABYLON.Quaternion.Slerp(
                entry.node.rotationQuaternion,
                entry.targetOrientation,
                alpha,
            ).normalize();
            entry.aggregate.body.setTargetTransform(
                entry.node.position,
                entry.node.rotationQuaternion,
            );
        }
    }

    update(deltaSeconds) {
        this.simulate(deltaSeconds);
        this.updatePresentation(deltaSeconds);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        if (
            this.physicsCollisionObservable
            && this.physicsCollisionObserver
        ) {
            this.physicsCollisionObservable.remove(
                this.physicsCollisionObserver,
            );
        }
        for (const entry of this.entries.values()) {
            if (entry.collisionObserver) {
                entry.aggregate.body
                    .getCollisionObservable()
                    .remove(entry.collisionObserver);
            }
            this.bodyKinds.delete(entry.aggregate.body);
            entry.aggregate.dispose();
            for (const shape of entry.shapes) shape.dispose();
            entry.node.dispose();
        }
        this.entries.clear();
        for (const forklift of this.forkliftProxies.values()) {
            this.#disposeDynamicForklift(forklift);
            for (const proxy of [
                forklift.chassis,
                ...forklift.tines,
                forklift.support,
                forklift.backrest,
            ]) {
                this.bodyKinds.delete(proxy.aggregate.body);
                proxy.aggregate.dispose();
                proxy.shape.dispose();
                proxy.node.dispose();
            }
        }
        this.forkliftProxies.clear();
        for (const terrain of this.staticTerrain) {
            this.bodyKinds.delete(terrain.aggregate.body);
            terrain.aggregate.dispose();
            terrain.shape.dispose();
        }
        this.staticTerrain.length = 0;
        this.bodyKinds.clear();
    }
}

export { COLLISION as FORKLIFT_CARGO_COLLISION_GROUPS };
