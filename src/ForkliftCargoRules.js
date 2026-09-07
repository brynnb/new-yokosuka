import * as BABYLON from "@babylonjs/core";
import { FORKLIFT_MAXIMUM_LIFT } from "./ForkliftRig.js";

export const CARGO_CONTACT_RELEASE_SECONDS = 0.5;
export const CARGO_NETWORK_INTERVAL_SECONDS = 0.1;
export const CARGO_AUTO_RIGHT_SECONDS = 2;
export const CARGO_UPRIGHT_DOT_THRESHOLD = 0.65;
export const FORKLIFT_ENTRY_SETTLE_SECONDS = 1;

export const COLLISION = Object.freeze({
    ground: 1 << 0,
    forkliftBody: 1 << 1,
    forkliftTine: 1 << 2,
    cargoUpper: 1 << 3,
    cargoLower: 1 << 4,
    forkliftSupport: 1 << 5,
    forkSupportedCargo: 1 << 6,
});
export const ALL_COLLISIONS = Object.values(COLLISION).reduce(
    (mask, value) => mask | value,
    0,
);
export const CARGO_MASS = 38;
export const FORKLIFT_UPRIGHT_FRICTION = 0.06;
export const FORKLIFT_TIPPED_FRICTION = 0.9;
export const FORKLIFT_FRICTION_ENGAGE_UP_DOT = 0.62;
export const FORKLIFT_FRICTION_RELEASE_UP_DOT = 0.78;
export const FORKLIFT_TINE_CENTER_X = 0.498;
export const FORKLIFT_TINE_CENTER_Y = 0.075;
export const FORKLIFT_TINE_CENTER_Z = 1.213;
export const FORKLIFT_TINE_DIMENSIONS = Object.freeze({
    x: 0.12,
    y: 0.055,
    z: 1.09,
});
export const FORKLIFT_FORK_ASSEMBLY_MASS = 90;
export const FORKLIFT_HYDRAULIC_FORCE = 70000;
export const DEFAULT_FORKLIFT_PHYSICS_TUNING = Object.freeze({
    mass: 3200,
    centerOfMassHeight: 0.68,
    driveAcceleration: 6.4,
    brakeAcceleration: 20,
    rollingDeceleration: 4.8,
    maximumForwardSpeed: 9,
    maximumReverseSpeed: 5.4,
    tireGrip: 8,
    steeringGrip: 5,
    loadInfluence: 1,
    antiRollStiffness: 60000,
    antiRollDamping: 6000,
    speedControllerGain: 2.4,
    speedControllerDamping: 0.18,
    accelerationFilterResponse: 10,
    wheelMountHeight: 0.46,
    suspensionRestLength: 0.56,
    suspensionMaximumLength: 0.72,
    wheelSuspensionStiffness: 80000,
    wheelSuspensionDamping: 9000,
    wheelSuspensionMaximumForce: 32000,
    tireFrictionCoefficient: 1.05,
});
export const FORKLIFT_CHASSIS_CENTER = Object.freeze({
    x: 0,
    y: 0.875,
    z: -0.08,
});
export const FORKLIFT_HALF_TRACK = 0.55;
export const FORKLIFT_HALF_WHEELBASE = 0.52;
export const CONTACT_MEMORY_SECONDS = 0.14;
export const REMOTE_INTERPOLATION_SHARPNESS = 14;
export const CARGO_ISLAND_CONTACT_MARGIN = 0.04;
export const FORK_SUPPORT_CONTACT_MARGIN = 0.06;
export const FORK_SUPPORT_MEMORY_SECONDS = 0.18;
export const EXTERNAL_SUPPORT_CONTACT_MEMORY_SECONDS = 0.1;
export const EXTERNAL_SUPPORT_SETTLE_SECONDS = 0.05;
export const EXTERNAL_SUPPORT_NORMAL_DOT = 0.6;
export const FORK_STACK_TRANSFER_GAP = 0.16;
export const FORK_STACK_RELEASE_COOLDOWN_SECONDS = 0.25;
export const FORK_STACK_RESTING_GAP = 0.004;
export const FORK_SUPPORT_UPRIGHT_SPEED = 12;
export const FORK_SUPPORT_MAX_UPRIGHT_SPEED = 6;
export const FORK_SUPPORT_LATERAL_SPEED = 18;
export const FORK_SUPPORT_MAX_LATERAL_SPEED = 4;
export const FORK_SUPPORT_LONGITUDINAL_GRIP = 16;
export const FORK_SUPPORT_VERTICAL_SPEED = 24;
export const FORK_SUPPORT_MAX_CATCH_UP_SPEED = 0.2;
export const FORK_SUPPORT_MAX_DOWNWARD_SPEED = 2;
export const FORK_SUPPORT_MAX_CARRIER_SPEED = 1;
export const FORK_TINE_ENGAGEMENT_LIFT = 0.01;
export const FORK_CARGO_OFF_GROUND_LIFT = 0.025;
export const FORKLIFT_LOAD_BACKREST = Object.freeze({
    center: Object.freeze({ x: 0, y: 0.65, z: -0.63 }),
    dimensions: Object.freeze({ x: 1.18, y: 1.1, z: 0.08 }),
});

