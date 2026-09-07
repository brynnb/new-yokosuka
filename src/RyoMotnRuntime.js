import { MotnLoader } from "./MotnLoader.js";
import nativeMirroring from "./data/native-motion-mirroring.json" with { type: "json" };
import {
    advanceRyoShoulderRoll,
    applyRyoShoulderRoll,
    evaluateHumanoidRuntimeControls,
    evaluateRyoRuntimeControls,
    RYO_RUNTIME_RIG,
    ryoShoulderRollTargets,
} from "./ShenmueRuntimeRig.js";

const ROTATION_CHANNELS = Object.freeze(["rx", "ry", "rz"]);
const TRANSLATION_CHANNELS = Object.freeze(["tx", "ty", "tz"]);

export const RYO_GAMEPLAY_WALK_SEQUENCE_NAMES = Object.freeze([
    "A_WALK_L_02",
    "AKI_AKI_WALK_SP1_LP",
    "AKI_AKI_WALK_SP2_LP",
]);
export const RYO_GAMEPLAY_WALK_TICKS_PER_CYCLE = 28;
export const RYO_GAMEPLAY_FOOT_FLOOR_Y = 0.117;
// The exposed stationary loops close within 0.0061 m and have low net/path
// ratios; the shortest directional locomotion clip travels 0.58 m.
export const RYO_ACTOR_TRAVEL_MIN_DISPLACEMENT = 0.01;
export const RYO_ACTOR_TRAVEL_MIN_DIRECTIONALITY = 0.5;

const RYO_GAMEPLAY_WALK_SEQUENCE_SET = new Set(
    RYO_GAMEPLAY_WALK_SEQUENCE_NAMES,
);

// 0x0C093D34 applies one of these target-control profiles after sampling a
// source MOTN curve. The table lives at 0x0C2940CC in Shenmue's RAM.
const ROTATION_PROFILES = nativeMirroring.rotationProfiles;
const MIRROR_CONTROL_ROUTES = nativeMirroring.controls.map((_, i) => i);
for (const [index, control] of nativeMirroring.controls.entries()) {
    if (control.swapWith) {
        [MIRROR_CONTROL_ROUTES[index], MIRROR_CONTROL_ROUTES[control.swapWith]] =
            [MIRROR_CONTROL_ROUTES[control.swapWith], MIRROR_CONTROL_ROUTES[index]];
    }
}

// The active-walk control records prove these source-to-target curve-pointer
// routes. Paired limb tracks are swapped, then the sampler's target profile
// mirrors them. The source phase is one half-cycle ahead of the effective
// target pose: all dynamic routed controls independently converge on half of
// the 36-frame interpolation span.
const GAMEPLAY_WALK_ROTATION_ROUTES = Object.freeze(new Map([
    [0, Object.freeze({ source: 0, profile: 0 })],
    [1, Object.freeze({ source: 1, profile: 1 })],
    [5, Object.freeze({ source: 12, profile: 3 })],
    [9, Object.freeze({ source: 16, profile: 0 })],
    [12, Object.freeze({ source: 5, profile: 3 })],
    [16, Object.freeze({ source: 9, profile: 0 })],
    [18, Object.freeze({ source: 18, profile: 1 })],
    [21, Object.freeze({ source: 21, profile: 2 })],
    [25, Object.freeze({ source: 31, profile: 3 })],
    [26, Object.freeze({ source: 32, profile: 3 })],
    [30, Object.freeze({ source: 36, profile: 3 })],
    [31, Object.freeze({ source: 25, profile: 3 })],
    [32, Object.freeze({ source: 26, profile: 3 })],
    [36, Object.freeze({ source: 30, profile: 3 })],
]));

// 0x0C093BA8 samples the translation descriptor at control+0x1c. The active
// gameplay walk swaps the paired IK targets just like the rotation routing.
// Its 0x0C2947A8 mode flag also takes the sampler's X-only subtraction path;
// Y and Z use the ordinary additive path.
const GAMEPLAY_WALK_TRANSLATION_ROUTES = Object.freeze(new Map([
    [0, 0],
    [8, 15],
    [15, 8],
    [20, 20],
    [23, 23],
    [29, 35],
    [35, 29],
]));

function signedInt16(value) {
    const wrapped = ((value % 65536) + 65536) % 65536;
    return wrapped >= 32768 ? wrapped - 65536 : wrapped;
}

