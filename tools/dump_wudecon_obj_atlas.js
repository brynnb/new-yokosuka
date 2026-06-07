#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_TEXTURE_HEX = "a64b425f4b414a5f";

function usage() {
    console.error([
        "Usage: node tools/dump_wudecon_obj_atlas.js <model.obj> [--texture HEX] [--material NAME] [--json] [--limit N] [--vertices]",
        "",
        `Default --texture is ${DEFAULT_TEXTURE_HEX} (Ryo YKB_KAJ face/side-head atlas).`,
    ].join("\n"));
}

function parseArgs(argv) {
    const args = {
        file: null,
        texture: DEFAULT_TEXTURE_HEX,
        material: "",
        json: false,
        limit: 24,
        vertices: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--texture") {
            args.texture = argv[++i] || "";
        } else if (arg === "--material") {
            args.material = argv[++i] || "";
        } else if (arg === "--json") {
            args.json = true;
        } else if (arg === "--vertices") {
            args.vertices = true;
        } else if (arg === "--limit") {
            args.limit = Number.parseInt(argv[++i] || "24", 10);
        } else if (!args.file) {
            args.file = arg;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!args.file) {
        usage();
        process.exit(2);
    }
    if (!Number.isFinite(args.limit) || args.limit < 0) args.limit = 24;
    args.texture = String(args.texture || "").toLowerCase().replace(/^0x/, "");
    return args;
}

function reverseHexBytes(hex) {
    const clean = String(hex || "").toLowerCase().replace(/^0x/, "");
    if (clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
        throw new Error(`Invalid hex texture ID: ${hex}`);
    }
    return Buffer.from(clean, "hex").reverse().toString("hex");
}

function parseMtl(file) {
    if (!file || !fs.existsSync(file)) return new Map();
    const materials = new Map();
    let current = null;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [keyword, ...rest] = trimmed.split(/\s+/);
        if (keyword === "newmtl") {
            current = { name: rest.join(" "), texture: "" };
            materials.set(current.name, current);
        } else if (keyword === "map_Kd" && current) {
            current.texture = rest.join(" ");
        }
    }
    return materials;
}

function readPngSize(file) {
    if (!file || !fs.existsSync(file)) return null;
    const header = fs.readFileSync(file).subarray(0, 24);
    if (header.length < 24 || header.toString("ascii", 1, 4) !== "PNG") return null;
    return {
        width: header.readUInt32BE(16),
        height: header.readUInt32BE(20),
    };
}

function createStats(dimensions) {
    return {
        min: new Array(dimensions).fill(Infinity),
        max: new Array(dimensions).fill(-Infinity),
        sum: new Array(dimensions).fill(0),
        count: 0,
    };
}

function addStats(stats, values) {
    if (!values || values.length < stats.min.length) return;
    for (let i = 0; i < stats.min.length; i++) {
        const value = values[i];
        if (!Number.isFinite(value)) return;
        stats.min[i] = Math.min(stats.min[i], value);
        stats.max[i] = Math.max(stats.max[i], value);
        stats.sum[i] += value;
    }
    stats.count++;
}

function finishStats(stats) {
    if (stats.count === 0) return null;
    return {
        min: stats.min.map(round6),
        max: stats.max.map(round6),
        avg: stats.sum.map((value) => round6(value / stats.count)),
        count: stats.count,
    };
}

function createRegionStats() {
    return {
        faces: 0,
        corners: 0,
        uv: createStats(2),
        position: createStats(3),
        normal: createStats(3),
        faceCenter: createStats(3),
        faceUvCenter: createStats(2),
        samples: [],
    };
}

function addCorner(region, vertex) {
    region.corners++;
    addStats(region.uv, vertex.uv);
    addStats(region.position, vertex.position);
    addStats(region.normal, vertex.normal);
}

function addFaceCenter(region, vertices) {
    const position = [0, 0, 0];
    const uv = [0, 0];
    for (const vertex of vertices) {
        for (let i = 0; i < 3; i++) position[i] += vertex.position[i] / vertices.length;
        for (let i = 0; i < 2; i++) uv[i] += vertex.uv[i] / vertices.length;
    }
    addStats(region.faceCenter, position);
    addStats(region.faceUvCenter, uv);
    return { position, uv };
}

