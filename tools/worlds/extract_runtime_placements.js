#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_ASSET_URL = "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev/shenmue";
const RAM_BASE = 0x8c000000;
const NORMALIZED_MASK = 0x00ffffff;
const NODE_SIZE = 0x40;

function usage() {
    console.error([
        "Usage: node tools/worlds/extract_runtime_placements.js <capture-dir> <model-or-path>...",
        "",
        "Examples:",
        "  node tools/worlds/extract_runtime_placements.js captures/pvr/TIMESTAMP-frame-N \\",
        "    S1_JOMO_TANM4W3G.MT5 S1_JOMO_TANM4W4G.MT5",
        "",
        "A model name is fetched from the project's public asset bucket. A filesystem",
        "path may be supplied instead. Use --json for machine-readable output and",
        "--asset-url URL to override the asset bucket.",
        "",
        "Catalog scan:",
        "  node tools/worlds/extract_runtime_placements.js <capture-dir> --catalog-prefix S1_JOMO_ \\",
        "    --json --out .disc-work/jomo-runtime-placements.json",
    ].join("\n"));
}

function parseArgs(argv) {
    const args = {
        captureDirectory: "",
        models: [],
        json: false,
        assetUrl: DEFAULT_ASSET_URL,
        catalog: "public/models.json",
        catalogPrefix: "",
        output: "",
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--json") args.json = true;
        else if (arg === "--asset-url") args.assetUrl = argv[++index];
        else if (arg === "--catalog") args.catalog = argv[++index];
        else if (arg === "--catalog-prefix") args.catalogPrefix = argv[++index];
        else if (arg === "--out") args.output = argv[++index];
        else if (!args.captureDirectory) args.captureDirectory = arg;
        else args.models.push(arg);
    }
    if (
        !args.captureDirectory
        || (args.models.length === 0 && !args.catalogPrefix)
    ) {
        usage();
        process.exit(2);
    }
    return args;
}

function hexAddress(offset) {
    return `0x${(RAM_BASE + offset).toString(16).padStart(8, "0")}`;
}

function normalizedOffset(pointer) {
    return pointer & NORMALIZED_MASK;
}

function findAll(haystack, needle) {
    const offsets = [];
    for (let offset = haystack.indexOf(needle); offset >= 0; offset = haystack.indexOf(needle, offset + 1)) {
        offsets.push(offset);
    }
    return offsets;
}

function byteAgreement(left, right) {
    const count = Math.min(left.length, right.length);
    let equal = 0;
    for (let index = 0; index < count; index++) {
        if (left[index] === right[index]) equal++;
    }
    return count ? equal / count : 0;
}