function rawRotation(turns) {
    // 0x0C093D1E multiplies sampled turns by 65536 and uses SH-4 FTRC,
    // which truncates toward zero before the control record stores int16.
    const scaled = turns * 65536;
    const integer = scaled < 0 ? Math.ceil(scaled) : Math.floor(scaled);
    return signedInt16(integer);
}

function isGameplayWalk(sequence) {
    return RYO_GAMEPLAY_WALK_SEQUENCE_SET.has(sequence?.name);
}

function rotationProfileValue(value, profileIndex, axis) {
    const profile = ROTATION_PROFILES[profileIndex];
    return value * profile.scale[axis] - profile.offset[axis];
}

export function ryoMotnGameplayTiming(sequence) {
    const sourceFrames = Math.max(1, sequence?.durationFrames || 1);
    // MOTN's duration is a stored sample count. Gameplay walk curves have
    // samples 0..N-1, so their interpolated clock spans N-1 frame intervals.
    const sourceFrameSpan = isGameplayWalk(sequence)
        ? Math.max(1, sourceFrames - 1)
        : sourceFrames;
    const gameTicksPerCycle = isGameplayWalk(sequence)
        ? RYO_GAMEPLAY_WALK_TICKS_PER_CYCLE
        : sourceFrames;
    return {
        sourceFrames,
        sourceFrameSpan,
        gameTicksPerCycle,
        sourceFramesPerGameTick: sourceFrameSpan / gameTicksPerCycle,
    };
}

export function ryoMotnFrameForGameTick(sequence, gameTick, phase = 0) {
    const timing = ryoMotnGameplayTiming(sequence);
    const unwrapped = phase + gameTick * timing.sourceFramesPerGameTick;
    const wrapped = unwrapped % timing.sourceFrameSpan;
    return wrapped < 0 ? wrapped + timing.sourceFrameSpan : wrapped;
}

function rootHorizontalPosition(sequence, frame) {
    const curves = sequence?.valueData?.curves || [];
    return ["tx", "tz"].map((channel) => {
        const curve = curves.find(
            (candidate) => candidate.boneId === 0
                && candidate.channel === channel,
        );
        return curve ? MotnLoader.sampleCurveRaw(curve, frame) : 0;
    });
}

export function analyzeRyoMotnRootMotion(sequence, options = {}) {
    const lastFrame = Math.max(0, (sequence?.durationFrames || 1) - 1);
    const positions = Array.from(
        { length: lastFrame + 1 },
        (_, frame) => rootHorizontalPosition(sequence, frame),
    );
    const start = positions[0];
    const end = positions.at(-1);
    const cycleDisplacement = Math.hypot(
        end[0] - start[0],
        end[1] - start[1],
    );
    let sampledPathLength = 0;
    for (let frame = 1; frame < positions.length; frame++) {
        sampledPathLength += Math.hypot(
            positions[frame][0] - positions[frame - 1][0],
            positions[frame][1] - positions[frame - 1][1],
        );
    }
    const directionality = sampledPathLength > 1e-12
        ? cycleDisplacement / sampledPathLength
        : 0;
    const minimumDisplacement = options.minimumDisplacement
        ?? RYO_ACTOR_TRAVEL_MIN_DISPLACEMENT;
    const minimumDirectionality = options.minimumDirectionality
        ?? RYO_ACTOR_TRAVEL_MIN_DIRECTIONALITY;
    const kind = cycleDisplacement >= minimumDisplacement
        && directionality >= minimumDirectionality
        ? "travel"
        : "pose";
    return {
        kind,
        start: [start[0], 0, start[1]],
        end: [end[0], 0, end[1]],
        cycleDisplacement,
        sampledPathLength,
        directionality,
        minimumDisplacement,
        minimumDirectionality,
    };
}

export function splitHumanoidActorTranslation(matrices, options = {}) {
    if (!Array.isArray(matrices) || matrices.length === 0) {
        throw new Error("Expected humanoid runtime matrices.");
    }
    const root = matrices[0];
    if (!Array.isArray(root) || root.length !== 16) {
        throw new Error("Ryo runtime root matrix must contain 16 elements.");
    }

    // Traveling MOTN root X/Z is actor trajectory, while every runtime
    // control matrix already contains the same world-space offset. Callers can
    // provide the cycle's linear actorTranslation to remove only average
    // travel and retain authored forward/back and lateral variation. A
    // stationary loop's horizontal root motion is instead authored body sway:
    // its absolute foot IK targets remain planted while the torso moves.
    // Removing that sway makes the feet slide in the in-place preview.
    //
    // Root Y and all rotations always remain pose data. Removing the full
    // root matrix would also incorrectly stand up sequences such as
    // SLEEP_BED_LP.
    const extractHorizontal = options.extractHorizontal ?? true;
    const actorTranslation = options.actorTranslation
        ? [...options.actorTranslation]
        : extractHorizontal
            ? [root[12], 0, root[14]]
            : [0, 0, 0];
    const poseMatrices = matrices.map((matrix) => {
        const pose = [...matrix];
        pose[12] -= actorTranslation[0];
        pose[14] -= actorTranslation[2];
        return pose;
    });
    return {
        actorTranslation,
        poseMatrices,
    };
}