function finishRegion(region) {
    return {
        faces: region.faces,
        corners: region.corners,
        uv: finishStats(region.uv),
        position: finishStats(region.position),
        normal: normalizedNormalStats(region.normal),
        faceCenter: finishStats(region.faceCenter),
        faceUvCenter: finishStats(region.faceUvCenter),
        samples: region.samples,
    };
}

function normalizedNormalStats(stats) {
    const finished = finishStats(stats);
    if (!finished) return null;
    const avg = finished.avg;
    const length = Math.hypot(...avg) || 1;
    return {
        ...finished,
        avgNormalized: avg.map((value) => round6(value / length)),
    };
}

function round6(value) {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : value;
}

function resolveObjIndex(index, values) {
    if (!index) return null;
    return index < 0 ? values.length + index : index;
}

function parseFaceToken(token, vertices, uvs, normals) {
    const [vertexRaw, uvRaw, normalRaw] = token.split("/");
    const vertexIndex = resolveObjIndex(Number.parseInt(vertexRaw, 10), vertices);
    const uvIndex = resolveObjIndex(Number.parseInt(uvRaw, 10), uvs);
    const normalIndex = resolveObjIndex(Number.parseInt(normalRaw, 10), normals);
    return {
        vertexIndex,
        uvIndex,
        normalIndex,
        position: vertices[vertexIndex],
        uv: uvs[uvIndex],
        normal: normals[normalIndex],
    };
}

function regionForFace(vertices) {
    const uValues = vertices.map((vertex) => vertex.uv?.[0]).filter(Number.isFinite);
    if (uValues.length === 0) return "missingUv";
    if (uValues.every((u) => u < 0.5)) return "sideBackHalf";
    if (uValues.every((u) => u >= 0.5)) return "faceHalf";
    return "seamCrossing";
}

function parseObj(file, materialName, materialInfo, options = {}) {
    const vertices = [null];
    const uvs = [null];
    const normals = [null];
    const materialSummary = new Map();
    const atlasRegions = {
        sideBackHalf: createRegionStats(),
        faceHalf: createRegionStats(),
        seamCrossing: createRegionStats(),
        missingUv: createRegionStats(),
    };
    const atlasFaces = [];
    let mtlFile = "";
    let currentMaterial = "";

    function summaryForMaterial(name) {
        if (!materialSummary.has(name)) {
            materialSummary.set(name, {
                name,
                texture: materialInfo.get(name)?.texture || "",
                faces: 0,
                corners: 0,
                uv: createStats(2),
                position: createStats(3),
            });
        }
        return materialSummary.get(name);
    }

    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [keyword, ...rest] = trimmed.split(/\s+/);
        if (keyword === "mtllib") {
            mtlFile = rest.join(" ");
        } else if (keyword === "v") {
            vertices.push(rest.slice(0, 3).map(Number));
        } else if (keyword === "vt") {
            uvs.push(rest.slice(0, 2).map(Number));
        } else if (keyword === "vn") {
            normals.push(rest.slice(0, 3).map(Number));
        } else if (keyword === "usemtl") {
            currentMaterial = rest.join(" ");
        } else if (keyword === "f") {
            const faceVertices = rest.map((token) => parseFaceToken(token, vertices, uvs, normals));
            const material = summaryForMaterial(currentMaterial);
            material.faces++;
            for (const vertex of faceVertices) {
                material.corners++;
                addStats(material.uv, vertex.uv);
                addStats(material.position, vertex.position);
            }

            if (currentMaterial !== materialName) continue;
            const regionName = regionForFace(faceVertices);
            const region = atlasRegions[regionName];
            region.faces++;
            for (const vertex of faceVertices) addCorner(region, vertex);
            const center = addFaceCenter(region, faceVertices);
            if (region.samples.length < options.limit) {
                region.samples.push({
                    center: {
                        position: center.position.map(round6),
                        uv: center.uv.map(round6),
                    },
                    vertices: options.vertices
                        ? faceVertices.map((vertex) => ({
                            vertexIndex: vertex.vertexIndex,
                            uvIndex: vertex.uvIndex,
                            normalIndex: vertex.normalIndex,
                            position: vertex.position?.map(round6),
                            uv: vertex.uv?.map(round6),
                            normal: vertex.normal?.map(round6),
                        }))
                        : undefined,
                });
            }
            if (options.vertices) {
                atlasFaces.push({
                    region: regionName,
                    vertices: faceVertices.map((vertex) => ({
                        vertexIndex: vertex.vertexIndex,
                        uvIndex: vertex.uvIndex,
                        normalIndex: vertex.normalIndex,
                        position: vertex.position?.map(round6),
                        uv: vertex.uv?.map(round6),
                        normal: vertex.normal?.map(round6),
                    })),
                });
            }
        }
    }

    return {
        mtlFile,
        vertexCount: vertices.length - 1,
        uvCount: uvs.length - 1,
        normalCount: normals.length - 1,
        materialSummary: [...materialSummary.values()].map((material) => ({
            name: material.name,
            texture: material.texture,
            faces: material.faces,
            corners: material.corners,
            uv: finishStats(material.uv),
            position: finishStats(material.position),
        })).sort((a, b) => b.faces - a.faces),
        atlasRegions: Object.fromEntries(
            Object.entries(atlasRegions).map(([name, region]) => [name, finishRegion(region)]),
        ),
        atlasFaces: options.vertices ? atlasFaces : undefined,
    };
}

