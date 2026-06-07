#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const DEFAULT_ROOTS = ["public/models", "extracted_files", "extracted_disc2_v2"];

function usage() {
    console.error([
        "Usage: node tools/find_mt5_texture_refs.js <texture-hex> [root ...] [--json]",
        "",
        "Scans MT5 files for an 8-byte texture ID. Defaults to public/models,",
        "extracted_files, and extracted_disc2_v2 when no roots are supplied.",
    ].join("\n"));
}

function parseArgs(argv) {
    const args = { textureHex: "", roots: [], json: false };
    for (const arg of argv) {
        if (arg === "--json") args.json = true;
        else if (!args.textureHex) args.textureHex = arg.replace(/^0x/i, "").toLowerCase();
        else args.roots.push(arg);
    }

    if (!/^[0-9a-f]{16}$/i.test(args.textureHex)) {
        usage();
        process.exit(2);
    }

    if (args.roots.length === 0) args.roots = DEFAULT_ROOTS;
    return args;
}

function listMt5Files(root) {
    if (!fs.existsSync(root)) return [];
    const result = spawnSync("find", [root, "-name", "*.MT5", "-print"], { encoding: "utf8" });
    if (result.status !== 0) {
        throw new Error(result.stderr || `find failed for ${root}`);
    }
    return result.stdout.split("\n").filter(Boolean);
}

const args = parseArgs(process.argv.slice(2));
const needle = Buffer.from(args.textureHex, "hex");
const files = args.roots.flatMap(listMt5Files);
const matches = [];

for (const file of files) {
    const bytes = fs.readFileSync(file);
    const offset = bytes.indexOf(needle);
    if (offset < 0) continue;
    matches.push({ file, size: bytes.length, offset });
}

matches.sort((a, b) => a.file.localeCompare(b.file));

if (args.json) {
    console.log(JSON.stringify({
        textureHex: args.textureHex,
        roots: args.roots,
        scanned: files.length,
        matched: matches.length,
        matches,
    }, null, 2));
} else {
    console.log(`texture=${args.textureHex} scanned=${files.length} matched=${matches.length}`);
    for (const match of matches) {
        console.log(`${match.file}\tsize=${match.size}\toffset=${match.offset}`);
    }
}
