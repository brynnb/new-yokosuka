#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const DEFAULT_MATRIX_BASE = 0x8cc06e80;
const DEFAULT_MATRIX_COUNT = 37;
const DEFAULT_MATRIX_STRIDE = 0x40;
const DEFAULT_COPY_PC = 0x0c1d1a42;
const DEFAULT_COPY_RETURN = 0x0c12d736;

function usage() {
    console.error([
        "Usage: node tools/animation/analyze_ryo_render_routing.js <fpu-read-trace.csv> <model.MT5> [--json]",
        "",
        "Recovers Shenmue's runtime-control-matrix to MT5 render-node routing from",
        "an interpreter FPU-read trace. The default copy site is the first read in",
        "the game's 4x4 matrix copy at PC 0x0C1D1A42, called from 0x0C12D736.",
    ].join("\n"));
}

function parseInteger(text) {
    const value = Number.parseInt(text, 0);
    if (!Number.isSafeInteger(value)) throw new Error(`Invalid integer: ${text}`);
    return value;
}

function parseArgs(argv) {
    const args = {
        trace: "",
        model: "",
        json: false,
        matrixBase: DEFAULT_MATRIX_BASE,
        matrixCount: DEFAULT_MATRIX_COUNT,
        matrixStride: DEFAULT_MATRIX_STRIDE,
        copyPc: DEFAULT_COPY_PC,
        copyReturn: DEFAULT_COPY_RETURN,
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--json") args.json = true;
        else if (arg === "--matrix-base") args.matrixBase = parseInteger(argv[++index]);
        else if (arg === "--matrix-count") args.matrixCount = parseInteger(argv[++index]);
        else if (arg === "--matrix-stride") args.matrixStride = parseInteger(argv[++index]);
        else if (arg === "--copy-pc") args.copyPc = parseInteger(argv[++index]);
        else if (arg === "--copy-return") args.copyReturn = parseInteger(argv[++index]);
        else if (!args.trace) args.trace = arg;
        else if (!args.model) args.model = arg;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!args.trace || !args.model) {
        usage();
        process.exit(2);
    }
    return args;
}

function normalizedAddress(address) {
    return address & 0x1fffffff;
}

function signedLow16(value) {
    const low = value & 0xffff;
    return low >= 0x8000 ? low - 0x10000 : low;
}

function formatSignedKey(value) {
    return value < 0
        ? `-${Math.abs(value).toString(16).padStart(2, "0")}`
        : value.toString(16).padStart(2, "0");
}

function parseMt5Nodes(file) {
    const bytes = fs.readFileSync(file);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u32 = (offset) => view.getUint32(offset, true);
    const i32 = (offset) => view.getInt32(offset, true);
    const f32 = (offset) => view.getFloat32(offset, true);
    const nodes = [];
    const seen = new Set();

    function visit(offset, parentOffset = 0, depth = 0) {
        if (!offset || offset + 64 > bytes.length || seen.has(offset)) return;
        seen.add(offset);
        const flags = u32(offset);
        const node = {
            index: nodes.length,
            offset,
            parentOffset,
            depth,
            flags,
            renderKey: signedLow16(flags),
            meshOffset: u32(offset + 4),
            rotationRaw: [i32(offset + 8), i32(offset + 12), i32(offset + 16)],
            scale: [f32(offset + 20), f32(offset + 24), f32(offset + 28)],
            position: [f32(offset + 32), f32(offset + 36), f32(offset + 40)],
            childOffset: u32(offset + 44),
            siblingOffset: u32(offset + 48),
        };
        nodes.push(node);
        visit(node.childOffset, offset, depth + 1);
        visit(node.siblingOffset, parentOffset, depth);
    }

    visit(u32(8));
    const indexByOffset = new Map(nodes.map((node) => [node.offset, node.index]));
    return nodes.map((node) => ({
        ...node,
        parent: indexByOffset.get(node.parentOffset) ?? null,
    }));
}

function splitCsvHeader(line) {
    const names = line.split(",");
    return new Map(names.map((name, index) => [name, index]));
}

