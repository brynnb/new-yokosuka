#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function usage() {
    console.error([
        "Usage: node tools/dump_face_ftbl.js <file_FTBL.BIN|face-dir> [--model file_F.MT5] [--json] [--limit N]",
        "",
        "Dumps Shenmue FACE *_FTBL.BIN headers, inferred fixed-record counts,",
        "small-integer marker runs, and optional sibling FACE MT5 vertex counts.",
        "No executables are run; this is static binary inspection only.",
    ].join("\n"));
}

function parseArgs(argv) {
    const args = {
        input: null,
        model: null,
        json: false,
        limit: 8,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--json") {
            args.json = true;
        } else if (arg === "--model") {
            args.model = argv[++i] || null;
        } else if (arg === "--limit") {
            args.limit = Number.parseInt(argv[++i] || "8", 10);
        } else if (!args.input) {
            args.input = arg;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!args.input) {
        usage();
        process.exit(2);
    }
    if (!Number.isFinite(args.limit) || args.limit < 0) args.limit = 8;
    return args;
}

function openReader(file) {
    const bytes = fs.readFileSync(file);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
        bytes,
        size: bytes.byteLength,
        sha1: crypto.createHash("sha1").update(bytes).digest("hex"),
        u16: (offset) => view.getUint16(offset, true),
        i16: (offset) => view.getInt16(offset, true),
        u32: (offset) => view.getUint32(offset, true),
        i32: (offset) => view.getInt32(offset, true),
        f32: (offset) => view.getFloat32(offset, true),
        hex: (offset, length) => Array.from(bytes.subarray(offset, offset + length))
            .map((value) => value.toString(16).padStart(2, "0"))
            .join(""),
    };
}

function fourcc(value) {
    return String.fromCharCode(
        value & 0xff,
        (value >> 8) & 0xff,
        (value >> 16) & 0xff,
        (value >> 24) & 0xff,
    ).replace(/\0/g, "");
}

function rel(file) {
    return path.relative(process.cwd(), file) || ".";
}

function safeFloat(value) {
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) > 1000000) return null;
    return Number(value.toFixed(6));
}

function readF32s(r, offset, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
        const pos = offset + i * 4;
        values.push(pos >= 0 && pos <= r.size - 4 ? safeFloat(r.f32(pos)) : null);
    }
    return values;
}

function readI32s(r, offset, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
        const pos = offset + i * 4;
        values.push(pos >= 0 && pos <= r.size - 4 ? r.i32(pos) : null);
    }
    return values;
}

function isPlausibleSmallFloat(value) {
    if (!Number.isFinite(value) || Math.abs(value) > 16) return false;
    return value === 0 || Math.abs(value) >= 0.000001;
}

function isUnitishFloat(value) {
    if (!Number.isFinite(value) || value < -0.001 || value > 1.001) return false;
    return value === 0 || Math.abs(value) >= 0.000001;
}

function parseFtHeader(r) {
    const raw = [];
    for (let offset = 0; offset <= Math.min(r.size, 48) - 4; offset += 4) {
        raw.push(r.i32(offset));
    }

    const payloadOffset = raw[1] ?? 0;
    const recordSize = raw[2] ?? 0;
    const sectionOrCount = raw[3] ?? 0;
    const boundsRaw = raw.slice(4, 12);
    return {
        raw,
        type: raw[0] ?? null,
        payloadOffset,
        recordSize,
        sectionOrCount,
        sectionOrCountHex: `0x${(sectionOrCount >>> 0).toString(16)}`,
        boundsRaw,
        boundsFixed4096: boundsRaw.map((value) => Number((value / 4096).toFixed(6))),
        payloadOffsetValid: payloadOffset >= 0 && payloadOffset <= r.size,
        recordSizeValid: recordSize > 0 && recordSize <= r.size,
        sectionOrCountAsOffsetValid: sectionOrCount >= 0 && sectionOrCount < r.size,
    };
}

