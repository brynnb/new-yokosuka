#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { MotnLoader } from "../src/MotnLoader.js";

BABYLON.Logger.LogLevels = BABYLON.Logger.NoneLogLevel;

const DEFAULT_MODEL = "public/models/S2_YDB1_YKC_M.MT5";
const DEFAULT_TEXTURE_PACK = "public/models/S2_YDB1_textures.bin";
const DEFAULT_MOTION = "extracted_files/data/MOTION/MOTION.BIN";

function usage() {
    console.error([
        "Usage: node tools/validate_ryo_motions.js [--model MT5] [--texture-pack BIN] [--motion MOTION.BIN]",
        "                                           [--filter REGEX] [--samples N] [--limit N] [--json]",
        "",
        "Scores MOTN sequences against Ryo's MT5 node-index animation target mapping.",
    ].join("\n"));
}

function parseArgs(argv) {
    const args = {
        model: DEFAULT_MODEL,
        texturePack: DEFAULT_TEXTURE_PACK,
        motion: DEFAULT_MOTION,
        filter: "AKI_",
        samples: 5,
        limit: 0,
        json: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--model") {
            args.model = argv[++i] || "";
        } else if (arg === "--texture-pack") {
            args.texturePack = argv[++i] || "";
        } else if (arg === "--motion") {
            args.motion = argv[++i] || "";
        } else if (arg === "--filter") {
            args.filter = argv[++i] || "";
        } else if (arg === "--samples") {
            args.samples = Number.parseInt(argv[++i] || "5", 10);
        } else if (arg === "--limit") {
            args.limit = Number.parseInt(argv[++i] || "0", 10);
        } else if (arg === "--json") {
            args.json = true;
        } else if (arg === "--help" || arg === "-h") {
            usage();
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!args.model || !args.motion) {
        usage();
        process.exit(2);
    }
    if (!Number.isFinite(args.samples) || args.samples < 1) args.samples = 5;
    if (!Number.isFinite(args.limit) || args.limit < 0) args.limit = 0;
    return args;
}

function numericChannels(channels) {
    return rawChannels(channels).filter((value) => Number.isFinite(value));
}

function rawChannels(channels) {
    return ["tx", "ty", "tz", "rx", "ry", "rz"]
        .map((channel) => channels[channel] || 0);
}

function poseMagnitude(pose) {
    let maxAbsRotation = 0;
    let maxAbsTranslation = 0;
    let nonFiniteValueCount = 0;
    const byBone = [];

    for (const [boneId, channels] of pose.entries()) {
        for (const value of rawChannels(channels)) {
            if (!Number.isFinite(value)) nonFiniteValueCount++;
        }
        const rotation = Math.max(
            Math.abs(channels.rx || 0),
            Math.abs(channels.ry || 0),
            Math.abs(channels.rz || 0),
        );
        const translation = Math.max(
            Math.abs(channels.tx || 0),
            Math.abs(channels.ty || 0),
            Math.abs(channels.tz || 0),
        );
        maxAbsRotation = Math.max(maxAbsRotation, rotation);
        maxAbsTranslation = Math.max(maxAbsTranslation, translation);
        byBone.push({ boneId, rotation, translation });
    }

    byBone.sort((a, b) => b.rotation - a.rotation || b.translation - a.translation);
    return {
        maxAbsRotation,
        maxAbsTranslation,
        nonFiniteValueCount,
        largestRotationBones: byBone.slice(0, 5),
    };
}

function sequenceSampleFrames(sequence, sampleCount) {
    const duration = Math.max(0, sequence.durationFrames || 0);
    if (duration === 0 || sampleCount === 1) return [0];
    const frames = [];
    for (let i = 0; i < sampleCount; i++) {
        frames.push((duration * i) / (sampleCount - 1));
    }
    return frames;
}

function summarizeLegacyFrameSequence(sequence) {
    return {
        index: sequence.index,
        name: sequence.name,
        durationFrames: sequence.durationFrames,
        layoutKind: sequence.layoutKind || "legacy-frame32",
        standardBlockLayout: sequence.standardBlockLayout,
        layoutWarnings: sequence.layoutWarnings || [],
        legacyFrameData: sequence.legacyFrameData || null,
        channelCount: 0,
        motionTrackCount: 0,
        poseBoneCount: 0,
        appliedBoneIds: [],
        missingBoneIds: [],
        allTargetsPresent: true,
        completeValueStream: null,
        completeMotionTrackStream: null,
        rootMotion: null,
        maxAbsRotation: 0,
        maxAbsRotationDegrees: 0,
        maxAbsTranslation: 0,
        hasTranslationChannels: false,
        nonFiniteValueCount: 0,
        playbackUsable: false,
        knownLegacyFrameOnly: true,
        reviewReasons: [],
        warningReasons: ["legacy-frame32-non-pose-layout"],
        suspicious: false,
        samples: [],
    };
}

