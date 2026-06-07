#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
    console.error([
        "Usage: node tools/audit_mt5_model_state.js <model.MT5> [--json]",
        "",
        "Scans MT5/HRCM mesh opcodes across all nodes and textures, with",
        "PC HRCM length checks and wudecon/ShenmueDKSharp rule-compat flags.",
    ].join("\n"));
}

function parseArgs(argv) {
    const args = { file: null, json: false };
    for (const arg of argv) {
        if (arg === "--json") args.json = true;
        else if (!args.file) args.file = arg;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!args.file) {
        usage();
        process.exit(2);
    }
    return args;
}

function openReader(file) {
    const bytes = fs.readFileSync(file);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
        bytes,
        size: bytes.byteLength,
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
    );
}

function formatHex(value) {
    return `0x${value.toString(16)}`;
}

function formatOffset(value) {
    return `0x${value.toString(16)}`;
}

function markerRole(markerSigned) {
    if (markerSigned === -0x43) return "faceHeadHook";
    if (markerSigned === -0x44) return "facePatchDestination";
    if (markerSigned === -1) return "genericChild";
    return "";
}

function rangeText(stats, digits = 3) {
    if (!stats || stats.count === 0) return "n/a";
    return `${stats.min.toFixed(digits)}..${stats.max.toFixed(digits)}`;
}

function addRange(stats, value) {
    if (!Number.isFinite(value)) return;
    stats.min = Math.min(stats.min, value);
    stats.max = Math.max(stats.max, value);
    stats.sum += value;
    stats.count++;
}

function createRange() {
    return { min: Infinity, max: -Infinity, sum: 0, count: 0 };
}

function hasUv(type) {
    return type === 0x11 || type === 0x14 || type === 0x19 || type === 0x1c;
}

function hasColor(type) {
    return type === 0x12 || type === 0x14 || type === 0x1a || type === 0x1c;
}

function isPcLengthPrefixedStripType(type) {
    return (type >= 0x10 && type <= 0x14) || (type >= 0x18 && type <= 0x1c);
}

function isWudeconStripType(type) {
    return (type >= 0x10 && type <= 0x14) || (type >= 0x18 && type <= 0x1c);
}

function convertUv(rawU, rawV, state) {
    let u = rawU;
    let v = rawV;

    if (state.isUvHigh) {
        u *= 0.000015258789;
        v *= 0.000015258789;
    } else {
        u = rawU / state.uvSize;
        v = rawV / state.uvSize;
    }

    if (state.mirrorU && u > 1.0) u /= 2.0;
    if (state.mirrorV && v > 1.0) v /= 2.0;
    return [u, v];
}

function parseTextures(r) {
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
    const firstNodeOffset = r.u32(8);
    const nodes = [];
    const seen = new Set();

    function parseNode(offset, parentOffset = 0, depth = 0, siblingIndex = 0) {
        if (!offset || offset >= r.size - 64 || seen.has(offset)) return;
        seen.add(offset);
        const markerUnsigned = r.u16(offset);
        const markerSigned = r.i16(offset);
        const node = {
            offset,
            parentOffset,
            depth,
            siblingIndex,
            id: r.u32(offset),
            markerUnsigned,
            markerSigned,
            markerRole: markerRole(markerSigned),
            boneId: r.u32(offset) & 0xff,
            meshOffset: r.u32(offset + 4),
            childOffset: r.u32(offset + 44),
            siblingOffset: r.u32(offset + 48),
        };
        nodes.push(node);
        parseNode(node.childOffset, offset, depth + 1, 0);
        parseNode(node.siblingOffset, parentOffset, depth, siblingIndex + 1);
    }

    parseNode(firstNodeOffset, 0);
    return nodes;
}

function meshInfo(r, node) {
    if (!node.meshOffset || node.meshOffset >= r.size - 32) return null;
    return {
        meshOffset: node.meshOffset,
        vertexOffset: r.u32(node.meshOffset + 4),
        vertexCount: r.i32(node.meshOffset + 8),
        facesOffset: r.u32(node.meshOffset + 12),
    };
}

function nodeReference(r, node, extra = {}) {
    const mesh = meshInfo(r, node);
    return {
        offset: node.offset,
        offsetHex: formatOffset(node.offset),
        parentOffset: node.parentOffset || null,
        parentOffsetHex: node.parentOffset ? formatOffset(node.parentOffset) : null,
        depth: node.depth,
        siblingIndex: node.siblingIndex,
        markerUnsigned: node.markerUnsigned,
        markerUnsignedHex: formatHex(node.markerUnsigned),
        markerSigned: node.markerSigned,
        markerRole: node.markerRole,
        meshOffset: node.meshOffset || null,
        meshOffsetHex: node.meshOffset ? formatOffset(node.meshOffset) : null,
        vertexCount: mesh?.vertexCount ?? null,
        childOffset: node.childOffset || null,
        childOffsetHex: node.childOffset ? formatOffset(node.childOffset) : null,
        siblingOffset: node.siblingOffset || null,
        siblingOffsetHex: node.siblingOffset ? formatOffset(node.siblingOffset) : null,
        ...extra,
    };
}

