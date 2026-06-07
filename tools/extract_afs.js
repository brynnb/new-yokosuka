#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function usage() {
    console.error([
        "Usage: node tools/extract_afs.js <file.afs> [options]",
        "",
        "Options:",
        "  --entry <n>          Limit to AFS entry index",
        "  --child-filter <re>  Limit extracted IPAC children by name/ext",
        "  --extract            Extract matching AFS entries and IPAC children",
        "  --out <dir>          Output directory for extraction",
        "  --json               Emit JSON",
        "  --limit <n>          Limit text child rows per entry",
    ].join("\n"));
}

function parseArgs(argv) {
    const args = {
        file: "",
        entries: new Set(),
        childFilter: "",
        extract: false,
        out: "",
        json: false,
        limit: 40,
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

        if (!args.file && !arg.startsWith("-")) args.file = arg;
        else if (arg === "--entry") args.entries.add(Number(next()));
        else if (arg === "--child-filter") args.childFilter = next();
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

    if (!args.file || !fs.existsSync(args.file)) {
        usage();
        process.exit(2);
    }
    if (args.extract && !args.out) {
        console.error("--extract requires --out");
        process.exit(2);
    }
    return args;
}

function ascii(bytes) {
    return bytes.toString("ascii").replace(/[^\x20-\x7e]/g, ".");
}

function cleanAscii(bytes) {
    return ascii(bytes).replace(/\.+$/g, "").trim();
}

function sha1(bytes) {
    return crypto.createHash("sha1").update(bytes).digest("hex");
}

function parseAfs(bytes) {
    const magic = ascii(bytes.subarray(0, 4));
    if (!magic.startsWith("AFS")) throw new Error(`Expected AFS, got ${magic}`);
    const count = bytes.readUInt32LE(4);
    const entries = [];
    for (let i = 0; i < count; i++) {
        const offset = bytes.readUInt32LE(8 + i * 8);
        const length = bytes.readUInt32LE(12 + i * 8);
        entries.push({ index: i, offset, length });
    }
    return entries;
}

function parseIpac(bytes, base) {
    if (ascii(bytes.subarray(base, base + 4)) !== "IPAC") return null;
    const size1 = bytes.readUInt32LE(base + 4);
    const count = bytes.readUInt32LE(base + 8);
    const size2 = bytes.readUInt32LE(base + 12);
    const table = base + size1;
    const children = [];

    for (let i = 0; i < count; i++) {
        const p = table + i * 20;
        const filename = cleanAscii(bytes.subarray(p, p + 8)) || `File${String(i).padStart(3, "0")}`;
        const ext = cleanAscii(bytes.subarray(p + 8, p + 12));
        const offset = bytes.readUInt32LE(p + 12) + base;
        const length = bytes.readUInt32LE(p + 16);
        children.push({
            index: i,
            filename,
            ext,
            offset,
            length,
            magic: ascii(bytes.subarray(offset, offset + Math.min(16, length))),
        });
    }

    return { size1, count, size2, table, children };
}

function parsePackage(bytes) {
    const magic = ascii(bytes.subarray(0, 4));
    if (magic === "PAKS") {
        return {
            magic,
            size: bytes.readUInt32LE(4),
            c1: bytes.readUInt32LE(8),
            c2: bytes.readUInt32LE(12),
            textures: [],
            ipac: parseIpac(bytes, 16),
        };
    }

    if (magic === "PAKF") {
        const size = bytes.readUInt32LE(4);
        const textures = [];
        let pos = 16;
        for (let guard = 0; guard < 512 && pos + 8 <= bytes.length; guard++) {
            const blockMagic = ascii(bytes.subarray(pos, pos + 4));
            const blockSize = bytes.readUInt32LE(pos + 4);
            const end = pos + blockSize;
            if (blockMagic === "TEXN") {
                const number = bytes.readUInt32LE(pos + 8);
                const name = `${ascii(bytes.subarray(pos + 12, pos + 16))}${number}`;
                textures.push({ name, offset: pos + 8, blockSize });
            }
            if (blockMagic === "IPAC" || blockSize <= 0 || end <= pos || end > bytes.length) break;
            pos = end;
        }
        return {
            magic,
            size,
            c1: bytes.readUInt32LE(8),
            textureCount: bytes.readUInt32LE(12),
            textures,
            ipac: parseIpac(bytes, size),
        };
    }

    return { magic, textures: [], ipac: null };
}

function childOutputName(entry, child) {
    const ext = child.ext ? `.${child.ext.replace(/^\./, "")}` : "";
    return path.join(
        `entry_${String(entry.index).padStart(3, "0")}`,
        `${String(child.index).padStart(2, "0")}_${child.filename}${ext}`,
    );
}

const args = parseArgs(process.argv.slice(2));
const afsBytes = fs.readFileSync(args.file);
const childFilter = args.childFilter ? new RegExp(args.childFilter, "i") : null;
let entries = parseAfs(afsBytes);
if (args.entries.size > 0) entries = entries.filter((entry) => args.entries.has(entry.index));

const report = [];
if (args.extract) fs.mkdirSync(args.out, { recursive: true });

for (const entry of entries) {
    const data = afsBytes.subarray(entry.offset, entry.offset + entry.length);
    const pkg = parsePackage(data);
    const children = [];
    for (const child of pkg.ipac?.children || []) {
        const haystack = `${child.filename}.${child.ext} ${child.magic}`;
        if (childFilter && !childFilter.test(haystack)) continue;
        const childBytes = data.subarray(child.offset, child.offset + child.length);
        let outPath = "";
        if (args.extract) {
            outPath = path.join(args.out, childOutputName(entry, child));
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.writeFileSync(outPath, childBytes);
        }
        children.push({ ...child, sha1: sha1(childBytes), outPath: outPath || undefined });
    }
    report.push({
        index: entry.index,
        offset: entry.offset,
        length: entry.length,
        sha1: sha1(data),
        package: {
            magic: pkg.magic,
            size: pkg.size,
            c1: pkg.c1,
            c2: pkg.c2,
            textureCount: pkg.textureCount ?? pkg.textures.length,
            textures: pkg.textures,
            ipacCount: pkg.ipac?.count || 0,
        },
        children,
    });
}

if (args.json) {
    console.log(JSON.stringify({ file: args.file, entries: report }, null, 2));
} else {
    for (const entry of report) {
        console.log(`entry=${entry.index} ${entry.package.magic} len=${entry.length} sha1=${entry.sha1} textures=${entry.package.textures.length} children=${entry.children.length}`);
        for (const texture of entry.package.textures) {
            console.log(`  tex ${texture.name} off=${texture.offset} block=${texture.blockSize}`);
        }
        for (const child of entry.children.slice(0, args.limit)) {
            const out = child.outPath ? ` -> ${child.outPath}` : "";
            console.log(`  child=${child.index} ${child.filename}.${child.ext} off=${child.offset} len=${child.length} magic=${JSON.stringify(child.magic)} sha1=${child.sha1}${out}`);
        }
        if (entry.children.length > args.limit) console.log(`  ... ${entry.children.length - args.limit} more`);
    }
}