export function forkTineCollisionEnabled(lift, carryingCargo = false) {
    const raised = (Number(lift) || 0) > 0;
    return (
        raised
        && (
            Boolean(carryingCargo)
            || (Number(lift) || 0) > FORK_TINE_ENGAGEMENT_LIFT
        )
    );
}
export const MAX_CARGO_LINEAR_SPEED = 10;
export const MAX_CARGO_ANGULAR_SPEED = 8;

export function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

export function interpolationAlpha(deltaSeconds, sharpness) {
    return 1 - Math.exp(
        -Math.max(0, deltaSeconds) * Math.max(0, sharpness),
    );
}

export function forkliftDriveAcceleration({
    targetSpeed = 0,
    forwardSpeed = 0,
    filteredAcceleration = 0,
    gain = DEFAULT_FORKLIFT_PHYSICS_TUNING.speedControllerGain,
    damping = DEFAULT_FORKLIFT_PHYSICS_TUNING.speedControllerDamping,
    maximumDriveAcceleration = (
        DEFAULT_FORKLIFT_PHYSICS_TUNING.driveAcceleration
    ),
    maximumBrakeAcceleration = (
        DEFAULT_FORKLIFT_PHYSICS_TUNING.brakeAcceleration
    ),
} = {}) {
    const speedError = (
        (Number(targetSpeed) || 0) - (Number(forwardSpeed) || 0)
    );
    const requested = (
        speedError * Math.max(0, Number(gain) || 0)
        - (Number(filteredAcceleration) || 0)
            * Math.max(0, Number(damping) || 0)
    );
    return clamp(
        requested,
        -Math.max(0, Number(maximumBrakeAcceleration) || 0),
        Math.max(0, Number(maximumDriveAcceleration) || 0),
    );
}

export function forkliftSuspensionForce({
    hitDistance = Number.POSITIVE_INFINITY,
    restLength = DEFAULT_FORKLIFT_PHYSICS_TUNING.suspensionRestLength,
    normalSpeed = 0,
    stiffness = (
        DEFAULT_FORKLIFT_PHYSICS_TUNING.wheelSuspensionStiffness
    ),
    damping = DEFAULT_FORKLIFT_PHYSICS_TUNING.wheelSuspensionDamping,
    maximumForce = (
        DEFAULT_FORKLIFT_PHYSICS_TUNING.wheelSuspensionMaximumForce
    ),
} = {}) {
    const compression = Math.max(
        0,
        (Number(restLength) || 0) - Number(hitDistance),
    );
    if (!Number.isFinite(compression) || compression <= 0) return 0;
    return clamp(
        compression * Math.max(0, Number(stiffness) || 0)
            - (Number(normalSpeed) || 0)
                * Math.max(0, Number(damping) || 0),
        0,
        Math.max(0, Number(maximumForce) || 0),
    );
}

export function forkliftAntiRollForce({
    leftCompression = 0,
    rightCompression = 0,
    leftCompressionSpeed = 0,
    rightCompressionSpeed = 0,
    stiffness = DEFAULT_FORKLIFT_PHYSICS_TUNING.antiRollStiffness,
    damping = DEFAULT_FORKLIFT_PHYSICS_TUNING.antiRollDamping,
    leftSupportForce = 0,
    rightSupportForce = 0,
} = {}) {
    const requested = (
        ((Number(leftCompression) || 0) - (Number(rightCompression) || 0))
            * Math.max(0, Number(stiffness) || 0)
        + (
            (Number(leftCompressionSpeed) || 0)
            - (Number(rightCompressionSpeed) || 0)
        ) * Math.max(0, Number(damping) || 0)
    );
    // A passive bar can only transfer load that the unloading wheel still
    // carries. Once that wheel reaches zero support or leaves the ground, the
    // bar cannot generate an artificial upright torque to prevent rollover.
    return clamp(
        requested,
        -Math.max(0, Number(leftSupportForce) || 0),
        Math.max(0, Number(rightSupportForce) || 0),
    );
}

