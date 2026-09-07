import * as BABYLON from "@babylonjs/core";

export const FORKLIFT_CRATE_HEIGHT = 1.02;
export const FORKLIFT_ORIGINAL_MAXIMUM_LIFT = 2.1576;
export const FORKLIFT_MAXIMUM_LIFT = (
    FORKLIFT_ORIGINAL_MAXIMUM_LIFT + FORKLIFT_CRATE_HEIGHT
);

const DEFAULT_OPTIONS = Object.freeze({
    maximumForwardSpeed: 9,
    maximumReverseSpeed: 5.4,
    acceleration: 6.4,
    braking: 20,
    rollingDrag: 4.8,
    stopSpeed: 0.24,
    maximumSteeringAngle: 0.55,
    steeringResponse: 3.8,
    // Preserve the forklift's tight low-speed maneuvering while making a
    // full steering-lock input build more gradually near maximum speed.
    highSpeedSteeringResponseFraction: 0.35,
    wheelbase: 1.3,
    // The articulated wheel nodes' visible roll advances at the equivalent
    // of a 0.615-unit radius. Using the raw mesh-profile radius made them
    // appear to rotate about three times too quickly.
    wheelRadius: 0.615,
    liftSpeed: 1.275,
    maximumLift: FORKLIFT_MAXIMUM_LIFT,
    minimumLiftSnapFraction: 0.01,
});

const MAST_EXTENSION = Object.freeze({
    leftX: -0.18595,
    rightX: 0.1857,
    width: 0.1049,
    depth: 0.035,
    z: -0.6707,
    fixedBottomY: 1.7522,
    movingTopBindY: 0.12,
});

const TINE_COLLISION = Object.freeze({
    leftX: -0.498,
    rightX: 0.498,
    y: 0.12,
    tipZ: -1.756,
});

function approach(current, target, maximumChange) {
    if (current < target) return Math.min(target, current + maximumChange);
    if (current > target) return Math.max(target, current - maximumChange);
    return target;
}

export function createForkliftState(overrides = {}) {
    return {
        speed: 0,
        steeringAngle: 0,
        wheelRoll: 0,
        lift: 0,
        ...overrides,
    };
}

export function advanceForkliftState(
    state,
    input,
    deltaSeconds,
    options = {},
) {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const dt = Math.max(0, Math.min(0.05, deltaSeconds));
    const throttle = Math.max(-1, Math.min(1, input?.throttle || 0));
    const steering = Math.max(-1, Math.min(1, input?.steering || 0));
    const liftInput = Math.max(-1, Math.min(1, input?.lift || 0));
    const targetSpeed = throttle >= 0
        ? throttle * config.maximumForwardSpeed
        : throttle * config.maximumReverseSpeed;
    const changingDirection = (
        throttle !== 0
        && state.speed !== 0
        && Math.sign(throttle) !== Math.sign(state.speed)
    );
    const speedResponse = throttle === 0
        ? config.rollingDrag
        : changingDirection
            ? config.braking
            : config.acceleration;
    let speed = approach(state.speed, targetSpeed, speedResponse * dt);
    // Remove the final sub-visible creep. At this speed the vehicle can still
    // advance by tiny collision steps even though the calibrated wheel roll
    // is too small to perceive, making the wheels appear to stop first.
    if (throttle === 0 && Math.abs(speed) <= config.stopSpeed) speed = 0;
    const speedLimit = state.speed >= 0
        ? config.maximumForwardSpeed
        : config.maximumReverseSpeed;
    const speedFraction = Math.max(
        0,
        Math.min(1, Math.abs(state.speed) / Math.max(0.001, speedLimit)),
    );
    const highSpeedResponseFraction = Math.max(
        0,
        Math.min(1, config.highSpeedSteeringResponseFraction),
    );
    const steeringResponseScale = (
        1 - speedFraction * (1 - highSpeedResponseFraction)
    );
    const steeringAngle = approach(
        state.steeringAngle,
        steering * config.maximumSteeringAngle,
        config.steeringResponse * steeringResponseScale * dt,
    );
    const distance = speed * dt;
    const yawDelta = (
        distance / config.wheelbase * Math.tan(steeringAngle)
    );
    let lift = Math.max(
        0,
        Math.min(
            config.maximumLift,
            state.lift + liftInput * config.liftSpeed * dt,
        ),
    );
    // When lowering or releasing the lift, make the bottom one percent a
    // positive detent. Besides keeping the display honest, this guarantees
    // that the collision-free threading state is an exact zero.
    if (
        liftInput <= 0
        && lift < config.maximumLift * config.minimumLiftSnapFraction
    ) {
        lift = 0;
    }
    return {
        speed,
        steeringAngle,
        // MT5's wheel-node axis is opposite the browser vehicle's +Z travel.
        wheelRoll: state.wheelRoll - distance / config.wheelRadius,
        lift,
        distance,
        yawDelta,
    };
}

