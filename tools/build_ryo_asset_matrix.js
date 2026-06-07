#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const variants = ["YKA", "YKB", "YKC", "YKD", "YKE", "YKF", "YKG", "YKV"];
const headAtlasHex = "a64b425f4b414a5f";

const sources = [
    {
        key: "dc-scene01",
        label: "Dreamcast SCENE/01",
        charaDir: "extracted_files/data/SCENE/01/MODEL/CHARA",
        faceDir: "extracted_files/data/SCENE/01/MODEL/FACE",
    },
    {
        key: "dc-scene02",
        label: "Dreamcast SCENE/02",
        charaDir: "extracted_disc2_v2/data/SCENE/02/MODEL/CHARA",
        faceDir: "extracted_disc2_v2/data/SCENE/02/MODEL/FACE",
    },
    {
        key: "pc-scene03",
        label: "PC SCENE/03",
        charaDir: "viewer-test/output/pc-sm1-ryo/SCENE/03/MODEL/CHARA",
        faceDir: "viewer-test/output/pc-sm1-ryo/SCENE/03/MODEL/FACE",
    },
];

function exists(relPath) {
    if (!relPath) return false;
    return fs.existsSync(path.resolve(repoRoot, relPath));
}

function fileInfo(relPath) {
    if (!exists(relPath)) return null;
    const full = path.resolve(repoRoot, relPath);
    const bytes = fs.readFileSync(full);
    return {
        path: relPath,
        size: bytes.length,
        sha1: crypto.createHash("sha1").update(bytes).digest("hex"),
    };
}

function runJson(args) {
    try {
        return JSON.parse(execFileSync("node", args, {
            cwd: repoRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer: 64 * 1024 * 1024,
        }));
    } catch (error) {
        return {
            error: error.stderr?.toString()?.trim() || error.message,
        };
    }
}

function auditMt5(relPath) {
    if (!exists(relPath)) return null;
    const audit = runJson(["tools/audit_mt5_model_state.js", relPath, "--json"]);
    if (audit.error) return audit;
    return {
        nodeCount: audit.nodeCount,
        meshNodeCount: audit.meshNodeCount,
        textureCount: audit.textureCount,
        textures: audit.textures.map((texture) => ({
            index: texture.textureIndex,
            hex: texture.textureHex,
            strips: texture.strips,
            vertices: texture.stripVertices,
            mirrorStates: Object.keys(texture.mirrorStates || {}),
            uvSizes: Object.keys(texture.uvSizes || {}),
            mirrorResizeNeeded: Boolean(texture.mirrorResizeNeeded),
        })),
        faceMarkers: audit.faceMarkers,
    };
}