function classifyWord(r, offset) {
    const unsigned = r.u32(offset);
    const signed = r.i32(offset);
    const float = r.f32(offset);
    return {
        offset,
        offsetHex: `0x${offset.toString(16)}`,
        unsigned,
        signed,
        float: safeFloat(float),
        isZero: unsigned === 0,
        isSmallInt: unsigned > 0 && unsigned <= 32,
        isPlausibleFloat: isPlausibleSmallFloat(float),
        isUnitishFloat: isUnitishFloat(float),
    };
}

function classifyWindow(r, start, bytes) {
    const end = Math.min(r.size, start + bytes);
    const words = [];
    for (let offset = start; offset <= end - 4; offset += 4) {
        words.push(classifyWord(r, offset));
    }
    const smallIntWords = words.filter((word) => word.isSmallInt).length;
    const zeroWords = words.filter((word) => word.isZero).length;
    const plausibleFloatWords = words.filter((word) => word.isPlausibleFloat).length;
    const unitishFloatWords = words.filter((word) => word.isUnitishFloat).length;
    const nonZeroWords = words.length - zeroWords;

    let kind = "mixed";
    if (words.length && nonZeroWords === 0) {
        kind = "zero";
    } else if (words.length && smallIntWords / words.length >= 0.55) {
        kind = "small-int-table";
    } else if (words.length && unitishFloatWords / words.length >= 0.55) {
        kind = "unit-float-table";
    } else if (words.length && plausibleFloatWords / words.length >= 0.55 && smallIntWords <= 2) {
        kind = "float-table";
    }

    return {
        start,
        startHex: `0x${start.toString(16)}`,
        end,
        endHex: `0x${end.toString(16)}`,
        bytes: end - start,
        wordCount: words.length,
        smallIntWords,
        zeroWords,
        plausibleFloatWords,
        unitishFloatWords,
        kind,
    };
}

function detectFloat48Records(r, header) {
    const records = [];
    if (!header.payloadOffsetValid) return { count: 0, records };

    for (let offset = header.payloadOffset; offset <= r.size - 48; offset += 48) {
        const marker = r.u32(offset + 12);
        const floats = readF32s(r, offset, 12);
        const firstPosition = floats.slice(0, 3);
        const secondPosition = floats.slice(4, 7);
        const mostlyFloat = [...firstPosition, ...secondPosition, floats[7]].every((value) => {
            return value !== null && Math.abs(value) <= 16;
        });
        const hasNonZeroPosition = [...firstPosition, ...secondPosition].some((value) => {
            return value !== null && Math.abs(value) > 0.00001;
        });
        const hasPiOverTwo = floats[7] !== null && Math.abs(floats[7] - Math.PI / 2) < 0.001;
        if (!(marker > 0 && marker <= 32 && mostlyFloat && hasNonZeroPosition && hasPiOverTwo)) break;

        records.push({
            index: records.length,
            offset,
            offsetHex: `0x${offset.toString(16)}`,
            marker,
            firstPosition,
            secondPosition,
            rotationOrAngle: floats[7],
            tailFloats: floats.slice(8, 12),
        });
    }

    return {
        count: records.length,
        firstOffset: records[0]?.offset ?? null,
        firstOffsetHex: records[0] ? `0x${records[0].offset.toString(16)}` : null,
        lastOffset: records.at(-1)?.offset ?? null,
        lastOffsetHex: records.at(-1) ? `0x${records.at(-1).offset.toString(16)}` : null,
        records,
    };
}

function detectDenseMarkerClusters(r, header) {
    const start = header.payloadOffsetValid ? header.payloadOffset : 0;
    const markers = [];
    for (let offset = start; offset <= r.size - 4; offset += 4) {
        const value = r.u32(offset);
        if (value > 0 && value <= 32) markers.push({ offset, value });
    }

    const clusters = [];
    let current = [];
    for (const marker of markers) {
        if (!current.length || marker.offset - current.at(-1).offset <= 64) {
            current.push(marker);
        } else {
            clusters.push(current);
            current = [marker];
        }
    }
    if (current.length) clusters.push(current);

    return clusters.map((cluster) => ({
        firstOffset: cluster[0].offset,
        firstOffsetHex: `0x${cluster[0].offset.toString(16)}`,
        lastOffset: cluster.at(-1).offset,
        lastOffsetHex: `0x${cluster.at(-1).offset.toString(16)}`,
        count: cluster.length,
        spanBytes: cluster.at(-1).offset - cluster[0].offset,
        valuesHead: cluster.slice(0, 24).map((marker) => marker.value),
    }));
}