function nodeWithFlag(root, flag) {
    return (root?._mt5Nodes || []).find((node) => node.flag === flag);
}

function bindTransform(node) {
    return {
        position: node.mesh.position.clone(),
        rotationQuaternion: (
            node.mesh.rotationQuaternion?.clone()
            || BABYLON.Quaternion.FromEulerVector(node.mesh.rotation)
        ).normalize(),
    };
}

function applyLocalRotation(node, binding, x = 0, y = 0, z = 0) {
    const articulation = BABYLON.Quaternion.FromEulerAngles(x, y, z);
    node.mesh.rotationQuaternion = binding.rotationQuaternion
        .multiply(articulation)
        .normalize();
    node.mesh.rotation.setAll(0);
}

function hierarchyLocalBounds(root) {
    root.computeWorldMatrix(true);
    const bounds = root.getHierarchyBoundingVectors(true);
    const inverseWorld = root.getWorldMatrix().clone().invert();
    const minimum = new BABYLON.Vector3(
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
    );
    const maximum = new BABYLON.Vector3(
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
    );
    for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
            for (const z of [bounds.min.z, bounds.max.z]) {
                const local = BABYLON.Vector3.TransformCoordinates(
                    new BABYLON.Vector3(x, y, z),
                    inverseWorld,
                );
                minimum.minimizeInPlace(local);
                maximum.maximizeInPlace(local);
            }
        }
    }
    return { minimum, maximum };
}

export function groundLiftForBounds(bounds, pitch = 0, roll = 0) {
    const { minimum, maximum } = bounds;
    const rotation = BABYLON.Matrix.RotationYawPitchRoll(
        0,
        Number(pitch) || 0,
        Number(roll) || 0,
    );
    let rotatedMinimumY = Number.POSITIVE_INFINITY;
    for (const x of [minimum.x, maximum.x]) {
        for (const y of [minimum.y, maximum.y]) {
            for (const z of [minimum.z, maximum.z]) {
                const rotated = BABYLON.Vector3.TransformCoordinates(
                    new BABYLON.Vector3(x, y, z),
                    rotation,
                );
                rotatedMinimumY = Math.min(
                    rotatedMinimumY,
                    rotated.y,
                );
            }
        }
    }
    return Math.max(0, minimum.y - rotatedMinimumY);
}

