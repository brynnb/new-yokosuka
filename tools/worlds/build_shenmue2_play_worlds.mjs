#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ray, Vector3 } from '@babylonjs/core';
import { groupShenmue2Catalog, shenmue2AreaPresentation } from '../../src/Shenmue2AssetOrganization.js';
import { shenmue2CollisionBehaviorForFace } from '../../play/world/NativeWorldCollision.js';

export function floorAtEntry(field, entry) {
  if (!entry.position?.every(Number.isFinite) || !Number.isFinite(entry.yaw)) return null;
  const origin = Vector3.FromArray(entry.position).add(new Vector3(0, 2, 0));
  const ray = new Ray(origin, Vector3.Down(), 4);
  let closest = Infinity;
  for (const face of field.faces) {
    if (shenmue2CollisionBehaviorForFace(field.vertices, face) !== 'terrain-surface') continue;
    const points = [...new Set(face.slice(4))].map(i => {
      const [x,y,z] = field.vertices[i]; return new Vector3(-x,y,z);
    });
    for (let i=1; i<points.length-1; i++) {
      const hit = ray.intersectsTriangle(points[0], points[i], points[i+1]);
      if (hit && hit.distance >= 0 && hit.distance <= ray.length) closest = Math.min(closest,hit.distance);
    }
  }
  return Number.isFinite(closest) ? [entry.position[0], origin.y-closest, entry.position[2]] : null;
}

export function buildPlayWorlds(catalog, collisionDirectory) {
  const worlds=[], excluded=[];
  for (const group of groupShenmue2Catalog(catalog.models).filter(g=>g.disc>1 && g.scene)) {
    const {disc,scene,area,archives}=group;
    const key=`${disc}/${scene}/${area}`;
    const exclude=reason=>excluded.push({disc,scene,area,reason});
    // MPK00 is normally the primary scene. In later discs it may contain
    // only placed objects while MPK01 holds the environment (e.g. KSH1).
    // Nested MAP_* event/flashback archives never join a default world.
    const environment = archives.get('MPK00')?.some(r=>r.kind==='MAPM') ? 'MPK00'
      : archives.get('MPK01')?.some(r=>r.kind==='MAPM') ? 'MPK01' : null;
    if (!environment) { exclude('no primary environment archive'); continue; }
    const collisionPath=path.join(collisionDirectory,`${area}.json`);
    if (!fs.existsSync(collisionPath)) { exclude('no native collision data'); continue; }
    const collision=JSON.parse(fs.readFileSync(collisionPath));
    const variant=collision.variants[collision.discVariants[disc]];
    if (!variant) { exclude('no matching disc collision variant'); continue; }
    const field=variant.fields.find(f=>f.id===collision.defaultField);
    if (!field) { exclude('no default collision field'); continue; }
    const candidates=[...(catalog.entryPoints?.[key] || [])];
    // Local FLDD map-exit controls are authored poses owned by this map,
    // unlike AREATBL reciprocal candidates whose ownership needs validation.
    for (const c of field.controls || []) {
      if (c.type!==-2 || c.value!==29 || !c.position) continue;
      candidates.unshift({position:[-c.position[0],c.position[1],c.position[2]],
        yaw:Math.PI-c.facing*Math.PI*2/65536,
        source:`MAPINFO.BIN FLDD@0x${c.fileOffset.toString(16)}`,
        sourceSha256:variant.sources.find(s=>s.disc===disc)?.mapinfoSha256});
    }
    let spawn=null;
    for (const candidate of candidates) {
      const position=floorAtEntry(field,candidate);
      if (position) {
        spawn={position,yaw:candidate.yaw,source:candidate.source,sourceSha256:candidate.sourceSha256};
        break;
      }
    }
    if (!spawn) { exclude('no authored entry grounded on the default collision field'); continue; }
    const presentation=shenmue2AreaPresentation(area);
    const prefix=`S2DC_D${disc}_${area}_${environment}`;
    worlds.push({id:`s2d${disc}${area.toLowerCase()}`,disc,scene,area,
      label:presentation.label,region:presentation.region,
      prefix,scenePrefixes: environment==='MPK00' ? [prefix]
        : [prefix,`S2DC_D${disc}_${area}_MPK00`],
      nativeCollisionField:field.id,spawn,
      collisionIdentity:collision.discVariants[disc],
      explorationOnly:true});
  }
  return {format:'new-yokosuka-shenmue2-exploration-v1',worlds,excluded};
}

if (process.argv[1]===fileURLToPath(import.meta.url)) {
  const [stagedRoot='.disc-work/shenmue2-models',collisionRoot='public/data/native-collisions',
    output='play/data/shenmue2-exploration-worlds.json']=process.argv.slice(2);
  const report=buildPlayWorlds(JSON.parse(fs.readFileSync(path.join(stagedRoot,'viewer-models.json'))),collisionRoot);
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  if (process.argv[5]) {
    fs.writeFileSync(path.join(process.argv[5], 'internal/realtime/shenmue2_exploration_worlds.json'),
      JSON.stringify(report.worlds.map(w=>w.id),null,2)+'\n');
  }
  console.log(`${report.worlds.length} grounded exploration worlds; ${report.excluded.length} excluded scenes`);
}