export function normalizedQuaternion(state) {
    const quaternion = new BABYLON.Quaternion(
        Number(state?.qx) || 0,
        Number(state?.qy) || 0,
        Number(state?.qz) || 0,
        Number(state?.qw) || 0,
    );
    if (quaternion.lengthSquared() < 0.25) {
        return BABYLON.Quaternion.Identity();
    }
    return quaternion.normalize();
}

export function bodyState(entry) {
    const linearVelocity = entry.aggregate.body.getLinearVelocity();
    const angularVelocity = entry.aggregate.body.getAngularVelocity();
    const orientation = entry.node.rotationQuaternion
        || BABYLON.Quaternion.Identity();
    return {
        id: entry.id,
        x: entry.node.position.x,
        y: entry.node.position.y,
        z: entry.node.position.z,
        qx: orientation.x,
        qy: orientation.y,
        qz: orientation.z,
        qw: orientation.w,
        velocityX: linearVelocity.x,
        velocityY: linearVelocity.y,
        velocityZ: linearVelocity.z,
        angularVelocityX: angularVelocity.x,
        angularVelocityY: angularVelocity.y,
        angularVelocityZ: angularVelocity.z,
        sleeping: (
            linearVelocity.lengthSquared() < 0.0004
            && angularVelocity.lengthSquared() < 0.0004
        ),
    };
}

export function clampBodyVelocity(body, getter, setter, maximum) {
    const velocity = body[getter]();
    const speed = velocity.length();
    if (speed <= maximum || speed <= 1e-8) return;
    body[setter](velocity.scale(maximum / speed));
}

export function setShapeFilters(shape, membership, collide) {
    shape.filterMembershipMask = membership;
    shape.filterCollideMask = collide;
}

export function quaternionAxes(quaternion) {
    const matrix = BABYLON.Matrix.Identity();
    BABYLON.Matrix.FromQuaternionToRef(quaternion, matrix);
    return [
        BABYLON.Vector3.TransformNormal(BABYLON.Axis.X, matrix).normalize(),
        BABYLON.Vector3.TransformNormal(BABYLON.Axis.Y, matrix).normalize(),
        BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, matrix).normalize(),
    ];
}

export function cargoBottomFacesDown(orientation) {
    return quaternionAxes(orientation)[1].y >= CARGO_UPRIGHT_DOT_THRESHOLD;
}

export function uprightOrientation(orientation) {
    const forward = BABYLON.Vector3.TransformNormal(
        BABYLON.Axis.Z,
        BABYLON.Matrix.FromQuaternionToRef(
            orientation,
            BABYLON.Matrix.Identity(),
        ),
    );
    const yaw = Math.atan2(forward.x, forward.z);
    return BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, yaw);
}