export class ForkliftRig {
    constructor(root) {
        this.root = root;
        this.fork = nodeWithFlag(root, 0x03);
        this.frontAxle = nodeWithFlag(root, 0x08);
        this.steeringWheel = nodeWithFlag(root, 0x9a);
        this.leftRearWheel = nodeWithFlag(root, 0x12);
        this.rightRearWheel = nodeWithFlag(root, 0x17);
        const required = [
            ["fork", this.fork],
            ["front axle", this.frontAxle],
            ["steering wheel", this.steeringWheel],
            ["left rear wheel", this.leftRearWheel],
            ["right rear wheel", this.rightRearWheel],
        ];
        const missing = required
            .filter(([, node]) => !node?.mesh)
            .map(([label]) => label);
        if (missing.length > 0) {
            throw new Error(
                `Forklift model is missing articulated ${missing.join(", ")}.`,
            );
        }
        this.chassisBounds = hierarchyLocalBounds(root);
        this.bind = {
            fork: bindTransform(this.fork),
            frontAxle: bindTransform(this.frontAxle),
            steeringWheel: bindTransform(this.steeringWheel),
            leftRearWheel: bindTransform(this.leftRearWheel),
            rightRearWheel: bindTransform(this.rightRearWheel),
        };
        this.mastExtensionMaterial = new BABYLON.StandardMaterial(
            `${root.name}_mast_extension_material`,
            root.getScene(),
        );
        this.mastExtensionMaterial.diffuseColor.set(0.12, 0.13, 0.12);
        this.mastExtensionMaterial.specularColor.set(0.22, 0.22, 0.2);
        this.mastExtensionBars = [
            MAST_EXTENSION.leftX,
            MAST_EXTENSION.rightX,
        ].map((x, index) => {
            const bar = BABYLON.MeshBuilder.CreateBox(
                `${root.name}_mast_extension_${index}`,
                {
                    width: MAST_EXTENSION.width,
                    height: 1,
                    depth: MAST_EXTENSION.depth,
                },
                root.getScene(),
            );
            bar.parent = root;
            bar.position.set(
                x,
                MAST_EXTENSION.fixedBottomY,
                MAST_EXTENSION.z,
            );
            bar.material = this.mastExtensionMaterial;
            bar.isPickable = false;
            bar.checkCollisions = false;
            bar.metadata = {
                ...(bar.metadata || {}),
                playerVehicle: true,
                forkliftMastExtension: true,
            };
            bar.setEnabled(false);
            return bar;
        });
    }

    apply(state) {
        this.fork.mesh.position.y = this.bind.fork.position.y + state.lift;
        applyLocalRotation(
            this.frontAxle,
            this.bind.frontAxle,
            state.wheelRoll,
        );
        // A forklift steers from the rear. The wheel yaw is opposite the
        // vehicle's nose direction while the steering wheel follows input.
        for (const [name, node] of [
            ["leftRearWheel", this.leftRearWheel],
            ["rightRearWheel", this.rightRearWheel],
        ]) {
            applyLocalRotation(
                node,
                this.bind[name],
                state.wheelRoll,
                -state.steeringAngle,
            );
        }
        applyLocalRotation(
            this.steeringWheel,
            this.bind.steeringWheel,
            0,
            0,
            state.steeringAngle * 2.2,
        );
        const extensionTop = MAST_EXTENSION.movingTopBindY + state.lift;
        const extensionHeight = Math.max(
            0,
            extensionTop - MAST_EXTENSION.fixedBottomY,
        );
        for (const bar of this.mastExtensionBars) {
            bar.setEnabled(extensionHeight > 0.002);
            bar.position.y = (
                MAST_EXTENSION.fixedBottomY + extensionHeight / 2
            );
            bar.scaling.y = Math.max(extensionHeight, 0.001);
        }
    }

    reset() {
        this.apply(createForkliftState());
    }

    tineTipWorldPositions(state) {
        this.root.computeWorldMatrix(true);
        const world = this.root.getWorldMatrix();
        return [
            TINE_COLLISION.leftX,
            TINE_COLLISION.rightX,
        ].map((x) => BABYLON.Vector3.TransformCoordinates(
            new BABYLON.Vector3(
                x,
                TINE_COLLISION.y + state.lift,
                TINE_COLLISION.tipZ,
            ),
            world,
        ));
    }

    groundLiftForPose(pitch = 0, roll = 0) {
        return groundLiftForBounds(this.chassisBounds, pitch, roll);
    }
}

export { DEFAULT_OPTIONS as DEFAULT_FORKLIFT_OPTIONS };
export { MAST_EXTENSION as FORKLIFT_MAST_EXTENSION };
export { TINE_COLLISION as FORKLIFT_TINE_COLLISION };