function buildFaceMarkerAudit(r, nodes) {
    const nodesByOffset = new Map(nodes.map((node) => [node.offset, node]));
    const markerNodes = nodes
        .filter((node) => node.markerSigned === -0x43 || node.markerSigned === -0x44)
        .map((node) => nodeReference(r, node));
    const headHooks = nodes.filter((node) => node.markerSigned === -0x43);
    const patchDestinations = nodes.filter((node) => node.markerSigned === -0x44);
    const headSelections = [];

    for (let headIndex = 0; headIndex < headHooks.length; headIndex++) {
        const head = headHooks[headIndex];
        const children = [];
        let child = nodesByOffset.get(head.childOffset);
        let childIndex = 0;
        while (child) {
            children.push(nodeReference(r, child, {
                faceStateHeadIndex: headIndex,
                faceStateChildIndex: childIndex,
            }));
            child = nodesByOffset.get(child.siblingOffset);
            childIndex++;
        }
        headSelections.push({
            headIndex,
            head: nodeReference(r, head, { faceStateHeadIndex: headIndex }),
            children,
        });
    }

    return {
        markerNodes,
        headHookCount: headHooks.length,
        patchDestinationCount: patchDestinations.length,
        headSelections,
        pcFacePatchImplication: patchDestinations.length > 0
            ? "PC FACE patch path can find a raw -0x44 destination node in this MT5."
            : "PC FACE patch path requires a -0x44 destination node, but this MT5 does not expose one in raw nodes.",
    };
}

function createTextureSummary(index, textureHex) {
    return {
        textureIndex: index,
        textureHex,
        stripGroups: 0,
        strips: 0,
        stripVertices: 0,
        stripTypes: {},
        attrGroups: {},
        uvSizes: {},
        uvhValues: {},
        mirrorStates: {},
        fixedState0008: {},
        fixedState000a: {},
        rawU: createRange(),
        rawV: createRange(),
        u: createRange(),
        v: createRange(),
        pcLengthMismatchGroups: 0,
        pcPaddingGroups: 0,
        pcOverrunGroups: 0,
        unsupportedByWudeconGroups: 0,
        stripsBeforeAttribute: 0,
        mirrorResizeNeeded: false,
    };
}

function increment(map, key, amount = 1) {
    map[key] = (map[key] || 0) + amount;
}