export function splitRyoActorTranslation(matrices, options = {}) {
    if (!Array.isArray(matrices) || matrices.length !== RYO_RUNTIME_RIG.length) {
        throw new Error(`Expected ${RYO_RUNTIME_RIG.length} Ryo runtime matrices.`);
    }
    return splitHumanoidActorTranslation(matrices, options);
}

// Turn locomotion is rotated by the player controller. Remove the authored
// world heading from every solved matrix (including foot IK targets), but
// retain torso sway and height. Otherwise a 90-degree clip turns twice.
export function removeHumanoidPoseHeading(matrices) {
    const root = matrices[0];
    const yaw = Math.atan2(root[8], root[10]);
    const cosine = Math.cos(yaw);
    const sine = Math.sin(yaw);
    return matrices.map(matrix => {
        const result = [...matrix];
        for (const offset of [0, 4, 8, 12]) {
            result[offset] = cosine * matrix[offset] - sine * matrix[offset + 2];
            result[offset + 2] = sine * matrix[offset] + cosine * matrix[offset + 2];
        }
        return result;
    });
}

export function createHumanoidMotnControls(
    sequence,
    frame,
    runtimeRig = RYO_RUNTIME_RIG,
    options = {},
) {
    const baseControls = options.baseControls || null;
    const mirror = options.mirror === true;
    if (mirror && runtimeRig !== RYO_RUNTIME_RIG) {
        throw new Error("Native mirror routes require the matching Ryo controller family");
    }
    const controls = runtimeRig.map((rig, index) => {
        const base = baseControls?.[index];
        return {
            index: rig.index,
            type: rig.type,
            solverClass: rig.solverClass,
            solverSubtype: rig.solverSubtype,
            position: [
                ...(base?.position || rig.defaultPosition),
            ],
            rotationRaw: [
                ...(base?.rotationRaw || rig.defaultRotationRaw),
            ],
            translationCurveAddress:
                base?.translationCurveAddress || 0,
            rotationCurveAddress: base?.rotationCurveAddress || 0,
            blendWeight: base?.blendWeight || 0,
        };
    });

    // Ryo's legacy hand-recovered rig omits the fixed pelvis endpoint's
    // class-3/subtype-1 neutral orientation. The executable-derived NPC
    // families already contain their authored value here. In particular,
    // cat/dog families use a near-half-turn value, so replacing it with
    // Ryo's quarter-turn folds the animal's two body branches together.
    if (
        !baseControls
        && runtimeRig === RYO_RUNTIME_RIG
        && controls[2]
    ) {
        controls[2].rotationRaw = [0, 0, -16384];
    }

    const targetIndexByType = new Map(
        runtimeRig.map((control, index) => [control.type, index]),
    );
    const sourceNodes = options.sourceControllerFamily?.nodes || null;
    const targetIndexForSourceIndex = (sourceIndex) => {
        if (!sourceNodes) return sourceIndex;
        const sourceType = sourceNodes[sourceIndex]?.type;
        return targetIndexByType.get(sourceType);
    };

    const curves = sequence?.valueData?.curves || [];
    for (const curve of curves) {
        // 0x0c107e7c walks the source family's descriptors, looks each
        // descriptor up in the target controller by its authored type byte,
        // then binds that source curve to the matching target record. Equal
        // control counts do not imply equal array indices.
        const boundIndex = targetIndexForSourceIndex(curve.boneId);
        const targetIndex = mirror ? MIRROR_CONTROL_ROUTES[boundIndex] : boundIndex;
        const control = controls[targetIndex];
        if (!control) continue;
        const value = MotnLoader.sampleCurveRaw(curve, frame);
        const translationAxis = TRANSLATION_CHANNELS.indexOf(curve.channel);
        if (translationAxis >= 0) {
            control.position[translationAxis] = mirror && translationAxis === 0 ? -value : value;
            control.translationCurveAddress = 1;
            continue;
        }

        const rotationAxis = ROTATION_CHANNELS.indexOf(curve.channel);
        if (rotationAxis >= 0) {
            const profile = mirror ? nativeMirroring.controls[targetIndex].rotationProfile : 4;
            control.rotationRaw[rotationAxis] = rawRotation(profile === 4
                ? value
                : rotationProfileValue(value, profile, rotationAxis));
            control.rotationCurveAddress = 1;
        }
    }

    if (isGameplayWalk(sequence)) {
        const curvesByControlAndChannel = new Map(curves.map((curve) => (
            [`${curve.boneId}:${curve.channel}`, curve]
        )));
        const { sourceFrameSpan } = ryoMotnGameplayTiming(sequence);
        const routedFrame = (
            (frame + sourceFrameSpan / 2) % sourceFrameSpan
            + sourceFrameSpan
        ) % sourceFrameSpan;
        for (const [targetIndex, sourceIndex] of GAMEPLAY_WALK_TRANSLATION_ROUTES) {
            const control = controls[targetIndex];
            for (let axis = 0; axis < TRANSLATION_CHANNELS.length; axis++) {
                const curve = curvesByControlAndChannel.get(
                    `${sourceIndex}:${TRANSLATION_CHANNELS[axis]}`,
                );
                if (!curve) continue;
                const value = MotnLoader.sampleCurveRaw(curve, routedFrame);
                control.position[axis] = axis === 0 ? -value : value;
                control.translationCurveAddress = 1;
            }
            // The gameplay locomotion controller prevents either leg IK
            // target from dropping through Ryo's foot-contact plane. Both
            // targets plateau at the exact float 0.117 in the RAM capture.
            if (targetIndex === 8 || targetIndex === 15) {
                control.position[1] = Math.max(
                    control.position[1],
                    RYO_GAMEPLAY_FOOT_FLOOR_Y,
                );
            }
        }
        for (const [targetIndex, route] of GAMEPLAY_WALK_ROTATION_ROUTES) {
            const control = controls[targetIndex];
            for (let axis = 0; axis < ROTATION_CHANNELS.length; axis++) {
                const curve = curvesByControlAndChannel.get(
                    `${route.source}:${ROTATION_CHANNELS[axis]}`,
                );
                if (!curve) continue;
                const value = MotnLoader.sampleCurveRaw(curve, routedFrame);
                control.rotationRaw[axis] = rawRotation(
                    rotationProfileValue(value, route.profile, axis),
                );
                control.rotationCurveAddress = 1;
            }
        }
    }
    return controls;
}