// Separating-axis test for two arbitrarily rotated boxes. This is also used
// before a box has a dynamic body: Havok intentionally omits contact events
// between two animated bodies, but the first fork/box contact is what grants
// the client authority to make the box dynamic.
export function orientedBoxesIntersect(first, second) {
    const firstAxes = quaternionAxes(first.orientation);
    const secondAxes = quaternionAxes(second.orientation);
    const firstHalf = first.halfExtents;
    const secondHalf = second.halfExtents;
    const rotation = Array.from({ length: 3 }, () => Array(3).fill(0));
    const absoluteRotation = Array.from(
        { length: 3 },
        () => Array(3).fill(0),
    );
    for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 3; j += 1) {
            rotation[i][j] = BABYLON.Vector3.Dot(
                firstAxes[i],
                secondAxes[j],
            );
            absoluteRotation[i][j] = Math.abs(rotation[i][j]) + 1e-6;
        }
    }
    const separation = second.position.subtract(first.position);
    const translation = firstAxes.map((axis) => (
        BABYLON.Vector3.Dot(separation, axis)
    ));
    const firstSizes = [firstHalf.x, firstHalf.y, firstHalf.z];
    const secondSizes = [secondHalf.x, secondHalf.y, secondHalf.z];

    for (let i = 0; i < 3; i += 1) {
        const secondRadius = secondSizes.reduce(
            (sum, size, j) => sum + size * absoluteRotation[i][j],
            0,
        );
        if (Math.abs(translation[i]) > firstSizes[i] + secondRadius) {
            return false;
        }
    }
    for (let j = 0; j < 3; j += 1) {
        const firstRadius = firstSizes.reduce(
            (sum, size, i) => sum + size * absoluteRotation[i][j],
            0,
        );
        const projectedTranslation = Math.abs(
            translation.reduce(
                (sum, value, i) => sum + value * rotation[i][j],
                0,
            ),
        );
        if (projectedTranslation > firstRadius + secondSizes[j]) {
            return false;
        }
    }
    for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 3; j += 1) {
            const nextI = (i + 1) % 3;
            const lastI = (i + 2) % 3;
            const nextJ = (j + 1) % 3;
            const lastJ = (j + 2) % 3;
            const firstRadius = (
                firstSizes[nextI] * absoluteRotation[lastI][j]
                + firstSizes[lastI] * absoluteRotation[nextI][j]
            );
            const secondRadius = (
                secondSizes[nextJ] * absoluteRotation[i][lastJ]
                + secondSizes[lastJ] * absoluteRotation[i][nextJ]
            );
            const projectedTranslation = Math.abs(
                translation[lastI] * rotation[nextI][j]
                - translation[nextI] * rotation[lastI][j]
            );
            if (projectedTranslation > firstRadius + secondRadius) {
                return false;
            }
        }
    }
    return true;
}

export function cargoNearSupportBelow(
    cargo,
    support,
    maximumGap = FORK_STACK_TRANSFER_GAP,
) {
    if (
        !cargo?.position
        || !cargo?.orientation
        || !cargo?.halfExtents
        || !support?.position
        || !support?.orientation
        || !support?.halfExtents
    ) {
        return false;
    }
    const cargoAxes = quaternionAxes(cargo.orientation);
    const supportAxes = quaternionAxes(support.orientation);
    const cargoUp = cargoAxes[1];
    if (BABYLON.Vector3.Dot(cargoUp, BABYLON.Axis.Y) < 0.65) {
        return false;
    }
    const supportOffset = support.position.subtract(cargo.position);
    const supportCenterAlongUp = BABYLON.Vector3.Dot(
        supportOffset,
        cargoUp,
    );
    if (supportCenterAlongUp >= 0) return false;
    const supportRadiusAlongUp = [
        support.halfExtents.x,
        support.halfExtents.y,
        support.halfExtents.z,
    ].reduce((radius, halfExtent, axisIndex) => (
        radius
        + halfExtent * Math.abs(BABYLON.Vector3.Dot(
            supportAxes[axisIndex],
            cargoUp,
        ))
    ), 0);
    const gap = (
        -cargo.halfExtents.y
        - (supportCenterAlongUp + supportRadiusAlongUp)
    );
    const clearance = Math.max(0, Number(maximumGap) || 0);
    if (gap < -0.08 || gap > clearance) return false;

    // Extend only the carried box downward by the permitted clearance. The
    // regular OBB test then proves horizontal overlap without treating a box
    // beside the load as a surface underneath it.
    return orientedBoxesIntersect({
        position: cargo.position.subtract(cargoUp.scale(clearance / 2)),
        orientation: cargo.orientation,
        halfExtents: new BABYLON.Vector3(
            cargo.halfExtents.x,
            cargo.halfExtents.y + clearance / 2,
            cargo.halfExtents.z,
        ),
    }, support);
}

export function cargoRestingPoseOnSupport(
    cargo,
    support,
    maximumGap = FORK_STACK_TRANSFER_GAP,
) {
    if (!cargoNearSupportBelow(cargo, support, maximumGap)) return null;
    const orientation = uprightOrientation(cargo.orientation);
    const supportAxes = quaternionAxes(support.orientation);
    const supportHalfExtents = [
        support.halfExtents.x,
        support.halfExtents.y,
        support.halfExtents.z,
    ];
    const supportRadiusY = supportAxes.reduce((radius, axis, index) => (
        radius
        + supportHalfExtents[index] * Math.abs(
            BABYLON.Vector3.Dot(axis, BABYLON.Axis.Y),
        )
    ), 0);
    return {
        position: new BABYLON.Vector3(
            cargo.position.x,
            support.position.y
                + supportRadiusY
                + cargo.halfExtents.y
                + FORK_STACK_RESTING_GAP,
            cargo.position.z,
        ),
        orientation,
    };
}

