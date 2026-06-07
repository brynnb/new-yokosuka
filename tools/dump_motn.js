#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { MotnLoader } from "../src/MotnLoader.js";

function printUsage() {
    console.error("Usage: node tools/dump_motn.js <motion.bin> [--filter PATTERN] [--limit N] [--json] [--curves]");
}

function parseArgs(argv) {
    const args = {
        file: null,
        filter: null,
        limit: 20,
        json: false,
        curves: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--filter") {
            args.filter = argv[++i] || "";
        } else if (arg === "--limit") {
            args.limit = Number.parseInt(argv[++i] || "20", 10);
        } else if (arg === "--json") {
            args.json = true;
        } else if (arg === "--curves") {
            args.curves = true;
        } else if (!args.file) {
            args.file = arg;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!args.file) {
        printUsage();
        process.exit(2);
    }

    if (!Number.isFinite(args.limit) || args.limit < 0) args.limit = 20;
    return args;
}

function compactCurve(curve) {
    return {
        boneId: curve.boneId,
        channel: curve.channel,
        count: curve.count,
        flagBytes: curve.flagBytes,
        samples: curve.samples,
    };
}

function compactSequence(sequence, includeCurves = false) {
    return {
        index: sequence.index,
        name: sequence.name,
        dataRelativeOffset: sequence.dataRelativeOffset,
        extraRelativeOffset: sequence.extraRelativeOffset,
        dataOffset: sequence.dataOffset,
        dataEnd: sequence.dataEnd,
        rawDataLength: sequence.rawDataLength,
        flag: sequence.flag,
        durationFrames: sequence.durationFrames,
        flagHigh: sequence.flagHigh,
        layoutKind: sequence.layoutKind || "standard",
        standardBlockLayout: sequence.standardBlockLayout,
        layoutWarnings: sequence.layoutWarnings,
        legacyFrameData: sequence.legacyFrameData || null,
        boneIds: sequence.boneIds,
        motionBoneIds: sequence.motionBoneIds,
        channelCount: sequence.channelCount,
        motionTrackCount: sequence.motionTracks?.length || 0,
        blockSpans: sequence.blockSpans,
        channels: sequence.channels,
        motionTracksPreview: sequence.motionTracks?.slice(0, 18) || [],
        frameData: sequence.frameData ? {
            countEntrySize: sequence.frameData.countEntrySize,
            frameEntrySize: sequence.frameData.frameEntrySize,
            frameCount: sequence.frameData.frameCount,
            groupsPreview: sequence.frameData.groups.slice(0, 12),
        } : null,
        valueData: sequence.valueData ? {
            attributeBytesRead: sequence.valueData.attributeBytesRead,
            attributeByteCount: sequence.valueData.attributeByteCount,
            unusedAttributeBytes: sequence.valueData.unusedAttributeBytes,
            valueHalfwordsRead: sequence.valueData.valueHalfwordsRead,
            valueHalfwordCount: sequence.valueData.valueHalfwordCount,
            complete: sequence.valueData.complete,
            interpretation: "compatibility-descriptor-channel-flags",
            curves: includeCurves
                ? sequence.valueData.curves.map(compactCurve)
                : sequence.valueData.curves
                    .filter((curve) => curve.samples.some((sample) => sample.componentCount > 0))
                    .slice(0, 6)
                    .map((curve) => ({
                        boneId: curve.boneId,
                        channel: curve.channel,
                        count: curve.count,
                        flagBytes: curve.flagBytes,
                        samples: curve.samples.filter((sample) => sample.componentCount > 0).slice(0, 6),
                    })),
        } : null,
        motionTrackData: sequence.motionTrackData ? {
            interpretation: "shenmunity-root-plus-three-tracks-per-motion-bone",
            valueHalfwordsRead: sequence.motionTrackData.valueData.valueHalfwordsRead,
            valueHalfwordCount: sequence.motionTrackData.valueData.valueHalfwordCount,
            complete: sequence.motionTrackData.valueData.complete,
            groupsPreview: sequence.motionTrackData.frameData.groups.slice(0, 12),
            curves: includeCurves
                ? sequence.motionTrackData.valueData.curves.map(compactCurve)
                : sequence.motionTrackData.valueData.curves
                    .filter((curve) => curve.samples.some((sample) => sample.componentCount > 0))
                    .slice(0, 6)
                    .map((curve) => ({
                        trackIndex: curve.trackIndex,
                        trackKind: curve.trackKind,
                        motionBoneRaw: curve.motionBoneRaw,
                        candidateNodeId: curve.candidateNodeId,
                        boneId: curve.boneId,
                        channel: curve.channel,
                        count: curve.count,
                        flagBytes: curve.flagBytes,
                        samples: curve.samples.filter((sample) => sample.componentCount > 0).slice(0, 6),
                    })),
        } : null,
        valuePreview: sequence.valuePreview,
    };
}