function atlasUse(relPath) {
    if (!exists(relPath)) return null;
    const atlas = runJson([
        "tools/dump_mt5_atlas.js",
        relPath,
        "--texture",
        headAtlasHex,
        "--json",
    ]);
    if (atlas.error) {
        return {
            present: false,
            error: atlas.error.split("\n")[0],
        };
    }

    const byNode = new Map();
    const byRegion = new Map();
    for (const row of atlas.rows || []) {
        const node = `0x${Number(row.nodeOffset).toString(16)}`;
        const existing = byNode.get(node) || { strips: 0, vertices: 0, regions: {} };
        existing.strips += 1;
        existing.vertices += row.stripLength || 0;
        existing.regions[row.atlasRegion] = (existing.regions[row.atlasRegion] || 0) + 1;
        byNode.set(node, existing);
        byRegion.set(row.atlasRegion, (byRegion.get(row.atlasRegion) || 0) + 1);
    }

    return {
        present: true,
        textureIndex: atlas.textureIndex,
        textureHex: atlas.textureHex,
        stripCount: atlas.stripCount,
        vertexCount: atlas.vertexCount,
        pcLengthMismatchCount: atlas.pcLengthMismatchCount,
        pcPaddingRowCount: atlas.pcPaddingRowCount,
        regions: Object.fromEntries([...byRegion.entries()].sort()),
        nodes: Object.fromEntries([...byNode.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    };
}

function ftblReport(ftblRelPath, faceRelPath) {
    if (!exists(ftblRelPath)) return null;
    const args = ["tools/dump_face_ftbl.js", ftblRelPath, "--json", "--limit", "4"];
    if (exists(faceRelPath)) args.splice(2, 0, "--model", faceRelPath);
    const report = runJson(args);
    if (report.error) return report;
    return {
        size: report.size,
        sha1: report.sha1,
        header: report.header,
        layout: report.layout,
        countComparison: report.countComparison || null,
        model: report.model ? {
            nodeCount: report.model.nodeCount,
            meshNodeCount: report.model.meshNodeCount,
            totalVertices: report.model.totalVertices,
            textureCount: report.model.textureCount,
        } : null,
        pcStaticInterpretation: report.pcStaticInterpretation,
    };
}

function compactMarker(audit) {
    const markers = audit?.faceMarkers;
    if (!markers) return null;
    return {
        headHooks: markers.headHookCount,
        patchDestinations: markers.patchDestinationCount,
        markerNodes: markers.markerNodes.map((node) => ({
            offset: node.offsetHex,
            role: node.markerRole,
            parent: node.parentOffsetHex,
            child: node.childOffsetHex,
            sibling: node.siblingOffsetHex,
            vertices: node.vertexCount,
        })),
        headSelections: markers.headSelections,
        implication: markers.pcFacePatchImplication,
    };
}

function buildMatrix() {
    const rows = [];
    for (const source of sources) {
        for (const variant of variants) {
            const bodyPath = `${source.charaDir}/${variant}_M.MT5`;
            const facePath = `${source.faceDir}/${variant}_F.MT5`;
            const ftblPath = `${source.faceDir}/${variant}_FTBL.BIN`;
            if (!exists(bodyPath) && !exists(facePath) && !exists(ftblPath)) continue;

            const bodyAudit = auditMt5(bodyPath);
            const faceAudit = auditMt5(facePath);
            rows.push({
                source: source.key,
                sourceLabel: source.label,
                variant,
                body: {
                    file: fileInfo(bodyPath),
                    audit: bodyAudit,
                    markers: compactMarker(bodyAudit),
                    headAtlas: atlasUse(bodyPath),
                },
                face: {
                    file: fileInfo(facePath),
                    audit: faceAudit,
                    markers: compactMarker(faceAudit),
                    headAtlas: atlasUse(facePath),
                },
                ftbl: {
                    file: fileInfo(ftblPath),
                    report: ftblReport(ftblPath, facePath),
                },
            });
        }
    }
    return rows;
}

function tableCell(value) {
    if (value === null || value === undefined || value === "") return "-";
    return String(value).replace(/\|/g, "\\|");
}

function summarizeAtlas(atlas) {
    if (!atlas) return "-";
    if (!atlas.present) return "no";
    const regions = Object.entries(atlas.regions || {})
        .map(([region, count]) => `${region}:${count}`)
        .join(",");
    return `tex${atlas.textureIndex} strips=${atlas.stripCount} verts=${atlas.vertexCount} ${regions}`;
}

function markdown(rows) {
    const lines = [];
    lines.push("# Ryo Asset Pairing Matrix");
    lines.push("");
    lines.push("Generated by `node tools/build_ryo_asset_matrix.js`. Static file inspection only; no Windows executable is run.");
    lines.push("");
    lines.push("| Source | Variant | Body nodes/meshes | Body FACE markers | Body texture-6 atlas | FACE nodes/meshes | FACE markers | FACE texture-6 atlas | FTBL records vs FACE verts |");
    lines.push("|---|---:|---:|---:|---|---:|---:|---|---:|");
    for (const row of rows) {
        const bodyAudit = row.body.audit;
        const faceAudit = row.face.audit;
        const bodyMarkers = row.body.markers;
        const faceMarkers = row.face.markers;
        const cmp = row.ftbl.report?.countComparison;
        lines.push([
            tableCell(row.source),
            tableCell(row.variant),
            tableCell(bodyAudit ? `${bodyAudit.nodeCount}/${bodyAudit.meshNodeCount}` : null),
            tableCell(bodyMarkers ? `-0x43:${bodyMarkers.headHooks} -0x44:${bodyMarkers.patchDestinations}` : null),
            tableCell(summarizeAtlas(row.body.headAtlas)),
            tableCell(faceAudit ? `${faceAudit.nodeCount}/${faceAudit.meshNodeCount}` : null),
            tableCell(faceMarkers ? `-0x43:${faceMarkers.headHooks} -0x44:${faceMarkers.patchDestinations}` : null),
            tableCell(summarizeAtlas(row.face.headAtlas)),
            tableCell(cmp ? `${cmp.ftblInferredRecordCount}/${cmp.modelTotalVertices} diff=${cmp.difference}` : null),
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
    lines.push("## Immediate Reads");
    lines.push("");
    lines.push("- Ryo-family body meshes consistently expose `-0x43` head hooks without raw `-0x44` FACE patch destinations.");
    lines.push("- The combined face/side-head atlas `a64b425f4b414a5f` appears in body and FACE resources, but FTBL record counts do not match FACE MT5 vertex counts one-to-one.");
    lines.push("- Use the JSON output for exact marker node offsets, atlas strip counts by node, hashes, and FTBL headers.");
    lines.push("");
    return lines.join("\n");
}

fs.mkdirSync(path.join(repoRoot, "viewer-test/output"), { recursive: true });
fs.mkdirSync(path.join(repoRoot, ".notes"), { recursive: true });

const rows = buildMatrix();
const output = {
    generatedAt: new Date().toISOString(),
    headAtlasHex,
    rows,
};

fs.writeFileSync(
    path.join(repoRoot, "viewer-test/output/ryo-asset-matrix.json"),
    JSON.stringify(output, null, 2),
);
fs.writeFileSync(
    path.join(repoRoot, ".notes/ryo-asset-matrix.md"),
    markdown(rows),
);

console.log(`Wrote ${rows.length} matrix rows`);
console.log("viewer-test/output/ryo-asset-matrix.json");
console.log(".notes/ryo-asset-matrix.md");
