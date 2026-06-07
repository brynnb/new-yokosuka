#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DEFAULT_ROOT = "/Users/brynnbateman/Downloads/shenmue-pc-sm1-extracted/archives/dx11/data";

function usage() {
    console.error([
        "Usage: node tools/extract_pc_tac.js [options]",
        "",
        "Options:",
        "  --root <dir>         Directory containing PC .tad/.tac pairs",
        "  --names <file>       Optional Shenmunity Names.txt hash map",
        "  --archive <name>     Limit to archive short name, e.g. disk or common",
        "  --filter <regex>     Filter by hash or mapped name",
        "  --hash <hex>         Extract/list a specific 8-hex hash",
        "  --extract            Write matching entries to --out",
        "  --out <dir>          Extraction output directory",
        "  --json               Emit JSON instead of text",
        "  --limit <n>          Limit text listing rows",
        "",
        "Examples:",
        "  node tools/extract_pc_tac.js --archive disk --filter 'YKB|YKC|MOTION'",
        "  node tools/extract_pc_tac.js --archive disk --filter 'YKB_M|YKC_M' --extract --out viewer-test/output/pc-sm1",
    ].join("\n"));
}

function parseArgs(argv) {
    const args = {
        root: DEFAULT_ROOT,
        names: "",
        archive: "",
        filter: "",
        hashes: new Set(),
        extract: false,
        out: "",
        json: false,
        limit: 100,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => {
            if (i + 1 >= argv.length) {
                usage();
                process.exit(2);
            }
            return argv[++i];
        };

        if (arg === "--root") args.root = next();
        else if (arg === "--names") args.names = next();
        else if (arg === "--archive") args.archive = next().toLowerCase();
        else if (arg === "--filter") args.filter = next();
        else if (arg === "--hash") args.hashes.add(next().replace(/^0x/i, "").toUpperCase());
        else if (arg === "--extract") args.extract = true;
        else if (arg === "--out") args.out = next();
        else if (arg === "--json") args.json = true;
        else if (arg === "--limit") args.limit = Number(next());
        else if (arg === "-h" || arg === "--help") {
            usage();
            process.exit(0);
        } else {
            console.error(`Unknown argument: ${arg}`);
            usage();
            process.exit(2);
        }
    }

    for (const hash of args.hashes) {
        if (!/^[0-9A-F]{8}$/.test(hash)) {
            console.error(`Invalid hash: ${hash}`);
            process.exit(2);
        }
    }
    if (args.extract && !args.out) {
        console.error("--extract requires --out");
        process.exit(2);
    }
    if (!Number.isFinite(args.limit) || args.limit < 0) args.limit = 100;
    return args;
}

function walkFiles(root) {
    const out = [];
    if (!fs.existsSync(root)) return out;
    for (const name of fs.readdirSync(root)) {
        const full = path.join(root, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) out.push(...walkFiles(full));
        else out.push(full);
    }
    return out;
}

function archiveShortName(file) {
    return path.basename(file).split("_")[0].toLowerCase();
}

function loadNames(file) {
    const names = new Map();
    if (!file || !fs.existsSync(file)) return names;

    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = line.match(/^Shenmue\/([^/]+)\/([0-9A-Fa-f]{8})(?:\s+(.+))?$/);
        if (!match) continue;
        const archive = match[1].toLowerCase();
        const hash = match[2].toUpperCase();
        names.set(`${archive}/${hash}`, match[3] || "");
    }
    return names;
}

function parseTad(tadPath, names) {
    const archive = archiveShortName(tadPath);
    const tacPath = tadPath.replace(/\.tad$/i, ".tac");
    const bytes = fs.readFileSync(tadPath);
    const entries = [];
    let pos = 72;

    while (pos + 32 <= bytes.length) {
        pos += 4;
        const offset = bytes.readUInt32LE(pos);
        pos += 4;
        pos += 4;
        const length = bytes.readUInt32LE(pos);
        pos += 4;
        pos += 4;
        const hash = Buffer.from(bytes.subarray(pos, pos + 4)).toString("hex").toUpperCase();
        pos += 4;
        pos += 8;

        entries.push({
            archive,
            hash,
            name: names.get(`${archive}/${hash}`) || "",
            offset,
            length,
            tadPath,
            tacPath,
        });
    }
    return entries;
}