function printText(output) {
    console.log(`OBJ: ${output.obj}`);
    console.log(`MTL: ${output.mtl || "(none)"}`);
    console.log(`MT5 texture ID: ${output.textureHex}`);
    console.log(`wudecon texture ID: ${output.wudeconTextureHex}`);
    console.log(`atlas material: ${output.material.name}`);
    console.log(`atlas texture: ${output.material.texture || "(none)"}`);
    if (output.material.textureSize) {
        console.log(`atlas texture size: ${output.material.textureSize.width}x${output.material.textureSize.height}`);
    }
    console.log("");
    console.log("Atlas UV regions:");
    for (const [name, region] of Object.entries(output.atlasRegions)) {
        console.log([
            `  ${name}`,
            `faces=${region.faces}`,
            `uv=${JSON.stringify(region.uv?.min)}..${JSON.stringify(region.uv?.max)}`,
            `pos=${JSON.stringify(region.position?.min)}..${JSON.stringify(region.position?.max)}`,
            `avgNormal=${JSON.stringify(region.normal?.avgNormalized)}`,
        ].join(" "));
    }
    console.log("");
    console.log("Materials:");
    for (const material of output.materialSummary.slice(0, output.limit)) {
        console.log([
            `  ${material.name}`,
            `faces=${material.faces}`,
            `texture=${material.texture || "(none)"}`,
            `uv=${JSON.stringify(material.uv?.min)}..${JSON.stringify(material.uv?.max)}`,
            `pos=${JSON.stringify(material.position?.min)}..${JSON.stringify(material.position?.max)}`,
        ].join(" "));
    }
}

const args = parseArgs(process.argv.slice(2));
const objFile = path.resolve(args.file);
const objDir = path.dirname(objFile);
const provisionalMtl = fs.readFileSync(objFile, "utf8")
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("mtllib "))
    ?.trim()
    .replace(/^mtllib\s+/, "");
const mtlFile = provisionalMtl ? path.resolve(objDir, provisionalMtl) : "";
const materials = parseMtl(mtlFile);
const wudeconTextureHex = reverseHexBytes(args.texture);
const materialName = args.material || `mat_${wudeconTextureHex}`;
const material = materials.get(materialName) || { name: materialName, texture: "" };
const parsed = parseObj(objFile, materialName, materials, args);
const texturePath = material.texture ? path.resolve(objDir, material.texture) : "";
const output = {
    obj: objFile,
    mtl: mtlFile,
    textureHex: args.texture,
    wudeconTextureHex,
    material: {
        name: materialName,
        texture: material.texture || "",
        texturePath: texturePath || "",
        textureSize: readPngSize(texturePath),
    },
    limit: args.limit,
    vertexCount: parsed.vertexCount,
    uvCount: parsed.uvCount,
    normalCount: parsed.normalCount,
    materialSummary: parsed.materialSummary,
    atlasRegions: parsed.atlasRegions,
};
if (args.vertices) output.atlasFaces = parsed.atlasFaces;

if (args.json) {
    console.log(JSON.stringify(output, null, 2));
} else {
    printText(output);
}