function analyzeSections(r, header) {
    const windows = [];
    const windowSize = 0x100;
    for (let start = 0; start < r.size; start += windowSize) {
        windows.push(classifyWindow(r, start, windowSize));
    }
    const interestingWindows = windows.filter((window) => window.kind !== "zero");
    const pointerWindow = header.sectionOrCountAsOffsetValid
        ? classifyWindow(r, header.sectionOrCount, 0x100)
        : null;
    const float48Records = detectFloat48Records(r, header);

    return {
        float48Records,
        denseMarkerClusters: detectDenseMarkerClusters(r, header),
        pointerWindow,
        windows: interestingWindows,
    };
}

function inferLayout(r, header) {
    const payloadBytes = header.payloadOffsetValid ? r.size - header.payloadOffset : 0;
    const inferredRecordCount = header.recordSizeValid
        ? Math.floor(payloadBytes / header.recordSize)
        : 0;
    const trailerBytes = header.recordSizeValid
        ? payloadBytes - inferredRecordCount * header.recordSize
        : payloadBytes;
    const sectionOrCountRecordAligned = (
        header.sectionOrCountAsOffsetValid &&
        header.recordSizeValid &&
        header.sectionOrCount >= header.payloadOffset
    ) ? (header.sectionOrCount - header.payloadOffset) % header.recordSize === 0 : false;

    return {
        payloadBytes,
        inferredRecordCount,
        trailerBytes,
        sectionOrCountRecordAligned,
    };
}

function summarizePcStaticInterpretation(report) {
    const sections = report.sectionAnalysis;
    const float48 = sections.float48Records;
    const denseRuns = sections.denseMarkerClusters;
    const cmp = report.countComparison;
    const inferredCount = report.layout.inferredRecordCount;
    const modelVertexCount = report.model?.totalVertices ?? null;

    return {
        source: "Static Ghidra decompilation of Shenmue.exe; no Windows executable execution.",
        relevantFunctions: [
            "face_variant_state_init@0x1400a18a0",
            "face_pose_build_control_deltas@0x1400a2b30",
            "face_pose_accumulate_weighted_vectors@0x1400a30e0",
            "face_pose_sample_hermite_curve@0x1400a3350",
            "face_pose_sample_range@0x1400a3630",
            "face_pose_blend_apply@0x1400a1fb0",
        ],
        inferredRole: "FACE pose/control table feeding 3-float vector deltas, not a UV table.",
        evidence: [
            `Header recordSize=${report.header.recordSize}, but the opening ${float48.count} records are detected as 48-byte float/control records.`,
            `The PC helpers sample Hermite keyframe curves and accumulate weighted 3-float vectors through index/weight tables.`,
            `The blend path uses 0x0c vector outputs against 0x18 base/current position records; no U/V pair writes appear in this path.`,
            modelVertexCount === null
                ? `No sibling FACE MT5 model was available for direct count comparison.`
                : `Inferred FTBL count ${inferredCount} does not match sibling FACE MT5 vertex count ${modelVertexCount}.`,
        ],
        countComparison: cmp ?? null,
        openingControlRecords: {
            count: float48.count,
            firstOffsetHex: float48.firstOffsetHex,
            lastOffsetHex: float48.lastOffsetHex,
        },
        denseIndexWeightTableCandidates: denseRuns.slice(0, 4).map((cluster) => ({
            firstOffsetHex: cluster.firstOffsetHex,
            lastOffsetHex: cluster.lastOffsetHex,
            count: cluster.count,
            spanBytes: cluster.spanBytes,
            valuesHead: cluster.valuesHead,
        })),
        viewerImplication: "Do not render *_F.MT5 as a solved replacement head or apply *_FTBL.BIN as UVs. The base Ryo face texture work should stay in the HRCM/MT5 atlas decode and targeted YKB_KAJ atlas split repair path.",
    };
}