function scanMesh(r, node, textures, audit) {
    const mesh = meshInfo(r, node);
    if (!mesh || !mesh.facesOffset || mesh.facesOffset >= r.size - 2) return;

    let offset = mesh.facesOffset;
    let guard = 0;
    const state = {
        textureIndex: 0,
        isUvHigh: false,
        hasAttribute: false,
        mirrorU: false,
        mirrorV: false,
        // PC Shenmue.exe FUN_140065160 initializes this to 0x100 before
        // opcode 0x0b can override it.
        uvSize: 256,
        attrType: null,
        attrHex: "",
        fixedState0008: null,
        fixedState000a: null,
    };

    while (offset < r.size - 2 && guard++ < 10000) {
        const entryOffset = offset;
        const type = r.u16(offset);
        offset += 2;

        if (type === 0x8000) break;
        if (type === 0x0000 || type === 0xffff) continue;

        increment(audit.opcodeCounts, formatHex(type));

        if (type >= 0x0002 && type <= 0x0007) {
            const size = r.u16(offset);
            offset += 2;
            state.attrType = type;
            state.attrHex = r.hex(offset, size);
            const firstByte = size >= 1 ? r.bytes[offset] : 0;
            const flagsByte = size >= 11 ? r.bytes[offset + 10] : 0;
            state.isUvHigh = (firstByte & 1) === 1;
            state.mirrorU = (flagsByte & 4) === 4;
            state.mirrorV = (flagsByte & 2) === 2;
            state.hasAttribute = true;
            offset += size;
            continue;
        }

        if (type === 0x0009) {
            state.textureIndex = r.u16(offset);
            offset += 2;
            continue;
        }

        if (type === 0x000b) {
            state.uvSize = r.u16(offset) || state.uvSize;
            offset += 2;
            continue;
        }

        if (type === 0x0008 || type === 0x000a) {
            const value = r.u16(offset);
            if (type === 0x0008) {
                state.fixedState0008 = value;
            } else {
                state.fixedState000a = value;
            }
            offset += 2;
            continue;
        }

        if (type >= 0x000c && type <= 0x000f) {
            const size = r.u16(offset);
            increment(audit.lengthPrefixedStateRecords, formatHex(type));
            if ((type === 0x000e || type === 0x000f) && size !== 8) {
                audit.wudeconFixedSkipMismatchRecords.push({ nodeOffset: node.offset, entryOffset, type, size });
            }
            if (type === 0x000c || type === 0x000d) {
                audit.stateRecordsNotInWudeconEnum.push({ nodeOffset: node.offset, entryOffset, type, size });
            }
            offset += 2 + size;
            continue;
        }

        if (type === 0x0015 || type === 0x001d) {
            const size = r.u16(offset);
            increment(audit.lengthPrefixedStateRecords, formatHex(type));
            offset += 2 + size;
            continue;
        }

        if (isPcLengthPrefixedStripType(type)) {
            const textureIndex = state.textureIndex;
            const summary = audit.textures[textureIndex] || createTextureSummary(textureIndex, textures[textureIndex] || "");
            audit.textures[textureIndex] = summary;

            const entryLengthBytes = r.u16(offset);
            const stripCount = r.u16(offset + 2);
            const expectedEntryEnd = entryOffset + 4 + entryLengthBytes;
            offset += 4;
            const usesUv = hasUv(type);
            const usesColor = hasColor(type);
            const typeKey = formatHex(type);
            const attrKey = [
                `attr=${state.attrType === null ? "none" : formatHex(state.attrType)}`,
                `data=${state.attrHex || "none"}`,
            ].join(" ");
            const mirrorKey = `u=${state.mirrorU} v=${state.mirrorV}`;
            const state0008Key = state.fixedState0008 === null ? "none" : formatHex(state.fixedState0008);
            const state000aKey = state.fixedState000a === null ? "none" : formatHex(state.fixedState000a);

            summary.stripGroups++;
            summary.strips += stripCount;
            increment(summary.stripTypes, typeKey);
            increment(summary.attrGroups, attrKey);
            increment(summary.uvSizes, String(state.uvSize));
            increment(summary.uvhValues, String(state.isUvHigh));
            increment(summary.mirrorStates, mirrorKey);
            increment(summary.fixedState0008, state0008Key);
            increment(summary.fixedState000a, state000aKey);
            if (!isWudeconStripType(type)) summary.unsupportedByWudeconGroups++;
            if (!state.hasAttribute) summary.stripsBeforeAttribute += stripCount;
            if (state.mirrorU || state.mirrorV) summary.mirrorResizeNeeded = true;

            for (let stripIndex = 0; stripIndex < stripCount && offset < r.size - 2; stripIndex++) {
                const stripLengthRaw = r.i16(offset);
                offset += 2;
                const stripLength = Math.abs(stripLengthRaw);
                summary.stripVertices += stripLength;

                for (let i = 0; i < stripLength && offset < r.size - 2; i++) {
                    offset += 2;
                    if (usesUv) {
                        const rawU = r.i16(offset);
                        const rawV = r.i16(offset + 2);
                        offset += 4;
                        const [u, v] = convertUv(rawU, rawV, state);
                        addRange(summary.rawU, rawU);
                        addRange(summary.rawV, rawV);
                        addRange(summary.u, u);
                        addRange(summary.v, v);
                    }
                    if (usesColor) offset += 4;
                }
            }

            const parsedEntryEnd = offset;
            const overrunBytes = Math.max(0, parsedEntryEnd - expectedEntryEnd);
            if (parsedEntryEnd < expectedEntryEnd && expectedEntryEnd <= r.size) {
                summary.pcPaddingGroups++;
                offset = expectedEntryEnd;
            }
            if (overrunBytes > 0 || expectedEntryEnd > r.size) {
                summary.pcLengthMismatchGroups++;
            }
            if (overrunBytes > 0) summary.pcOverrunGroups++;
            continue;
        }

        audit.unknownRecords.push({ nodeOffset: node.offset, entryOffset, type });
        break;
    }
}

function rangeJson(stats) {
    if (!stats || stats.count === 0) return null;
    return {
        min: stats.min,
        max: stats.max,
        avg: stats.sum / stats.count,
        count: stats.count,
    };
}