function displayName(entry) {
    return entry.name || entry.hash;
}

function safeRelativePath(entry) {
    if (entry.name) {
        return entry.name.replace(/^\/+/, "").replace(/\\/g, "/");
    }
    return `${entry.archive}/${entry.hash}.bin`;
}

function sha1(bytes) {
    return crypto.createHash("sha1").update(bytes).digest("hex");
}

function readEntry(entry) {
    const fd = fs.openSync(entry.tacPath, "r");
    try {
        const compressed = Buffer.alloc(entry.length);
        fs.readSync(fd, compressed, 0, entry.length, entry.offset);
        const gzip = compressed.length >= 2 && compressed[0] === 0x1f && compressed[1] === 0x8b;
        const data = gzip ? zlib.gunzipSync(compressed) : compressed;
        return { data, compressed, gzip };
    } finally {
        fs.closeSync(fd);
    }
}

function fileMagic(bytes) {
    return bytes.subarray(0, Math.min(16, bytes.length)).toString("ascii").replace(/[^\x20-\x7e]/g, ".");
}

const args = parseArgs(process.argv.slice(2));
const names = loadNames(args.names);
const filter = args.filter ? new RegExp(args.filter, "i") : null;
const tadFiles = walkFiles(args.root).filter((file) => file.toLowerCase().endsWith(".tad"));
let entries = tadFiles.flatMap((file) => parseTad(file, names));

entries = entries.filter((entry) => {
    if (args.archive && entry.archive !== args.archive) return false;
    if (args.hashes.size > 0 && !args.hashes.has(entry.hash)) return false;
    if (filter && !filter.test(`${entry.hash} ${entry.name}`)) return false;
    return true;
});

entries.sort((a, b) => (
    a.archive.localeCompare(b.archive) ||
    a.offset - b.offset ||
    a.hash.localeCompare(b.hash)
));

const manifest = [];

if (args.extract) {
    fs.mkdirSync(args.out, { recursive: true });
    for (const entry of entries) {
        const { data, compressed, gzip } = readEntry(entry);
        const rel = safeRelativePath(entry);
        const outPath = path.join(args.out, rel);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, data);
        manifest.push({
            archive: entry.archive,
            hash: entry.hash,
            name: entry.name,
            source: entry.tacPath,
            offset: entry.offset,
            compressedLength: compressed.length,
            length: data.length,
            gzip,
            magic: fileMagic(data),
            sha1: sha1(data),
            outPath,
        });
    }
} else {
    for (const entry of entries) {
        manifest.push({
            archive: entry.archive,
            hash: entry.hash,
            name: entry.name,
            source: entry.tacPath,
            offset: entry.offset,
            compressedLength: entry.length,
        });
    }
}

if (args.json) {
    console.log(JSON.stringify({
        root: args.root,
        names: args.names || null,
        matched: manifest.length,
        extracted: args.extract,
        entries: manifest,
    }, null, 2));
} else {
    console.log(`matched=${manifest.length}${args.extract ? ` extracted_to=${args.out}` : ""}`);
    for (const entry of manifest.slice(0, args.limit)) {
        const length = entry.length ?? entry.compressedLength;
        const gzip = entry.gzip === undefined ? "" : ` gzip=${entry.gzip}`;
        const magic = entry.magic ? ` magic=${JSON.stringify(entry.magic)}` : "";
        const out = entry.outPath ? ` -> ${entry.outPath}` : "";
        console.log(`${entry.archive}/${entry.hash} off=${entry.offset} len=${length}${gzip}${magic} ${displayName(entry)}${out}`);
    }
    if (manifest.length > args.limit) {
        console.log(`... ${manifest.length - args.limit} more`);
    }
}
