const TURN_TO_RADIANS = Math.PI * 2 / 65536;

const PARENTS = [
    null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 3, 11, 12, 13, 14, 15, 16,
    0, 18, 19, 20, 21, 22, 22, 20, 25, 26, 27, 28, 29, 20, 31, 32,
    33, 34, 35,
];

const TYPES = [
    0x00, 0x13, 0x14, 0x15, 0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x22,
    0x23, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x01, 0x02,
    0x03, 0x04, 0x05, 0x06, 0x2f, 0x07, 0x08, 0x09, 0x0a, 0x0b,
    0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12,
];

const SOLVER_CLASSES = [
    6, 2, 3, 4, 0, 2, 3, 3, 4, 1, 1, 0, 2, 3, 3, 4, 1, 1,
    2, 3, 4, 2, 3, 4, 1, 0, 2, 3, 3, 4, 1, 0, 2, 3, 3, 4, 1,
];

const SOLVER_SUBTYPES = [
    0, 1, 1, 0, 0, 2, 1, 1, 0, 0, 0, 0, 2, 1, 1, 0, 0, 0,
    1, 0, 0, 1, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 2, 1, 0, 0, 0,
];

const DEFAULT_POSITIONS = [
    [0, 1.150399923, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0.251261979, 0, 0],
    [-0.109730996, 0, 0.055834997],
    [0.049935997, 0, 0.035836998],
    [0, 0, 0],
    [0.392728984, 0, 0],
    [0.444607973, 0, 0],
    [0, 0, 0],
    [-0.000001, -0.088239998, -0.115664996],
    [-0.109731995, 0, -0.055836998],
    [0.049936999, 0, -0.035834998],
    [0, 0, 0],
    [0.392728984, 0, 0],
    [0.444623977, 0, 0],
    [0, 0, 0],
    [0, -0.088239998, -0.115664996],
    [0, 0, 0],
    [0, 0, 0],
    [0.380851984, 0, 0],
    [0, 0.000001, 0.000001],
    [0, 0, 0],
    [0.209384993, 0, 0],
    [0, 0, 0],
    [-0.12563099, 0, -0.055833999],
    [0.016950998, 0, -0.168589994],
    [0, 0, 0],
    [0.242529988, 0, 0],
    [0.250657976, 0, 0],
    [0, 0, 0],
    [-0.125631988, 0, 0.055837996],
    [0.016944999, 0, 0.168565989],
    [0, 0, 0],
    [0.242524996, 0, 0],
    [0.250664979, 0, 0],
    [0, 0, 0],
];

const DEFAULT_ROTATIONS = [
    [0, 0, 0], [0, 0, 16384], [0, 0, 0], [0, 0, 0], [0, 0, 0],
    [0, 0, 0], [0, 0, -16383], [0, 0, 0], [0, 0, 0], [0, 0, 0],
    [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, -16329], [0, 0, -102],
    [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 16384], [0, 0, 16384],
    [0, 0, 0], [-32768, 0, -16384], [0, 0, 16384], [0, 0, 0],
    [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, -16384], [0, 0, 0],
    [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, -16451],
    [0, 0, 133], [0, 0, 0], [0, 0, 0],
];

function childrenFor(parent) {
    return PARENTS
        .map((candidate, index) => candidate === parent ? index : null)
        .filter((index) => index !== null);
}

export const RYO_RUNTIME_RIG = Object.freeze(PARENTS.map((parent, index) => Object.freeze({
    index,
    type: TYPES[index],
    solverClass: SOLVER_CLASSES[index],
    solverSubtype: SOLVER_SUBTYPES[index],
    parent,
    children: Object.freeze(childrenFor(index)),
    defaultPosition: Object.freeze(DEFAULT_POSITIONS[index]),
    defaultRotationRaw: Object.freeze(DEFAULT_ROTATIONS[index]),
})));

export function rowIdentity() {
    return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    ];
}

export function rowMultiply(left, right) {
    const result = new Array(16).fill(0);
    for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
            for (let inner = 0; inner < 4; inner++) {
                result[row * 4 + column] += (
                    left[row * 4 + inner] * right[inner * 4 + column]
                );
            }
        }
    }
    return result;
}

function rowRotationX(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
        1, 0, 0, 0,
        0, cos, sin, 0,
        0, -sin, cos, 0,
        0, 0, 0, 1,
    ];
}

function rowRotationY(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
        cos, 0, -sin, 0,
        0, 1, 0, 0,
        sin, 0, cos, 0,
        0, 0, 0, 1,
    ];
}

function rowRotationZ(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
        cos, sin, 0, 0,
        -sin, cos, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    ];
}

function rowTranslation(position) {
    return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        position[0], position[1], position[2], 1,
    ];
}

export function rowEulerRaw(rawAngles) {
    const radians = rawAngles.map((angle) => angle * TURN_TO_RADIANS);
    return rowMultiply(
        rowMultiply(rowRotationX(radians[0]), rowRotationY(radians[1])),
        rowRotationZ(radians[2]),
    );
}