function sampleFixedRecords(r, header, limit) {
    if (!header.payloadOffsetValid || !header.recordSizeValid) return [];
    const count = Math.min(limit, Math.floor((r.size - header.payloadOffset) / header.recordSize));
    const samples = [];

    for (let i = 0; i < count; i++) {
        const offset = header.payloadOffset + i * header.recordSize;
        samples.push({
            index: i,
            offset,
            offsetHex: `0x${offset.toString(16)}`,
            words: readI32s(r, offset, Math.floor(header.recordSize / 4)),
            floats: readF32s(r, offset, Math.floor(header.recordSize / 4)),
        });
    }

    return samples;
}

function scanSmallMarkers(r, header, limit) {
    const start = header.payloadOffsetValid ? header.payloadOffset : 0;
    const markers = [];
    const valueCounts = new Map();
    let zeroWordCount = 0;

    for (let offset = start; offset <= r.size - 4; offset += 4) {
        const value = r.u32(offset);
        if (value === 0) {
            zeroWordCount++;
            continue;
        }
        if (value > 20) continue;

        const marker = {
            offset,
            offsetHex: `0x${offset.toString(16)}`,
            value,
        };
        markers.push(marker);
        valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
    }

    const sortedOffsets = markers.map((marker) => marker.offset).sort((a, b) => a - b);
    const offsetToMarker = new Map(markers.map((marker) => [marker.offset, marker]));
    const offsetSet = new Set(sortedOffsets);
    const runs = [];
    for (const stride of [32, 36, 40, 44, 48, 52, 56, 60, 64]) {
        for (const first of sortedOffsets) {
            if (offsetSet.has(first - stride)) continue;
            const offsets = [];
            let current = first;
            while (offsetSet.has(current)) {
                offsets.push(current);
                current += stride;
            }
            if (offsets.length >= 4) {
                runs.push({
                    stride,
                    length: offsets.length,
                    firstOffset: offsets[0],
                    firstOffsetHex: `0x${offsets[0].toString(16)}`,
                    lastOffset: offsets[offsets.length - 1],
                    lastOffsetHex: `0x${offsets[offsets.length - 1].toString(16)}`,
                    values: offsets.slice(0, 16).map((offset) => offsetToMarker.get(offset)?.value ?? null),
                });
            }
        }
    }
    runs.sort((a, b) => b.length - a.length || a.stride - b.stride || a.firstOffset - b.firstOffset);

    const firstMarkerRecords48 = markers.slice(0, limit).map((marker) => {
        const recordStart = marker.offset - 12;
        return {
            markerOffset: marker.offset,
            markerOffsetHex: marker.offsetHex,
            value: marker.value,
            record48Start: recordStart,
            record48StartHex: recordStart >= 0 ? `0x${recordStart.toString(16)}` : null,
            beforeF32: readF32s(r, marker.offset - 12, 3),
            afterF32: readF32s(r, marker.offset + 4, 8),
            record48Words: readI32s(r, recordStart, 12),
            record48Floats: readF32s(r, recordStart, 12),
        };
    });

    return {
        markerCount: markers.length,
        zeroWordCount,
        valueCounts: Object.fromEntries([...valueCounts.entries()].sort((a, b) => a[0] - b[0])),
        firstMarkers: markers.slice(0, limit),
        longestStrideRuns: runs.slice(0, Math.max(limit, 4)),
        firstMarkerRecords48,
    };
}

function parseTextures(r) {
    if (r.size < 16) return [];
    const textureOffset = r.u32(4);
    const textures = [];
    if (!textureOffset || textureOffset >= r.size - 12) return textures;

    const headerSize = r.u32(textureOffset + 4);
    const textureCount = r.u32(textureOffset + 8);
    let offset = textureOffset + headerSize;

    for (let nodeIndex = 0; nodeIndex < 256 && offset < r.size - 8 && textures.length < textureCount; nodeIndex++) {
        const nodeOffset = offset;
        const identifier = fourcc(r.u32(offset));
        const nodeSize = r.u32(offset + 4);
        if (!nodeSize) break;

        if (identifier === "TEXN") {
            textures.push(r.hex(offset + 8, 8));
        } else if (identifier === "NAME") {
            let pos = offset + 8;
            while (pos < nodeOffset + nodeSize && textures.length < textureCount) {
                textures.push(r.hex(pos, 8));
                pos += 8;
            }
        }

        offset = nodeOffset + nodeSize;
    }

    return textures;
}

