#!/usr/bin/env node

/**
 * Identify the Ryo motion resident in the frozen JOMO drawer captures.
 *
 * The retail MOTM component exposes the just-rendered source frame at +0x120,
 * while Ryo's 37 world matrices remain at the fixed address stored by his
 * runtime controls.  Root-normalized matrix deltas from three captures can
 * therefore be compared directly with every sequence in the retail player
 * MOTION bank.  This is pose evidence, not a name/debug-string guess.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MotnLoader } from "../../src/MotnLoader.js";
import { evaluateRyoMotnFrame } from "../../src/RyoMotnRuntime.js";
import { rowMultiply } from "../../src/ShenmueRuntimeRig.js";

const PROJECT_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const SOURCE_ROOT_CANDIDATES = [
    PROJECT_ROOT,
    path.resolve(PROJECT_ROOT, "..", "new-yokosuka"),
];

const RAM_BASE = 0x0c000000;
const RAM_SIZE = 0x01000000;
const RYO_MOTM_TAG = 0x0c51a950;
const RYO_MATRIX_BASE = 0x0cc06e80;
const RYO_MATRIX_COUNT = 37;
const RYO_MATRIX_STRIDE = 64;
const MOTM_CURRENT_FRAME_OFFSET = 0x11c;
const MOTM_RENDERED_FRAME_OFFSET = 0x120;

const EXPECTED = Object.freeze({
    motionSha256:
        "512abe68b26a2a8bf78c8011b54faf01f9c3e0ce3e4d0b56491161eec3565dec",
    captures: Object.freeze([
        Object.freeze({
            frameCount: 147,
            sha256:
                "a11e95a3f55dfc3399d0973c80c85753792c22713bd5c2a174663565e92cd2db",
            currentFrame: 12,
            renderedFrame: 11,
        }),
        Object.freeze({
            frameCount: 156,
            sha256:
                "3807fb7e887425f382be75d7a1c6ebe160c198a45ef9fda031e11a36ce99cf79",
            currentFrame: 21,
            renderedFrame: 20,
        }),
        Object.freeze({
            frameCount: 160,
            sha256:
                "05789d4dc72d6cabc7223f8438f6c86a2b105c2fe27a2dc84b038f601dfc338f",
            currentFrame: 25,
            renderedFrame: 24,
        }),
    ]),
    sequenceIndex: 902,
    sequenceName: "AKI_AKI_TATI_IWA_L",
    durationFrames: 60,
});

function parseArgs(argv) {
    const args = {
        motion: null,
        captures: null,
        out: path.join(
            PROJECT_ROOT,
            "tools/evidence/jomo-ryo-motion-evidence.json",
        ),
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--motion") args.motion = path.resolve(argv[++index]);
        else if (arg === "--captures") {
            args.captures = path.resolve(argv[++index]);
        } else if (arg === "--out") args.out = path.resolve(argv[++index]);
        else {
            throw new Error(
                "Usage: extract_jomo_ryo_motion_evidence.mjs " +
                "[--motion MOTION.BIN] [--captures CAPTURE_ROOT] [--out FILE]",
            );
        }
    }
    return args;
}

function firstExisting(candidates) {
    return candidates.find((candidate) => fs.existsSync(candidate))
        || candidates[0];
}

function defaultMotionPath() {
    return firstExisting(SOURCE_ROOT_CANDIDATES.map((root) => (
        path.join(root, "extracted_files/data/MOTION/MOTION.BIN")
    )));
}

function defaultCaptureRoot() {
    const candidates = SOURCE_ROOT_CANDIDATES.map((root) => (
        path.join(root, "captures/pvr")
    ));
    return candidates.find((candidate) => EXPECTED.captures.every(
        ({ frameCount }) => fs.existsSync(path.join(
            candidate,
            `20260723-205340-frame-${frameCount}`,
            "ram.bin",
        )),
    )) || candidates[0];
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function hex(value) {
    return `0x${value.toString(16).padStart(8, "0")}`;
}

function ramOffset(address) {
    const offset = (address & 0x1fffffff) - RAM_BASE;
    if (offset < 0 || offset >= RAM_SIZE) {
        throw new Error(`Address ${hex(address)} is outside Dreamcast RAM`);
    }
    return offset;
}

function inverseRigidRow(matrix) {
    return [
        matrix[0], matrix[4], matrix[8], 0,
        matrix[1], matrix[5], matrix[9], 0,
        matrix[2], matrix[6], matrix[10], 0,
        -(matrix[12] * matrix[0]
            + matrix[13] * matrix[1]
            + matrix[14] * matrix[2]),
        -(matrix[12] * matrix[4]
            + matrix[13] * matrix[5]
            + matrix[14] * matrix[6]),
        -(matrix[12] * matrix[8]
            + matrix[13] * matrix[9]
            + matrix[14] * matrix[10]),
        1,
    ];
}

function rootNormalize(matrices) {
    const inverseRoot = inverseRigidRow(matrices[0]);
    return matrices.map((matrix) => rowMultiply(matrix, inverseRoot));
}

function readMatrices(ram) {
    const start = ramOffset(RYO_MATRIX_BASE);
    return rootNormalize(Array.from(
        { length: RYO_MATRIX_COUNT },
        (_, matrixIndex) => Array.from(
            { length: 16 },
            (_, wordIndex) => ram.readFloatLE(
                start
                + matrixIndex * RYO_MATRIX_STRIDE
                + wordIndex * 4,
            ),
        ),
    ));
}

function readCapture(captureRoot, expected) {
    const directory = path.join(
        captureRoot,
        `20260723-205340-frame-${expected.frameCount}`,
    );
    const file = path.join(directory, "ram.bin");
    const ram = fs.readFileSync(file);
    const digest = sha256(ram);
    if (digest !== expected.sha256) {
        throw new Error(
            `Capture frame ${expected.frameCount} SHA-256 changed: ${digest}`,
        );
    }
    const motm = ramOffset(RYO_MOTM_TAG);
    if (ram.toString("ascii", motm, motm + 4) !== "MOTM") {
        throw new Error(
            `Capture frame ${expected.frameCount} has no Ryo MOTM tag`,
        );
    }
    const currentFrame = ram.readFloatLE(
        motm + MOTM_CURRENT_FRAME_OFFSET,
    );
    const renderedFrame = ram.readFloatLE(
        motm + MOTM_RENDERED_FRAME_OFFSET,
    );
    if (
        currentFrame !== expected.currentFrame
        || renderedFrame !== expected.renderedFrame
    ) {
        throw new Error(
            `Capture frame ${expected.frameCount} MOTM clock changed: ` +
            `${currentFrame}/${renderedFrame}`,
        );
    }
    return {
        frameCount: expected.frameCount,
        ramSha256: digest,
        currentFrame,
        renderedFrame,
        matrices: readMatrices(ram),
    };
}

const MATRIX_FIELDS = Object.freeze([
    0, 1, 2,
    4, 5, 6,
    8, 9, 10,
    12, 13, 14,
]);

function scoreSequence(sequence, captures) {
    let generated;
    try {
        generated = captures.map((capture) => rootNormalize(
            evaluateRyoMotnFrame(
                sequence,
                capture.renderedFrame,
                { advanceShoulderRoll: false },
            ).genericMatrices,
        ));
    } catch {
        return null;
    }

    let squaredError = 0;
    let squaredCapturedSignal = 0;
    let comparedValues = 0;
    let maximumAbsoluteError = 0;
    for (let captureIndex = 1;
        captureIndex < captures.length;
        captureIndex++) {
        for (let matrixIndex = 1;
            matrixIndex < RYO_MATRIX_COUNT;
            matrixIndex++) {
            for (const field of MATRIX_FIELDS) {
                const capturedDelta = (
                    captures[captureIndex].matrices[matrixIndex][field]
                    - captures[0].matrices[matrixIndex][field]
                );
                const generatedDelta = (
                    generated[captureIndex][matrixIndex][field]
                    - generated[0][matrixIndex][field]
                );
                if (
                    !Number.isFinite(capturedDelta)
                    || !Number.isFinite(generatedDelta)
                    || (
                        Math.abs(capturedDelta) <= 1e-5
                        && Math.abs(generatedDelta) <= 1e-5
                    )
                ) {
                    continue;
                }
                const error = capturedDelta - generatedDelta;
                squaredError += error * error;
                squaredCapturedSignal += capturedDelta * capturedDelta;
                maximumAbsoluteError = Math.max(
                    maximumAbsoluteError,
                    Math.abs(error),
                );
                comparedValues++;
            }
        }
    }
    if (comparedValues === 0) return null;
    return {
        sequenceIndex: sequence.index,
        sequenceName: sequence.name,
        durationFrames: sequence.durationFrames,
        relativeDeltaError: Math.sqrt(
            squaredError / squaredCapturedSignal,
        ),
        rootMeanSquareDeltaError: Math.sqrt(
            squaredError / comparedValues,
        ),
        maximumAbsoluteDeltaError: maximumAbsoluteError,
        comparedValues,
    };
}

function compactCue(cue) {
    return {
        frame: cue.frame,
        bank: cue.bank,
        command: cue.command,
        rawBytes: cue.rawBytes,
    };
}

function buildReport(motionPath, captureRoot) {
    const motionBytes = fs.readFileSync(motionPath);
    const motionDigest = sha256(motionBytes);
    if (motionDigest !== EXPECTED.motionSha256) {
        throw new Error(`Retail MOTION.BIN SHA-256 changed: ${motionDigest}`);
    }
    const captures = EXPECTED.captures.map((expected) => (
        readCapture(captureRoot, expected)
    ));
    const parsed = MotnLoader.parse(motionBytes);
    const scores = parsed.sequences
        .filter((sequence) => (
            sequence.valueData?.complete
            && sequence.durationFrames >= 26
        ))
        .map((sequence) => scoreSequence(sequence, captures))
        .filter(Boolean)
        .sort((left, right) => (
            left.relativeDeltaError - right.relativeDeltaError
        ));
    const winner = scores[0];
    const runnerUp = scores[1];
    if (
        winner.sequenceIndex !== EXPECTED.sequenceIndex
        || winner.sequenceName !== EXPECTED.sequenceName
        || winner.durationFrames !== EXPECTED.durationFrames
    ) {
        throw new Error(
            `Unexpected best motion: ${winner.sequenceIndex} ${winner.sequenceName}`,
        );
    }
    const sequence = parsed.sequences[winner.sequenceIndex];
    const actionMetadata = sequence.actionMetadata;
    return {
        schema: "new-yokosuka-jomo-ryo-motion-evidence-v1",
        status: "native-pose-matched-player-idle",
        generatedBy: "tools/animation/extract_jomo_ryo_motion_evidence.mjs",
        source: {
            motionBank: "MOTION/MOTION.BIN",
            motionBankSha256: motionDigest,
            sequenceCount: parsed.header.sequenceCount,
            captures: captures.map((capture) => ({
                frameCount: capture.frameCount,
                ramSha256: capture.ramSha256,
                motmCurrentFrame: capture.currentFrame,
                motmRenderedFrame: capture.renderedFrame,
            })),
        },
        runtime: {
            ryoMotmTagAddress: hex(RYO_MOTM_TAG),
            matrixBaseAddress: hex(RYO_MATRIX_BASE),
            matrixCount: RYO_MATRIX_COUNT,
            matrixStrideBytes: RYO_MATRIX_STRIDE,
            comparison: (
                "Root-normalized 37-matrix deltas at the MOTM rendered " +
                "frames are compared with every decodable retail player " +
                "sequence. Root/world placement is removed."
            ),
        },
        match: {
            winner,
            runnerUp,
            runnerUpErrorRatio:
                runnerUp.relativeDeltaError / winner.relativeDeltaError,
            ranking: scores.slice(0, 10),
            interpretation: (
                "The frozen drawer samples show Ryo continuing the ordinary " +
                "60-frame AKI_AKI_TATI_IWA_L idle. They do not show a " +
                "drawer-specific Ryo interaction motion."
            ),
        },
        authoredAudio: {
            actionMetadataOffset: hex(sequence.actionMetadataOffset),
            firstOpcode: actionMetadata?.firstOpcode ?? null,
            soundCues: (actionMetadata?.soundCues || []).map(compactCue),
            surfaceSoundCues: (
                actionMetadata?.surfaceSoundCues || []
            ).map(compactCue),
            conclusion: (
                "The matched native player idle has no authored sound or " +
                "surface-sound cues. JOMO drawer audio must therefore remain " +
                "on the object/room interaction route unless independent " +
                "evidence proves another owner."
            ),
        },
        evidenceBoundary: {
            proven: (
                "Retail capture matrices identify the resident Ryo motion " +
                "as AKI_AKI_TATI_IWA_L with a large ranking separation."
            ),
            notProven: (
                "This does not identify the drawer object's own audio command " +
                "or authorize assigning an auditioned sound."
            ),
            policy: "keep-drawer-command-unresolved-no-guessed-mapping",
        },
    };
}

const args = parseArgs(process.argv.slice(2));
const motionPath = args.motion || defaultMotionPath();
const captureRoot = args.captures || defaultCaptureRoot();
const report = buildReport(motionPath, captureRoot);
fs.mkdirSync(path.dirname(args.out), { recursive: true });
fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
console.log(
    `Wrote ${args.out}: ${report.match.winner.sequenceName}; ` +
    `runner-up error ratio ${report.match.runnerUpErrorRatio.toFixed(2)}x`,
);