function summarizeSequence(sequence, nodeIndexSet, sampleCount) {
    if (sequence.legacyFrameData) {
        return summarizeLegacyFrameSequence(sequence);
    }

    const poseBoneIds = sequence.boneIds || [];
    const missingBoneIds = poseBoneIds.filter((boneId) => !nodeIndexSet.has(boneId));
    const appliedBoneIds = poseBoneIds.filter((boneId) => nodeIndexSet.has(boneId));
    const frames = sequenceSampleFrames(sequence, sampleCount);
    const samples = frames.map((frame) => {
        const pose = MotnLoader.evaluateSequence(sequence, frame);
        const magnitude = poseMagnitude(pose);
        const nonZeroBones = [...pose.entries()]
            .filter(([, channels]) => numericChannels(channels).some((value) => Math.abs(value) > 1e-6))
            .map(([boneId]) => boneId)
            .sort((a, b) => a - b);

        return {
            frame,
            poseBones: pose.size,
            nonZeroBones,
            maxAbsRotation: magnitude.maxAbsRotation,
            maxAbsTranslation: magnitude.maxAbsTranslation,
            nonFiniteValueCount: magnitude.nonFiniteValueCount,
            largestRotationBones: magnitude.largestRotationBones,
        };
    });

    const maxAbsRotation = Math.max(...samples.map((sample) => sample.maxAbsRotation), 0);
    const maxAbsTranslation = Math.max(...samples.map((sample) => sample.maxAbsTranslation), 0);
    const nonFiniteValueCount = samples.reduce((sum, sample) => sum + sample.nonFiniteValueCount, 0);
    const rootMotion = MotnLoader.rootMotionSummary(sequence, { boneId: 0, channel: "tz" });
    const completeValueStream = sequence.valueData?.complete === true;
    const completeMotionTrackStream = sequence.motionTrackData?.valueData?.complete === true;
    const allTargetsPresent = missingBoneIds.length === 0;
    const reviewReasons = [];
    const warningReasons = [];
    if (sequence.standardBlockLayout === false) reviewReasons.push("unsupported-block-layout");
    if (!allTargetsPresent) reviewReasons.push("missing-target-nodes");
    if (maxAbsRotation > Math.PI * 4) {
        reviewReasons.push("extreme-rotation");
    } else if (maxAbsRotation > Math.PI * 2.5) {
        if (completeValueStream && completeMotionTrackStream) {
            warningReasons.push("large-rotation-complete-stream");
        } else {
            reviewReasons.push("extreme-rotation");
        }
    }
    if (nonFiniteValueCount > 0) reviewReasons.push("non-finite-pose-values");
    if (!completeValueStream) warningReasons.push("value-stream-incomplete-or-trailing-data");
    if (!completeMotionTrackStream) warningReasons.push("motion-track-stream-incomplete-or-trailing-data");
    const playbackUsable = reviewReasons.length === 0;

    return {
        index: sequence.index,
        name: sequence.name,
        durationFrames: sequence.durationFrames,
        standardBlockLayout: sequence.standardBlockLayout,
        layoutWarnings: sequence.layoutWarnings || [],
        channelCount: sequence.channelCount,
        motionTrackCount: sequence.motionTracks?.length || 0,
        poseBoneCount: poseBoneIds.length,
        appliedBoneIds,
        missingBoneIds,
        allTargetsPresent,
        completeValueStream,
        completeMotionTrackStream,
        rootMotion,
        maxAbsRotation,
        maxAbsRotationDegrees: maxAbsRotation * 180 / Math.PI,
        maxAbsTranslation,
        hasTranslationChannels: maxAbsTranslation > 1e-6,
        nonFiniteValueCount,
        playbackUsable,
        reviewReasons,
        warningReasons,
        suspicious: reviewReasons.length > 0 || warningReasons.length > 0,
        samples,
    };
}

async function loadRyoNodes(modelPath, texturePackPath) {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const modelBuffer = fs.readFileSync(modelPath).buffer;
    const textureBuffer = texturePackPath && fs.existsSync(texturePackPath)
        ? fs.readFileSync(texturePackPath).buffer
        : null;
    const loader = new Mt5Loader(scene, {
        backFaceCulling: false,
        ryoHeadAtlasFix: true,
        characterRigMode: "baked",
    });
    if (textureBuffer) {
        loader.setTexturePackIndex(Mt5Loader.buildTexturePackIndex(textureBuffer), null, textureBuffer, null);
    }
    const roots = await loader.load(modelBuffer, textureBuffer);
    if (roots.length === 0) {
        throw new Error(`No renderable roots loaded for ${modelPath}`);
    }

    const nodes = roots[0]._mt5Nodes || [];
    const result = nodes.map((node, index) => ({
        index,
        addr: `0x${node.addr.toString(16)}`,
        flagLowByte: node.flag & 0xff,
        hasModel: Boolean(node.model),
        vertexCount: node.model?.nbVertex || 0,
    }));
    engine.dispose();
    return result;
}