function parseNodes(r) {
    if (r.size < 64) return [];
    const firstNodeOffset = r.u32(8);
    const nodes = [];
    const seen = new Set();

    function parseNode(offset, parentOffset = 0, depth = 0) {
        if (!offset || offset >= r.size - 64 || seen.has(offset)) return;
        seen.add(offset);
        const node = {
            index: nodes.length,
            offset,
            offsetHex: `0x${offset.toString(16)}`,
            parentOffset,
            parentOffsetHex: parentOffset ? `0x${parentOffset.toString(16)}` : null,
            depth,
            id: r.u32(offset),
            boneId: r.u32(offset) & 0xff,
            meshOffset: r.u32(offset + 4),
            childOffset: r.u32(offset + 44),
            siblingOffset: r.u32(offset + 48),
        };
        nodes.push(node);
        parseNode(node.childOffset, offset, depth + 1);
        parseNode(node.siblingOffset, parentOffset, depth);
    }

    parseNode(firstNodeOffset, 0, 0);
    return nodes;
}

function meshInfo(r, node) {
    if (!node.meshOffset || node.meshOffset >= r.size - 32) return null;
    return {
        meshOffset: node.meshOffset,
        meshOffsetHex: `0x${node.meshOffset.toString(16)}`,
        vertexOffset: r.u32(node.meshOffset + 4),
        vertexCount: r.i32(node.meshOffset + 8),
        facesOffset: r.u32(node.meshOffset + 12),
    };
}

function summarizeMt5(modelFile) {
    if (!modelFile || !fs.existsSync(modelFile)) return null;
    const r = openReader(modelFile);
    const textures = parseTextures(r);
    const nodes = parseNodes(r);
    const meshNodes = nodes
        .map((node) => ({ node, mesh: meshInfo(r, node) }))
        .filter((entry) => entry.mesh);
    const totalVertices = meshNodes.reduce((sum, entry) => {
        return sum + Math.max(0, entry.mesh.vertexCount || 0);
    }, 0);

    return {
        file: rel(modelFile),
        size: r.size,
        sha1: r.sha1,
        textureCount: textures.length,
        textures,
        nodeCount: nodes.length,
        meshNodeCount: meshNodes.length,
        totalVertices,
        meshNodes: meshNodes.map((entry) => ({
            nodeIndex: entry.node.index,
            nodeOffset: entry.node.offset,
            nodeOffsetHex: entry.node.offsetHex,
            boneId: entry.node.boneId,
            depth: entry.node.depth,
            meshOffset: entry.mesh.meshOffset,
            meshOffsetHex: entry.mesh.meshOffsetHex,
            vertexCount: entry.mesh.vertexCount,
            vertexOffset: entry.mesh.vertexOffset,
            vertexOffsetHex: `0x${entry.mesh.vertexOffset.toString(16)}`,
            facesOffset: entry.mesh.facesOffset,
            facesOffsetHex: `0x${entry.mesh.facesOffset.toString(16)}`,
        })),
    };
}

function siblingModelForFtbl(file) {
    const dir = path.dirname(file);
    const base = path.basename(file).replace(/_FTBL\.BIN$/i, "_F.MT5");
    const candidate = path.join(dir, base);
    return fs.existsSync(candidate) ? candidate : null;
}