function localControlMatrix(control, rig) {
    // A class-4 record without a translation curve is a fixed endpoint. Its
    // live position fields are solver scratch data, not the endpoint's local
    // translation (Ryo control 3 is the observed case).
    const position = rig?.solverClass === 4
        && control.translationCurveAddress === 0
        ? rig.defaultPosition
        : control.position;
    return rowMultiply(
        rowEulerRaw(control.rotationRaw),
        rowTranslation(position),
    );
}

function add(left, right) {
    return left.map((value, index) => value + right[index]);
}

function subtract(left, right) {
    return left.map((value, index) => value - right[index]);
}

function scale(vector, scalar) {
    return vector.map((value) => value * scalar);
}

function dot(left, right) {
    return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function cross(left, right) {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ];
}

function normalize(vector) {
    const length = Math.hypot(...vector);
    if (length <= 1e-12) throw new Error("Cannot normalize a zero-length rig vector.");
    return scale(vector, 1 / length);
}

function positionOf(matrix) {
    return matrix.slice(12, 15);
}

function inverseRigidRow(matrix) {
    const position = positionOf(matrix);
    return [
        matrix[0], matrix[4], matrix[8], 0,
        matrix[1], matrix[5], matrix[9], 0,
        matrix[2], matrix[6], matrix[10], 0,
        -dot(position, matrix.slice(0, 3)),
        -dot(position, matrix.slice(4, 7)),
        -dot(position, matrix.slice(8, 11)),
        1,
    ];
}

function localPoint(worldPoint, matrix) {
    const delta = subtract(worldPoint, positionOf(matrix));
    return [
        dot(delta, matrix.slice(0, 3)),
        dot(delta, matrix.slice(4, 7)),
        dot(delta, matrix.slice(8, 11)),
    ];
}

function aimBasis(parentMatrix, rootPosition, targetPosition) {
    const direction = normalize(subtract(targetPosition, rootPosition));
    const parentZ = parentMatrix.slice(8, 11);
    const planeNormal = normalize(subtract(
        parentZ,
        scale(direction, dot(parentZ, direction)),
    ));
    return { direction, planeNormal };
}

function aimedMatrix(direction, planeNormal, position) {
    const middle = normalize(cross(planeNormal, direction));
    return [
        ...direction, 0,
        ...middle, 0,
        ...planeNormal, 0,
        ...position, 1,
    ];
}

function solveOneBone(parentMatrix, aimPosition, length) {
    const rootPosition = positionOf(parentMatrix);
    const basis = aimBasis(parentMatrix, rootPosition, aimPosition);
    const endpoint = add(rootPosition, scale(basis.direction, length));
    return {
        upper: aimedMatrix(basis.direction, basis.planeNormal, rootPosition),
        target: aimedMatrix(basis.direction, basis.planeNormal, endpoint),
    };
}

function solveTwoBone(parentMatrix, targetPosition, upperLength, lowerLength, bendSubtype) {
    const rootPosition = positionOf(parentMatrix);
    const targetDelta = subtract(targetPosition, rootPosition);
    const targetDistance = Math.hypot(...targetDelta);
    const targetDirection = normalize(targetDelta);
    const { planeNormal } = aimBasis(parentMatrix, rootPosition, targetPosition);
    const along = Math.max(
        -upperLength,
        Math.min(
            upperLength,
            (
                upperLength * upperLength
                + targetDistance * targetDistance
                - lowerLength * lowerLength
            ) / (2 * targetDistance),
        ),
    );
    const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    const bendDirection = bendSubtype === 0
        ? cross(targetDirection, planeNormal)
        : cross(planeNormal, targetDirection);
    const jointPosition = add(
        add(rootPosition, scale(targetDirection, along)),
        scale(bendDirection, height),
    );
    const upperDirection = normalize(subtract(jointPosition, rootPosition));
    const lowerDirection = normalize(subtract(targetPosition, jointPosition));
    return {
        upper: aimedMatrix(upperDirection, planeNormal, rootPosition),
        lower: aimedMatrix(lowerDirection, planeNormal, jointPosition),
        target: aimedMatrix(lowerDirection, planeNormal, targetPosition),
    };
}

// Reproduces 0x0C091730's X-forward frame for the shoulder correction. Like
// the IK solvers, it removes the forward component from the local Z axis.
function xForwardFrame(vector) {
    const forward = normalize(vector);
    const localZ = [0, 0, 1];
    const planeNormal = normalize(subtract(
        localZ,
        scale(forward, dot(localZ, forward)),
    ));
    return aimedMatrix(forward, planeNormal, [0, 0, 0]);
}

function truncate(value) {
    return value < 0 ? Math.ceil(value) : Math.floor(value);
}

const SHOULDER_CHAINS = Object.freeze([
    Object.freeze({ root: 25, base: 26, upper: 27, target: 29 }),
    Object.freeze({ root: 31, base: 32, upper: 33, target: 35 }),
]);