async function loadModel(modelArgument, assetUrl) {
    if (fs.existsSync(modelArgument)) {
        return {
            name: path.basename(modelArgument),
            source: path.resolve(modelArgument),
            bytes: fs.readFileSync(modelArgument),
        };
    }

    const name = path.basename(modelArgument);
    const url = `${assetUrl.replace(/\/$/, "")}/${encodeURIComponent(name)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return {
        name,
        source: url,
        bytes: Buffer.from(await response.arrayBuffer()),
    };
}

function assertMt5(model) {
    if (model.bytes.length < 12 || model.bytes.toString("ascii", 0, 4) !== "HRCM") {
        throw new Error(`${model.source}: not an HRCM/MT5 file`);
    }
}

function locateRuntimeCopies(ram, model) {
    assertMt5(model);
    const headerProbe = model.bytes.subarray(0, 12);
    return findAll(ram, headerProbe).map((offset) => {
        const available = ram.subarray(offset, Math.min(ram.length, offset + model.bytes.length));
        return {
            offset,
            address: hexAddress(offset),
            byteAgreement: byteAgreement(model.bytes, available),
        };
    });
}

function parseRuntimeNodes(ram, modelBase, modelOffset) {
    const root = modelBase + modelOffset;
    const nodes = [];
    const visited = new Set();

    function visit(offset, parent = null, depth = 0) {
        if (
            !offset
            || offset + NODE_SIZE > ram.length
            || visited.has(offset)
        ) {
            return;
        }
        visited.add(offset);

        const child = normalizedOffset(ram.readUInt32LE(offset + 0x2c));
        const sibling = normalizedOffset(ram.readUInt32LE(offset + 0x30));
        const node = {
            offset,
            address: hexAddress(offset),
            parent,
            depth,
            flags: ram.readUInt32LE(offset),
            meshPointer: ram.readUInt32LE(offset + 4),
        };
        nodes.push(node);
        visit(child, node.address, depth + 1);
        visit(sibling, parent, depth);
    }

    visit(root);
    return nodes;
}

function findOwningHmdl(ram, referenceOffset) {
    const searchStart = Math.max(0, referenceOffset - 0x800);
    for (let offset = referenceOffset & ~3; offset >= searchStart; offset -= 4) {
        if (ram.toString("ascii", offset, offset + 4) !== "HMDL") continue;
        const size = ram.readUInt32LE(offset + 4);
        if (size < 0x40 || size > 0x800) continue;
        if (referenceOffset >= offset && referenceOffset < offset + size) return offset;
    }
    return null;
}

function signedAngle(raw) {
    const low = raw & 0xffff;
    return low >= 0x8000 ? low - 0x10000 : low;
}

function decodeTask(ram, taskOffset, hmdlOffset) {
    if (ram.toString("ascii", taskOffset, taskOffset + 4) !== "TASK") return null;

    const position = [0x28, 0x2c, 0x30].map((offset) => ram.readFloatLE(taskOffset + offset));
    const rotationRaw = [0x34, 0x38, 0x3c].map((offset) => ram.readUInt32LE(taskOffset + offset));
    const rotationSigned = rotationRaw.map(signedAngle);
    const rotationDegrees = rotationSigned.map((value) => value * 360 / 0x10000);
    const scale = [0x54, 0x58, 0x5c].map((offset) => ram.readFloatLE(taskOffset + offset));
    if (![...position, ...scale].every(Number.isFinite)) return null;

    return {
        hmdlAddress: hexAddress(hmdlOffset),
        taskAddress: hexAddress(taskOffset),
        position,
        rotationRaw: rotationRaw.map((value) => `0x${value.toString(16).padStart(8, "0")}`),
        rotationSigned,
        rotationDegrees,
        scale,
    };
}

function recoverInstances(ram, runtimeCopy, modelSize, modelOffset) {
    const nodes = parseRuntimeNodes(ram, runtimeCopy.offset, modelOffset);
    const hmdlOffsets = new Set();
    for (const node of nodes) {
        if (!node.meshPointer) continue;
        const pointer = Buffer.allocUnsafe(4);
        pointer.writeUInt32LE(node.meshPointer);
        for (const reference of findAll(ram, pointer)) {
            if (
                reference >= runtimeCopy.offset
                && reference < runtimeCopy.offset + modelSize
            ) {
                continue;
            }
            const hmdl = findOwningHmdl(ram, reference);
            if (hmdl !== null) hmdlOffsets.add(hmdl);
        }
    }

    const taskOffsets = findAll(ram, Buffer.from("TASK"));
    const instances = [];
    for (const taskOffset of taskOffsets) {
        if (taskOffset + 0x64 > ram.length) continue;
        // TASK + 0x60 is the renderer's direct pointer to an instantiated HMDL
        // node. The HMDL immediately preceding a TASK is often an interaction
        // or collision proxy belonging to a different model.
        const renderNodeOffset = normalizedOffset(
            ram.readUInt32LE(taskOffset + 0x60),
        );
        if (!renderNodeOffset) continue;
        const owningHmdl = findOwningHmdl(ram, renderNodeOffset);
        if (owningHmdl === null || !hmdlOffsets.has(owningHmdl)) continue;
        const instance = decodeTask(ram, taskOffset, owningHmdl);
        if (instance) instances.push(instance);
    }

    return {
        nodes,
        instances: instances.sort((left, right) => (
            left.taskAddress.localeCompare(right.taskAddress)
        )),
    };
}

function rounded(values, places = 6) {
    const factor = 10 ** places;
    return values.map((value) => Math.round(value * factor) / factor);
}

function textReport(report) {
    const lines = [
        `Runtime placement capture: ${report.captureDirectory}`,
        `RAM: ${report.ramBytes} bytes`,
    ];
    for (const model of report.models) {
        lines.push("");
        lines.push(`${model.name}`);
        if (model.runtimeCopies.length === 0) {
            lines.push("  no runtime HRCM copy found");
            continue;
        }
        for (const copy of model.runtimeCopies) {
            lines.push(
                `  model ${copy.address} agreement=${(copy.byteAgreement * 100).toFixed(2)}%`
                + ` nodes=${copy.nodeCount} instances=${copy.instances.length}`,
            );
            for (const instance of copy.instances) {
                lines.push(
                    `    ${instance.taskAddress}`
                    + ` position=${rounded(instance.position).join(",")}`
                    + ` rotationDeg=${rounded(instance.rotationDegrees, 3).join(",")}`
                    + ` scale=${rounded(instance.scale).join(",")}`,
                );
            }
        }
    }
    return lines.join("\n");
}

const args = parseArgs(process.argv.slice(2));
if (args.catalogPrefix) {
    const catalogPath = path.resolve(args.catalog);
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    if (!Array.isArray(catalog)) {
        throw new Error(`${catalogPath}: expected a JSON array of model names`);
    }
    args.models.push(...catalog.filter((name) => (
        typeof name === "string" && name.startsWith(args.catalogPrefix)
    )));
}
args.models = [...new Set(args.models)];
const captureDirectory = path.resolve(args.captureDirectory);
const ramPath = path.join(captureDirectory, "ram.bin");
const ram = fs.readFileSync(ramPath);
async function inspectModel(modelArgument) {
    const model = await loadModel(modelArgument, args.assetUrl);
    const modelOffset = model.bytes.readUInt32LE(8);
    const runtimeCopies = locateRuntimeCopies(ram, model)
        // Relocated pointers and mutable runtime node state account for the
        // disagreement. JU00 has independently verified live copies as low as
        // 94.74%, so retain 90%+ candidates and let the catalog-wide
        // best-by-address reconciliation below reject sibling/header aliases.
        .filter((copy) => copy.byteAgreement >= 0.9)
        .map((copy) => {
            const recovered = recoverInstances(
                ram,
                copy,
                model.bytes.length,
                modelOffset,
            );
            return {
                ...copy,
                nodeCount: recovered.nodes.length,
                instances: recovered.instances,
            };
        });
    return {
        name: model.name,
        source: model.source,
        modelBytes: model.bytes.length,
        runtimeCopies,
    };
}

async function mapWithConcurrency(values, concurrency, callback) {
    const results = new Array(values.length);
    let nextIndex = 0;
    async function worker() {
        while (nextIndex < values.length) {
            const index = nextIndex++;
            results[index] = await callback(values[index]);
        }
    }
    await Promise.all(
        Array.from(
            { length: Math.min(concurrency, values.length) },
            () => worker(),
        ),
    );
    return results;
}

const models = await mapWithConcurrency(args.models, 8, inspectModel);
if (args.catalogPrefix) {
    const bestByAddress = new Map();
    for (const model of models) {
        for (const copy of model.runtimeCopies) {
            const current = bestByAddress.get(copy.address);
            if (!current || copy.byteAgreement > current.copy.byteAgreement) {
                bestByAddress.set(copy.address, { model, copy });
            }
        }
    }
    for (const model of models) {
        model.runtimeCopies = model.runtimeCopies.filter(
            (copy) => bestByAddress.get(copy.address)?.model === model,
        );
    }
}
const report = {
    schema: "shenmue-runtime-placement-capture-v1",
    captureDirectory,
    ramBytes: ram.length,
    models,
};

const output = args.json ? JSON.stringify(report, null, 2) : textReport(report);
if (args.output) {
    const outputPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${output}\n`);
}
console.log(args.output ? `Wrote ${path.resolve(args.output)}` : output);