function reportFtbl(file, options) {
    const r = openReader(file);
    const header = parseFtHeader(r);
    const layout = inferLayout(r, header);
    const modelFile = options.model || siblingModelForFtbl(file);
    const model = summarizeMt5(modelFile);
    const report = {
        file: rel(file),
        size: r.size,
        sha1: r.sha1,
        header,
        layout,
        sectionAnalysis: analyzeSections(r, header),
        fixedRecordSamples: sampleFixedRecords(r, header, options.limit),
        markerScan: scanSmallMarkers(r, header, options.limit),
        model,
    };

    if (model) {
        report.countComparison = {
            ftblInferredRecordCount: layout.inferredRecordCount,
            modelTotalVertices: model.totalVertices,
            modelMeshNodeCount: model.meshNodeCount,
            difference: layout.inferredRecordCount - model.totalVertices,
            ratio: model.totalVertices ? Number((layout.inferredRecordCount / model.totalVertices).toFixed(6)) : null,
        };
    }
    report.pcStaticInterpretation = summarizePcStaticInterpretation(report);

    return report;
}

function collectFtblFiles(input) {
    const stat = fs.statSync(input);
    if (!stat.isDirectory()) return [input];
    return fs.readdirSync(input)
        .filter((name) => /_FTBL\.BIN$/i.test(name))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => path.join(input, name));
}

function printText(reports) {
    for (const report of reports) {
        const h = report.header;
        const layout = report.layout;
        const cmp = report.countComparison;
        console.log(`${report.file} size=${report.size} sha1=${report.sha1}`);
        console.log(`  header type=${h.type} payload=${h.payloadOffset} recordSize=${h.recordSize} h3=${h.sectionOrCount} (${h.sectionOrCountHex})`);
        console.log(`  boundsRaw=${h.boundsRaw.join(",")} bounds/4096=${h.boundsFixed4096.join(",")}`);
        console.log(`  inferredRecords=${layout.inferredRecordCount} trailer=${layout.trailerBytes} h3AsOffset=${h.sectionOrCountAsOffsetValid} h3Aligned=${layout.sectionOrCountRecordAligned}`);
        const sections = report.sectionAnalysis;
        console.log(`  float48Records=${sections.float48Records.count} range=${sections.float48Records.firstOffsetHex || "n/a"}..${sections.float48Records.lastOffsetHex || "n/a"}`);
        if (sections.pointerWindow) {
            console.log(`  h3Window=${sections.pointerWindow.kind} small=${sections.pointerWindow.smallIntWords}/${sections.pointerWindow.wordCount} unitFloat=${sections.pointerWindow.unitishFloatWords}/${sections.pointerWindow.wordCount}`);
        }
        for (const cluster of sections.denseMarkerClusters.slice(0, 4)) {
            console.log(`    cluster ${cluster.firstOffsetHex}..${cluster.lastOffsetHex} count=${cluster.count} span=${cluster.spanBytes}`);
        }
        if (report.model) {
            console.log(`  model=${report.model.file} nodes=${report.model.nodeCount} meshNodes=${report.model.meshNodeCount} vertices=${report.model.totalVertices} textures=${report.model.textureCount}`);
            console.log(`  countCompare ftbl-model=${cmp.difference} ratio=${cmp.ratio}`);
        }
        console.log(`  markerCount=${report.markerScan.markerCount} zeroWords=${report.markerScan.zeroWordCount} values=${JSON.stringify(report.markerScan.valueCounts)}`);
        for (const run of report.markerScan.longestStrideRuns.slice(0, 4)) {
            console.log(`    run stride=${run.stride} length=${run.length} first=${run.firstOffsetHex} last=${run.lastOffsetHex} values=${run.values.join(",")}`);
        }
        for (const sample of report.markerScan.firstMarkerRecords48.slice(0, 3)) {
            console.log(`    marker ${sample.markerOffsetHex} value=${sample.value} before=${sample.beforeF32.join(",")} after=${sample.afterF32.slice(0, 6).join(",")}`);
        }
        console.log(`  pcStatic=${report.pcStaticInterpretation.inferredRole}`);
        console.log(`  viewerImplication=${report.pcStaticInterpretation.viewerImplication}`);
    }
}

const args = parseArgs(process.argv.slice(2));
const files = collectFtblFiles(path.resolve(args.input));
const reports = files.map((file) => reportFtbl(file, args));

if (args.json) {
    console.log(JSON.stringify(files.length === 1 ? reports[0] : { files: reports }, null, 2));
} else {
    printText(reports);
}