export function ryoShoulderRollTargets(matrices) {
    if (!Array.isArray(matrices) || matrices.length !== RYO_RUNTIME_RIG.length) {
        throw new Error(`Expected ${RYO_RUNTIME_RIG.length} Ryo runtime matrices.`);
    }
    return SHOULDER_CHAINS.map(({ root, base, upper, target }) => {
        const baseRig = RYO_RUNTIME_RIG[base];
        const baseMatrix = rowMultiply(
            rowMultiply(
                rowEulerRaw(baseRig.defaultRotationRaw),
                rowTranslation(baseRig.defaultPosition),
            ),
            matrices[root],
        );
        const targetPosition = positionOf(matrices[target]);
        const baseAim = rowMultiply(
            xForwardFrame(localPoint(targetPosition, baseMatrix)),
            baseMatrix,
        );
        const upperAim = rowMultiply(
            xForwardFrame(localPoint(targetPosition, matrices[upper])),
            matrices[upper],
        );
        const relative = rowMultiply(upperAim, inverseRigidRow(baseAim));
        return Math.round(
            Math.atan2(relative[6], relative[5]) / TURN_TO_RADIANS,
        );
    });
}

export function advanceRyoShoulderRoll(
    previousRaw,
    desiredRaw,
    weight = 0.5,
    response = 0.02,
) {
    if (previousRaw.length !== 2 || desiredRaw.length !== 2) {
        throw new Error("Ryo shoulder roll state must contain two angles.");
    }
    return previousRaw.map((previous, index) => {
        const weightedDelta = truncate(desiredRaw[index] * weight - previous);
        return truncate(previous + response * weightedDelta);
    });
}

export function applyRyoShoulderRoll(matrices, shoulderRollRaw) {
    if (shoulderRollRaw.length !== SHOULDER_CHAINS.length) {
        throw new Error("Ryo shoulder roll state must contain two angles.");
    }
    const corrected = matrices.map((matrix) => [...matrix]);
    SHOULDER_CHAINS.forEach(({ upper }, index) => {
        corrected[upper] = rowMultiply(
            rowRotationX(-shoulderRollRaw[index] * TURN_TO_RADIANS),
            corrected[upper],
        );
    });
    return corrected;
}

export function evaluateHumanoidRuntimeControls(controls, options = {}) {
    const runtimeRig = options.runtimeRig || RYO_RUNTIME_RIG;
    if (!Array.isArray(controls) || controls.length !== runtimeRig.length) {
        throw new Error(`Expected ${runtimeRig.length} humanoid runtime controls.`);
    }
    const matrices = new Array(runtimeRig.length).fill(null);
    matrices[0] = options.rootMatrix || rowMultiply(
        localControlMatrix(controls[0], runtimeRig[0]),
        options.rootBasis || rowIdentity(),
    );

    function evaluate(index, parentMatrix) {
        const rig = runtimeRig[index];
        const control = controls[index];
        let world = matrices[index];
        if (!world) {
            world = rowMultiply(localControlMatrix(control, rig), parentMatrix);
            matrices[index] = world;
        }

        if (rig.solverClass === 2 && rig.solverSubtype === 1) {
            const upper = rig.children[0];
            const target = runtimeRig[upper].children
                .find((child) => runtimeRig[child].solverClass === 4);
            // The executable's stable controller type identifies the two
            // aimed one-bone roots: type 1 and type 4. This distinction is
            // required because the descriptor families also use the same
            // class/subtype pair for ordinary articulated branches:
            // type 19 starts a leg and animal-only type 36 continues the
            // neck. Header byte +4 is not a universal dispatch flag; human
            // type-4 heads encode one there while animal type-4 heads encode
            // zero, yet both take the same aimed solver path.
            const aimedOneBone = rig.type === 0x01 || rig.type === 0x04;
            if (aimedOneBone) {
                const solved = solveOneBone(
                    world,
                    controls[target].position,
                    runtimeRig[target].defaultPosition[0],
                );
                matrices[upper] = solved.upper;
                matrices[target] = solved.target;
            }
        } else if (rig.solverClass === 2 && rig.solverSubtype === 2) {
            const upper = rig.children[0];
            const lower = runtimeRig[upper].children[0];
            const target = runtimeRig[lower].children[0];
            const solved = solveTwoBone(
                world,
                controls[target].position,
                runtimeRig[lower].defaultPosition[0],
                runtimeRig[target].defaultPosition[0],
                runtimeRig[lower].solverSubtype,
            );
            matrices[upper] = solved.upper;
            matrices[lower] = solved.lower;
            matrices[target] = solved.target;
        }

        for (const child of rig.children) evaluate(child, world);
    }

    for (const child of runtimeRig[0].children) evaluate(child, matrices[0]);
    return options.shoulderRollRaw
        ? applyRyoShoulderRoll(matrices, options.shoulderRollRaw)
        : matrices;
}

export function evaluateRyoRuntimeControls(controls, options = {}) {
    return evaluateHumanoidRuntimeControls(controls, {
        ...options,
        runtimeRig: RYO_RUNTIME_RIG,
    });
}