function finalizeTextureSummary(summary) {
    return {
        ...summary,
        rawU: rangeJson(summary.rawU),
        rawV: rangeJson(summary.rawV),
        u: rangeJson(summary.u),
        v: rangeJson(summary.v),
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const r = openReader(args.file);
    const signature = fourcc(r.u32(0));
    if (signature !== "HRCM") {
        throw new Error(`Expected HRCM signature, got ${signature}`);
    }

    const textures = parseTextures(r);
    const nodes = parseNodes(r);
    const audit = {
        file: path.resolve(args.file),
        textureCount: textures.length,
        textures: textures.map((hex, index) => createTextureSummary(index, hex)),
        nodeCount: nodes.length,
        meshNodeCount: 0,
        faceMarkers: buildFaceMarkerAudit(r, nodes),
        opcodeCounts: {},
        lengthPrefixedStateRecords: {},
        wudeconFixedSkipMismatchRecords: [],
        stateRecordsNotInWudeconEnum: [],
        unknownRecords: [],
    };

    for (const node of nodes) {
        if (node.meshOffset) audit.meshNodeCount++;
        scanMesh(r, node, textures, audit);
    }

    audit.textures = audit.textures
        .filter(Boolean)
        .map(finalizeTextureSummary);

    if (args.json) {
        console.log(JSON.stringify(audit, null, 2));
        return;
    }

    console.log(`MT5 state audit: ${audit.file}`);
    console.log(`${audit.nodeCount} nodes, ${audit.meshNodeCount} mesh nodes, ${audit.textureCount} textures`);
    console.log(`FACE markers: -0x43 head hooks=${audit.faceMarkers.headHookCount}, -0x44 patch destinations=${audit.faceMarkers.patchDestinationCount}`);
    for (const marker of audit.faceMarkers.markerNodes) {
        console.log([
            `  ${marker.offsetHex}`,
            marker.markerRole,
            `marker=${marker.markerSigned} (${marker.markerUnsignedHex})`,
            `parent=${marker.parentOffsetHex || "none"}`,
            `child=${marker.childOffsetHex || "none"}`,
            `sibling=${marker.siblingOffsetHex || "none"}`,
            `mesh=${marker.meshOffsetHex || "none"}`,
            `verts=${marker.vertexCount ?? "none"}`,
        ].join(" "));
    }
    for (const selection of audit.faceMarkers.headSelections) {
        const childText = selection.children
            .map((child) => `${child.faceStateChildIndex}:${child.offsetHex}/marker=${child.markerSigned}/verts=${child.vertexCount ?? "none"}`)
            .join(", ");
        console.log(`  PC FACE headIndex ${selection.headIndex} selects children: ${childText || "none"}`);
    }
    console.log(`  ${audit.faceMarkers.pcFacePatchImplication}`);
    console.log("");
    console.log("Global opcode counts:");
    for (const [opcode, count] of Object.entries(audit.opcodeCounts).sort()) {
        console.log(`  ${opcode.padStart(6, " ")}  ${String(count).padStart(4, " ")}`);
    }
    console.log("");
    console.log("Textures:");
    for (const texture of audit.textures) {
        if (texture.stripGroups === 0) continue;
        const issues = [];
        if (texture.pcLengthMismatchGroups) issues.push(`pcLenMismatch=${texture.pcLengthMismatchGroups}`);
        if (texture.pcPaddingGroups) issues.push(`pcPad=${texture.pcPaddingGroups}`);
        if (texture.unsupportedByWudeconGroups) issues.push(`notWudecon=${texture.unsupportedByWudeconGroups}`);
        if (texture.stripsBeforeAttribute) issues.push(`noAttr=${texture.stripsBeforeAttribute}`);
        if (texture.mirrorResizeNeeded) issues.push("mirrorResize");

        console.log([
            `${texture.textureIndex}:${texture.textureHex}`,
            `groups=${texture.stripGroups}`,
            `strips=${texture.strips}`,
            `verts=${texture.stripVertices}`,
            `types=${Object.keys(texture.stripTypes).join(",")}`,
            `uvh=${Object.keys(texture.uvhValues).join(",")}`,
            `mirror=${Object.keys(texture.mirrorStates).join("|")}`,
            `uvSize=${Object.keys(texture.uvSizes).join(",")}`,
            `s8=${Object.keys(texture.fixedState0008).join("|")}`,
            `sA=${Object.keys(texture.fixedState000a).join("|")}`,
            `u=${rangeText(texture.u)}`,
            `v=${rangeText(texture.v)}`,
            issues.length ? `issues=${issues.join(",")}` : "issues=none",
        ].join(" "));
    }

    console.log("");
    console.log(`0x0e/0x0f fixed-skip mismatches vs wudecon: ${audit.wudeconFixedSkipMismatchRecords.length}`);
    console.log(`0x0c/0x0d state records not in wudecon enum: ${audit.stateRecordsNotInWudeconEnum.length}`);
    console.log(`Unknown records: ${audit.unknownRecords.length}`);
}

main();