async function parseRoutingTrace(file, args) {
    const stream = fs.createReadStream(file);
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let columns = null;
    const observations = new Map();
    let matchingReadCount = 0;

    for await (const line of lines) {
        if (!columns) {
            columns = splitCsvHeader(line);
            for (const required of ["pc", "address", "pr", "r0", "r1"]) {
                if (!columns.has(required)) {
                    throw new Error(`${file}: missing required column ${required}`);
                }
            }
            continue;
        }
        const values = line.split(",");
        const pc = Number.parseInt(values[columns.get("pc")], 16);
        const returnAddress = Number.parseInt(values[columns.get("pr")], 16);
        if (pc !== args.copyPc || returnAddress !== args.copyReturn) continue;

        const address = Number.parseInt(values[columns.get("address")], 16);
        const delta = normalizedAddress(address) - normalizedAddress(args.matrixBase);
        if (
            delta < 0
            || delta % args.matrixStride !== 0
            || delta >= args.matrixCount * args.matrixStride
        ) {
            continue;
        }

        const matrixIndex = delta / args.matrixStride;
        const renderKey = signedLow16(Number.parseInt(values[columns.get("r1")], 16));
        const destinationAddress = Number.parseInt(values[columns.get("r0")], 16);
        const key = `${renderKey}:${matrixIndex}:${destinationAddress}`;
        const observation = observations.get(key) || {
            renderKey,
            matrixIndex,
            sourceAddress: address,
            destinationAddress,
            count: 0,
        };
        observation.count++;
        observations.set(key, observation);
        matchingReadCount++;
    }

    return {
        matchingReadCount,
        observations: [...observations.values()].sort(
            (left, right) => left.renderKey - right.renderKey
                || left.matrixIndex - right.matrixIndex,
        ),
    };
}

function buildReport(args, trace, nodes) {
    const nodesByKey = new Map();
    for (const node of nodes) {
        if (!nodesByKey.has(node.renderKey)) nodesByKey.set(node.renderKey, []);
        nodesByKey.get(node.renderKey).push(node);
    }

    const routes = trace.observations.map((observation) => {
        const matches = nodesByKey.get(observation.renderKey) || [];
        return {
            renderKey: observation.renderKey,
            renderKeyHex: formatSignedKey(observation.renderKey),
            matrixIndex: observation.matrixIndex,
            sourceAddress: `0x${observation.sourceAddress.toString(16)}`,
            destinationAddress: `0x${observation.destinationAddress.toString(16)}`,
            observationCount: observation.count,
            matchingNodes: matches.map((node) => ({
                index: node.index,
                offset: `0x${node.offset.toString(16)}`,
                parent: node.parent,
                hasMesh: node.meshOffset !== 0,
                position: node.position.map((value) => Number(value.toFixed(9))),
            })),
        };
    });

    const routeByKey = new Map();
    for (const route of routes) {
        if (!routeByKey.has(route.renderKey)) routeByKey.set(route.renderKey, []);
        routeByKey.get(route.renderKey).push(route);
    }
    const conflictingKeys = [...routeByKey]
        .filter(([, entries]) => (
            new Set(entries.map((entry) => entry.matrixIndex)).size !== 1
        ))
        .map(([renderKey]) => renderKey);
    const unresolvedRoutes = routes.filter((route) => route.matchingNodes.length === 0);
    const ambiguousRoutes = routes.filter((route) => route.matchingNodes.length > 1);

    return {
        schema: "shenmue-runtime-render-routing-v1",
        trace: path.resolve(args.trace),
        model: path.resolve(args.model),
        matrixBase: `0x${args.matrixBase.toString(16)}`,
        matrixCount: args.matrixCount,
        matrixStride: args.matrixStride,
        copyPc: `0x${args.copyPc.toString(16)}`,
        copyReturn: `0x${args.copyReturn.toString(16)}`,
        modelNodeCount: nodes.length,
        matchingReadCount: trace.matchingReadCount,
        routeCount: routes.length,
        conflictingKeys,
        unresolvedRouteCount: unresolvedRoutes.length,
        ambiguousRouteCount: ambiguousRoutes.length,
        routes,
    };
}

function printReport(report) {
    console.log(`Ryo render routing: ${report.trace}`);
    console.log(`model=${report.model} nodes=${report.modelNodeCount}`);
    console.log([
        `copy=${report.copyPc}`,
        `caller=${report.copyReturn}`,
        `reads=${report.matchingReadCount}`,
        `routes=${report.routeCount}`,
        `conflicts=${report.conflictingKeys.length}`,
        `unresolved=${report.unresolvedRouteCount}`,
        `ambiguous=${report.ambiguousRouteCount}`,
    ].join(" "));
    console.log("key   MT5 node(s)   runtime matrix   observations   destination");
    for (const route of report.routes) {
        const nodeIndices = route.matchingNodes.map((node) => node.index).join("/") || "-";
        console.log([
            route.renderKeyHex.padStart(4),
            nodeIndices.padStart(11),
            String(route.matrixIndex).padStart(16),
            String(route.observationCount).padStart(14),
            route.destinationAddress.padStart(13),
        ].join("   "));
    }
}

const args = parseArgs(process.argv.slice(2));
args.trace = path.resolve(args.trace);
args.model = path.resolve(args.model);
const nodes = parseMt5Nodes(args.model);
const trace = await parseRoutingTrace(args.trace, args);
const report = buildReport(args, trace, nodes);
if (args.json) console.log(JSON.stringify(report, null, 2));
else printReport(report);