export function cargoColliderBands(dimensions) {
    return {
        upper: {
            center: new BABYLON.Vector3(0, dimensions.y * 0.05, 0),
            extents: new BABYLON.Vector3(
                dimensions.x,
                dimensions.y * 0.9,
                dimensions.z,
            ),
        },
        lower: {
            center: new BABYLON.Vector3(0, -dimensions.y * 0.45, 0),
            extents: new BABYLON.Vector3(
                dimensions.x,
                dimensions.y * 0.1,
                dimensions.z,
            ),
        },
    };
}

export function cargoSupportedByForklift(
    cargo,
    tines,
    margin = FORK_SUPPORT_CONTACT_MARGIN,
) {
    if (!cargo?.position || !cargo?.orientation || !cargo?.dimensions) {
        return false;
    }
    if (!Array.isArray(tines) || tines.length < 2) return false;
    const pair = tines.slice(0, 2);
    if (pair.some((tine) => (
        !tine?.position
        || !tine?.orientation
        || !tine?.halfExtents
    ))) {
        return false;
    }
    const axes = quaternionAxes(cargo.orientation);
    const tineAxes = quaternionAxes(pair[0].orientation);
    const pairOffset = pair[1].position.subtract(pair[0].position);
    // Both physical tines form one rigid support plane. Reject malformed or
    // unrelated probes that are staggered front-to-back, while allowing the
    // cargo itself to sit at an angle across that plane.
    if (
        Math.abs(BABYLON.Vector3.Dot(pairOffset, tineAxes[2]))
        > pair[0].halfExtents.z * 0.2 + margin
    ) {
        return false;
    }
    const supportCenter = pair[0].position.add(pair[1].position).scale(0.5);
    const supportOffset = supportCenter.subtract(cargo.position);
    const centerX = BABYLON.Vector3.Dot(supportOffset, axes[0]);
    const centerY = BABYLON.Vector3.Dot(supportOffset, axes[1]);
    const centerZ = BABYLON.Vector3.Dot(supportOffset, axes[2]);
    const halfWidth = cargo.dimensions.x / 2;
    const halfDepth = cargo.dimensions.z / 2;
    const lowerCenterY = -cargo.dimensions.y * 0.45;
    const lowerHalfHeight = cargo.dimensions.y * 0.05;
    if (
        Math.abs(centerX) > halfWidth + margin * 3
        || Math.abs(centerZ) > halfDepth + margin * 2
        || Math.abs(centerY - lowerCenterY)
            > lowerHalfHeight + pair[0].halfExtents.y + margin * 1.5
    ) {
        return false;
    }
    return pair.every((tine) => {
        const offset = tine.position.subtract(cargo.position);
        const localX = BABYLON.Vector3.Dot(offset, axes[0]);
        const localY = BABYLON.Vector3.Dot(offset, axes[1]);
        const orientedHalfWidth = tine.halfExtents.x
            * Math.abs(BABYLON.Vector3.Dot(tineAxes[0], axes[0]))
            + tine.halfExtents.y
                * Math.abs(BABYLON.Vector3.Dot(tineAxes[1], axes[0]))
            + tine.halfExtents.z
                * Math.abs(BABYLON.Vector3.Dot(tineAxes[2], axes[0]));
        return (
            Math.abs(localX) <= halfWidth + orientedHalfWidth + margin
            && Math.abs(localY - lowerCenterY)
                <= lowerHalfHeight + tine.halfExtents.y + margin * 1.5
        );
    });
}

export function constrainedForkLateralVelocity({
    cargoPosition,
    cargoVelocity,
    supportPosition,
    supportOrientation,
    lateralOffset,
}) {
    const lateralAxis = quaternionAxes(supportOrientation)[0];
    const currentOffset = BABYLON.Vector3.Dot(
        cargoPosition.subtract(supportPosition),
        lateralAxis,
    );
    const offsetError = lateralOffset - currentOffset;
    const desiredLateralSpeed = Math.max(
        -FORK_SUPPORT_MAX_LATERAL_SPEED,
        Math.min(
            FORK_SUPPORT_MAX_LATERAL_SPEED,
            offsetError * FORK_SUPPORT_LATERAL_SPEED,
        ),
    );
    const currentLateralSpeed = BABYLON.Vector3.Dot(
        cargoVelocity,
        lateralAxis,
    );
    return cargoVelocity.add(
        lateralAxis.scale(desiredLateralSpeed - currentLateralSpeed),
    );
}