export function createRyoMotnControls(sequence, frame, options = {}) {
    return createHumanoidMotnControls(sequence, frame, RYO_RUNTIME_RIG, options);
}

export function evaluateHumanoidMotnFrame(
    sequence,
    frame,
    runtimeRig,
    options = {},
) {
    const controls = createHumanoidMotnControls(
        sequence,
        frame,
        runtimeRig,
        options,
    );
    const matrices = evaluateHumanoidRuntimeControls(controls, {
        runtimeRig,
        rootBasis: options.rootBasis,
        rootMatrix: options.rootMatrix,
    });
    return {
        frame,
        controls,
        genericMatrices: matrices,
        matrices,
    };
}

export function evaluateRyoMotnFrame(sequence, frame, options = {}) {
    const controls = createRyoMotnControls(sequence, frame, options);
    const genericMatrices = evaluateRyoRuntimeControls(controls, {
        rootBasis: options.rootBasis,
        rootMatrix: options.rootMatrix,
    });
    const shoulderRollDesiredRaw = ryoShoulderRollTargets(genericMatrices);
    const previousShoulderRollRaw = options.shoulderRollRaw || [0, 0];
    const shoulderRollRaw = options.advanceShoulderRoll === false
        ? [...previousShoulderRollRaw]
        : advanceRyoShoulderRoll(
            previousShoulderRollRaw,
            shoulderRollDesiredRaw,
            options.shoulderRollWeight ?? 0.5,
            options.shoulderRollResponse ?? 0.02,
        );
    const matrices = applyRyoShoulderRoll(
        genericMatrices,
        shoulderRollRaw,
    );
    return {
        frame,
        controls,
        genericMatrices,
        matrices,
        shoulderRollDesiredRaw,
        shoulderRollRaw,
    };
}
