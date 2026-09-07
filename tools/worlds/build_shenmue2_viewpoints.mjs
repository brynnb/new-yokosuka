#!/usr/bin/env node
// Attach original arrival poses; room suitability is checked against rendered
// geometry, not inferred from an area name or the total scene bounds.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseShenmue2AreaTable } from '../lib/shenmue2-area-table.mjs';

export function extractViewpoints(discRoot, catalog) {
  const points = {};
  const groups = new Map();
  const tables = new Map();
  for (const record of catalog.models) {
    const disc = record.disc || Number(record.filename.match(/^S2DC_D(\d)_/)?.[1]);
    const scene = record.scene || String(disc).padStart(2, '0');
    const area = record.area || record.filename.split('_')[2];
    groups.set(`${disc}/${scene}/${area}`, { disc, scene, area });
  }
  for (const [key, { scene, area }] of groups) {
    const filename = `AREATBL${Number(scene)}.BIN`;
    const source = path.join(discRoot, 'data/MISC', filename);
    if (!fs.existsSync(source)) continue;
    if (!tables.has(source)) tables.set(source, parseShenmue2AreaTable(fs.readFileSync(source)));
    const table = tables.get(source);
    const records = table.groups.flatMap(g => g.records);
    const unique = new Map();
    // A route's position belongs to its source area. Destination entry IDs
    // reference the reciprocal record, not the route naming the destination.
    // Area ownership is absent from the binary table: retain reciprocal
    // candidates and let the destination's main geometry validate ownership.
    const inbound = records.filter(r => r.destinationArea === area);
    const candidates = records.filter(r => inbound.some(route =>
      r.id === route.destinationEntry && r.destinationEntry === route.id));
    for (const r of candidates) {
      if (!r.position.every(Number.isFinite)) throw new Error(`Invalid arrival position: ${filename}/${r.fileOffset}`);
      const pose = {
        position: [-r.position[0], r.position[1], r.position[2]],
        yaw: Math.PI - r.facing * Math.PI * 2 / 65536,
        entry: r.id,
        source: `${filename}@0x${r.fileOffset.toString(16)}`,
        sourceSha256: table.sha256,
      };
      unique.set(JSON.stringify([pose.position, pose.yaw]), pose);
    }
    if (unique.size) points[key] = [...unique.values()];
  }
  return points;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [discRoot, stagedRoot] = process.argv.slice(2);
  if (!discRoot || !stagedRoot) throw new Error('Usage: node tools/worlds/build_shenmue2_viewpoints.mjs EXTRACTED_DISC STAGED_MODELS');
  for (const name of ['models.json', 'viewer-models.json']) {
    const filename = path.join(stagedRoot, name);
    const catalog = JSON.parse(fs.readFileSync(filename));
    catalog.entryPoints = extractViewpoints(discRoot, catalog);
    fs.writeFileSync(filename, JSON.stringify(catalog, null, 2) + '\n');
    console.log(`${name}: ${Object.keys(catalog.entryPoints).length} areas with authored arrival poses`);
  }
}