export function constrainedForkVerticalVelocity({
    cargoPosition,
    cargoVelocity,
    supportPosition,
    supportOrientation,
    expectedVerticalOffset,
    supportVerticalSpeed,
}) {
    const verticalAxis = quaternionAxes(supportOrientation)[1];
    const currentOffset = BABYLON.Vector3.Dot(
        cargoPosition.subtract(supportPosition),
        verticalAxis,
    );
    const currentSpeed = BABYLON.Vector3.Dot(
        cargoVelocity,
        verticalAxis,
    );
    const carrierSpeed = Math.max(
        -FORK_SUPPORT_MAX_CARRIER_SPEED,
        Math.min(
            FORK_SUPPORT_MAX_CARRIER_SPEED,
            Number.isFinite(supportVerticalSpeed)
                ? supportVerticalSpeed
                : 0,
        ),
    );
    const correction = (
        (expectedVerticalOffset - currentOffset)
        * FORK_SUPPORT_VERTICAL_SPEED
    );
    const maximumUpwardSpeed = Math.max(0, carrierSpeed)
        + FORK_SUPPORT_MAX_CATCH_UP_SPEED;
    const upwardSupportSpeed = Math.max(
        0,
        Math.min(maximumUpwardSpeed, carrierSpeed + correction),
    );
    // A fork can push a load upward and arrest an upward launch, but it
    // cannot pull a load down. Gravity and real contacts decide whether the
    // cargo follows descending tines or remains on a surface beneath it.
    let desiredSpeed = currentSpeed;
    if (currentSpeed > upwardSupportSpeed) {
        desiredSpeed = upwardSupportSpeed;
    } else if (carrierSpeed > 0 || correction > 0) {
        desiredSpeed = upwardSupportSpeed;
    }
    return cargoVelocity.add(
        verticalAxis.scale(desiredSpeed - currentSpeed),
    );
}

export function cargoContactSupportsFromBelow({
    cargoPosition,
    cargoOrientation,
    contactPoint,
    contactNormal,
}) {
    if (!cargoPosition || !cargoOrientation || !contactNormal) return false;
    const up = quaternionAxes(cargoOrientation)[1];
    // Havok reports the observable body's contact normal toward the body it
    // struck. A floor beneath the cargo therefore points along cargo -up.
    if (
        BABYLON.Vector3.Dot(contactNormal, up)
        > -EXTERNAL_SUPPORT_NORMAL_DOT
    ) {
        return false;
    }
    return (
        !contactPoint
        || BABYLON.Vector3.Dot(
            contactPoint.subtract(cargoPosition),
            up,
        ) < 0
    );
}

export function constrainedForkLongitudinalVelocity({
    cargoVelocity,
    supportVelocity,
    supportOrientation,
    deltaSeconds,
}) {
    const longitudinalAxis = quaternionAxes(supportOrientation)[2];
    const currentSpeed = BABYLON.Vector3.Dot(
        cargoVelocity,
        longitudinalAxis,
    );
    const carrierSpeed = BABYLON.Vector3.Dot(
        supportVelocity,
        longitudinalAxis,
    );
    const maximumChange = (
        FORK_SUPPORT_LONGITUDINAL_GRIP
        * Math.max(0, deltaSeconds)
    );
    const speedDelta = Math.max(
        -maximumChange,
        Math.min(maximumChange, carrierSpeed - currentSpeed),
    );
    return cargoVelocity.add(longitudinalAxis.scale(speedDelta));
}

export function collisionGroupsCanCollide(
    firstMembership,
    firstCollide,
    secondMembership,
    secondCollide,
) {
    return Boolean(
        (firstMembership & secondCollide)
        && (secondMembership & firstCollide)
    );
}

export function cargoMembershipWithForkSupport(
    membership,
    forkSupported = false,
) {
    return forkSupported
        ? membership | COLLISION.forkSupportedCargo
        : membership;
}

export function worldPoseForLocalPoint(root, localPoint) {
    root.computeWorldMatrix(true);
    const world = root.getWorldMatrix();
    const position = BABYLON.Vector3.TransformCoordinates(localPoint, world);
    const scaling = BABYLON.Vector3.One();
    const orientation = BABYLON.Quaternion.Identity();
    const translation = BABYLON.Vector3.Zero();
    world.decompose(scaling, orientation, translation);
    return { position, orientation: orientation.normalize() };
}