function printTable(output) {
    console.log(`Ryo motion coverage: ${output.motionPath}`);
    console.log(`model=${output.modelPath}`);
    console.log(`nodes=${output.nodeCount} sequences=${output.sequenceCount} matched=${output.matchedCount}`);
    console.log(`target=node-index rotationScale=1`);
    console.log("");
    for (const sequence of output.sequences) {
        if (sequence.knownLegacyFrameOnly) {
            const legacy = sequence.legacyFrameData || {};
            console.log([
                " ",
                String(sequence.index).padStart(4, " "),
                sequence.name.padEnd(34, " "),
                `frames=${String(sequence.durationFrames || 0).padStart(3, " ")}`,
                "bones= 0",
                "applied= 0",
                "missing=-",
                "maxRot=0.0deg",
                "maxTrans=0.00",
                "root=n/a",
                `legacy=${legacy.frameCount || 0}x${legacy.frameEntrySize || 0}`,
                "playback=non-pose",
            ].join(" "));
            continue;
        }

        const status = sequence.suspicious ? "*" : " ";
        console.log([
            status,
            String(sequence.index).padStart(4, " "),
            sequence.name.padEnd(34, " "),
            `frames=${String(sequence.durationFrames || 0).padStart(3, " ")}`,
            `bones=${String(sequence.poseBoneCount).padStart(2, " ")}`,
            `applied=${String(sequence.appliedBoneIds.length).padStart(2, " ")}`,
            `missing=${sequence.missingBoneIds.length ? sequence.missingBoneIds.join(",") : "-"}`,
            `maxRot=${sequence.maxAbsRotationDegrees.toFixed(1)}deg`,
            `maxTrans=${sequence.maxAbsTranslation.toFixed(2)}`,
            `root=${sequence.rootMotion.distance.toFixed(2)}u`,
            sequence.playbackUsable ? "playback=ok" : `review=${sequence.reviewReasons.join(",")}`,
            `values=${sequence.completeValueStream ? "ok" : "bad"}`,
        ].join(" "));
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const modelPath = path.resolve(args.model);
    const texturePackPath = args.texturePack ? path.resolve(args.texturePack) : "";
    const motionPath = path.resolve(args.motion);
    const nodes = await loadRyoNodes(modelPath, texturePackPath);
    const nodeIndexSet = new Set(nodes.map((node) => node.index));
    const motion = MotnLoader.parse(fs.readFileSync(motionPath));
    const regex = args.filter
        ? new RegExp(args.filter, "i")
        : null;
    const matched = (regex ? motion.sequences.filter((sequence) => regex.test(sequence.name)) : motion.sequences)
        .filter((sequence) => sequence.valid && (sequence.channelCount > 0 || sequence.legacyFrameData));
    const limited = args.limit > 0 ? matched.slice(0, args.limit) : matched;
    const summaries = limited.map((sequence) => summarizeSequence(sequence, nodeIndexSet, args.samples));
    const poseSummaries = summaries.filter((sequence) => !sequence.knownLegacyFrameOnly);
    const legacyFrameOnly = summaries.filter((sequence) => sequence.knownLegacyFrameOnly);
    const output = {
        modelPath,
        texturePackPath: texturePackPath || null,
        motionPath,
        target: "node-index",
        rotationScale: 1,
        nodeCount: nodes.length,
        nodes,
        sequenceCount: motion.sequences.length,
        matchedCount: matched.length,
        emittedCount: summaries.length,
        filter: args.filter || null,
        samplesPerSequence: args.samples,
        summary: {
            clean: poseSummaries.filter((sequence) => !sequence.suspicious).length,
            suspicious: poseSummaries.filter((sequence) => sequence.suspicious).length,
            playbackUsable: poseSummaries.filter((sequence) => sequence.playbackUsable).length,
            reviewNeeded: poseSummaries.filter((sequence) => sequence.reviewReasons.length > 0).length,
            warningOnly: poseSummaries.filter((sequence) => sequence.reviewReasons.length === 0 && sequence.warningReasons.length > 0).length,
            legacyFrameOnly: legacyFrameOnly.length,
            allTargetsPresent: summaries.filter((sequence) => sequence.allTargetsPresent).length,
            completeValueStream: poseSummaries.filter((sequence) => sequence.completeValueStream).length,
            completeMotionTrackStream: poseSummaries.filter((sequence) => sequence.completeMotionTrackStream).length,
        },
        sequences: summaries,
    };

    if (args.json) {
        console.log(JSON.stringify(output, null, 2));
    } else {
        printTable(output);
    }
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
});