function printTable(parsed, sequences, file) {
    console.log(`MOTN: ${path.resolve(file)}`);
    console.log(`sequences=${parsed.header.sequenceCount} names=0x${parsed.header.sequenceNameTableOffset.toString(16)} data=0x${parsed.header.sequenceDataOffset.toString(16)} size=${parsed.header.fileSize}`);
    console.log("");
    for (const sequence of sequences) {
        const valueData = sequence.valueData;
        const valueSummary = valueData
            ? ` values=${valueData.valueHalfwordsRead}/${valueData.valueHalfwordCount}${valueData.complete ? "" : "*"}`
            : "";
        const layoutSummary = sequence.standardBlockLayout === false ? " layout=nonstandard" : "";
        const legacySummary = sequence.legacyFrameData
            ? ` legacy=${sequence.legacyFrameData.frameCount}x${sequence.legacyFrameData.frameEntrySize}`
            : "";
        console.log(`${String(sequence.index).padStart(4, " ")}  ${sequence.name.padEnd(34, " ")} frames=${String(sequence.durationFrames || 0).padStart(3, " ")} bones=${String(sequence.boneIds?.length || 0).padStart(2, " ")} channels=${String(sequence.channelCount || 0).padStart(3, " ")} motionTracks=${String(sequence.motionTracks?.length || 0).padStart(3, " ")}${valueSummary}${legacySummary}${layoutSummary} data=0x${sequence.dataOffset.toString(16)}`);
    }
}

function readCString(bytes, offset, maxLength = 80) {
    if (offset < 0 || offset >= bytes.length) return "";
    let result = "";
    const end = Math.min(bytes.length, offset + maxLength);
    for (let i = offset; i < end && bytes[i] !== 0; i++) {
        const value = bytes[i];
        if (value < 0x20 || value > 0x7e) return "";
        result += String.fromCharCode(value);
    }
    return result;
}

function printUnsupportedSummary(bytes, file, error) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u32 = (offset) => offset + 4 <= bytes.length ? view.getUint32(offset, true) : 0;
    const header = error.header || {
        sequenceTableOffset: u32(0x00),
        sequenceNameTableOffset: u32(0x04),
        sequenceDataOffset: u32(0x08),
        attributes: u32(0x0c),
        fileSize: u32(0x10),
    };

    console.log(`MOTN: ${path.resolve(file)}`);
    console.log("Unsupported or non-global MOTN layout; parsed header only.");
    console.log(`table=0x${header.sequenceTableOffset.toString(16)} names=0x${header.sequenceNameTableOffset.toString(16)} data=0x${header.sequenceDataOffset.toString(16)} attr=0x${header.attributes.toString(16)} size=${header.fileSize || bytes.length}`);
    console.log(`countCandidates byte12=${bytes[0x0c] || 0} low12=${header.attributes & 0x0fff}`);

    const inlineNames = [];
    for (const offset of [header.sequenceNameTableOffset, header.sequenceDataOffset, header.attributes]) {
        const name = readCString(bytes, offset);
        if (name) inlineNames.push(`0x${offset.toString(16)} ${name}`);
    }
    if (inlineNames.length > 0) {
        console.log("inlineNameSamples:");
        for (const line of inlineNames) console.log(`  ${line}`);
    }
}

const args = parseArgs(process.argv.slice(2));
const bytes = fs.readFileSync(args.file);
let parsed;
try {
    parsed = MotnLoader.parse(bytes);
} catch (error) {
    if (args.json) {
        const header = error.header || null;
        console.log(JSON.stringify({
            file: path.resolve(args.file),
            supported: false,
            error: error.message,
            header,
        }, null, 2));
    } else {
        printUnsupportedSummary(bytes, args.file, error);
    }
    process.exit(0);
}
const sequences = (args.filter ? parsed.findSequences(args.filter) : parsed.sequences)
    .slice(0, args.limit || parsed.sequences.length);

if (args.json) {
    console.log(JSON.stringify({
        file: path.resolve(args.file),
        header: parsed.header,
        sequenceCount: parsed.sequences.length,
        sequences: sequences.map((sequence) => compactSequence(sequence, args.curves)),
    }, null, 2));
} else {
    printTable(parsed, sequences, args.file);
}