export function transformedDirection(direction, orientation) {
    return BABYLON.Vector3.TransformNormal(
        direction,
        BABYLON.Matrix.FromQuaternionToRef(
            orientation,
            BABYLON.Matrix.Identity(),
        ),
    ).normalize();
}

export function transformedPoint(position, localPoint, orientation) {
    return position.add(
        BABYLON.Vector3.TransformNormal(
            localPoint,
            BABYLON.Matrix.FromQuaternionToRef(
                orientation,
                BABYLON.Matrix.Identity(),
            ),
        ),
    );
}

export function approachValue(current, target, maximumChange) {
    if (current < target) return Math.min(target, current + maximumChange);
    if (current > target) return Math.max(target, current - maximumChange);
    return target;
}

export function forkliftChassisFriction(upDot, currentFriction) {
    if (Number(upDot) <= FORKLIFT_FRICTION_ENGAGE_UP_DOT) {
        return FORKLIFT_TIPPED_FRICTION;
    }
    if (Number(upDot) >= FORKLIFT_FRICTION_RELEASE_UP_DOT) {
        return FORKLIFT_UPRIGHT_FRICTION;
    }
    return currentFriction === FORKLIFT_TIPPED_FRICTION
        ? FORKLIFT_TIPPED_FRICTION
        : FORKLIFT_UPRIGHT_FRICTION;
}

export function forkliftCompoundTineTranslation(x, lift = 0) {
    return new BABYLON.Vector3(
        Number(x) || 0,
        FORKLIFT_TINE_CENTER_Y + Math.max(0, Number(lift) || 0)
            - FORKLIFT_CHASSIS_CENTER.y,
        FORKLIFT_TINE_CENTER_Z - FORKLIFT_CHASSIS_CENTER.z,
    );
}

export function forkliftCompoundTineCollideMask(lift) {
    return (
        COLLISION.ground
        | COLLISION.forkliftBody
        | (
            forkTineCollisionEnabled(lift)
                ? COLLISION.cargoUpper
                : 0
        )
    );
}

export function forkliftBodyCollideMask() {
    return (
        COLLISION.ground
        | COLLISION.forkliftBody
        | COLLISION.forkliftTine
        | COLLISION.cargoUpper
        | COLLISION.cargoLower
    );
}

export function forkliftTireSlipSpeed(
    lateralSpeed,
    yawRate,
    desiredYawRate,
) {
    const lateral = Number(lateralSpeed) || 0;
    const rotationalScrub = (
        ((Number(desiredYawRate) || 0) - (Number(yawRate) || 0))
        * FORKLIFT_HALF_WHEELBASE
    );
    return Math.hypot(lateral, rotationalScrub);
}

export function forkliftConstrainedLift(
    chassisPosition,
    forkPosition,
    chassisOrientation,
) {
    const up = transformedDirection(
        BABYLON.Axis.Y,
        chassisOrientation,
    );
    const base = forkliftCompoundTineTranslation(0, 0).y;
    return clamp(
        BABYLON.Vector3.Dot(
            forkPosition.subtract(chassisPosition),
            up,
        ) - base,
        0,
        FORKLIFT_MAXIMUM_LIFT,
    );
}

export function forkliftEntryIsSettling(settleUntil, elapsedSeconds) {
    return (
        Number.isFinite(settleUntil)
        && Number(elapsedSeconds) < settleUntil
    );
}

export function forkliftCenterOfMass({
    baseHeight,
    load,
    lift,
    loadInfluence,
}) {
    const loadAmount = clamp(Number(load) || 0, 0, 1);
    const liftAmount = clamp(Number(lift) || 0, 0, 1);
    const strength = (
        loadAmount * Math.max(0, Number(loadInfluence) || 0)
    );
    // A load is forward of the axle even when carried low. Raising it then
    // adds vertical leverage and a smaller additional forward shift.
    const forwardShift = strength * (0.18 + liftAmount * 0.07);
    const verticalShift = strength * liftAmount * 0.3;
    return new BABYLON.Vector3(
        0,
        (Number(baseHeight) || 0)
            - FORKLIFT_CHASSIS_CENTER.y
            + verticalShift,
        forwardShift,
    );
}
