import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import catalog from '../play/data/shenmue2-exploration-worlds.json' with {type:'json'};
import { WORLDS } from '../play/config/worlds.js';
import { TRAVEL_DESTINATION_GROUPS } from '../play/ui/react/SidebarData.js';
import { floorAtEntry } from '../tools/worlds/build_shenmue2_play_worlds.mjs';
import { nativeCollisionDefinitionForWorld } from '../play/world/NativeWorldCollision.js';
import { shenmue2WorldSceneRecords } from '../play/world/Shenmue2SceneRecords.js';

test('later-disc exploration defaults have matching native terrain and travel entries', () => {
  const menuIds=new Set(TRAVEL_DESTINATION_GROUPS.flatMap(g=>g.destinations.map(d=>d[0])));
  assert.ok(catalog.worlds.some(w=>w.disc===2&&w.area==='AB00'));
  assert.ok(catalog.worlds.some(w=>w.disc===3&&w.area==='Q100'));
  assert.ok(catalog.worlds.some(w=>w.disc===4&&w.area==='KSH1'));
  for (const entry of catalog.worlds) {
    const world=WORLDS[entry.id];
    assert.ok(menuIds.has(entry.id));
    const collision=JSON.parse(fs.readFileSync(new URL(`../public/data/native-collisions/${entry.area}.json`,import.meta.url)));
    const definition=nativeCollisionDefinitionForWorld(world,collision);
    assert.equal(definition.variantId,entry.collisionIdentity,entry.id);
    assert.ok(floorAtEntry(definition.field,entry.spawn),entry.id);
    assert.equal(world.spawn.x,entry.spawn.position[0]);
    assert.equal(world.requireNativeCollision,true);
    const wrongDisc={...collision,discVariants:{1:entry.collisionIdentity}};
    assert.equal(nativeCollisionDefinitionForWorld(world,wrongDisc),null);
  }
});

test('split environment and prop archives stay together without mixing discs or event scenes', () => {
  const world=WORLDS.s2d4ksh1;
  const model=(filename,kind,sourceMember)=>({filename,kind,sourceMember});
  const models=[
    model('S2DC_D4_KSH1_MPK01_MAP.MT7','MAPM','MAP.MAPM'),
    model('S2DC_D4_KSH1_MPK00_PROP.MT7','PROP','PROP.PROP'),
    model('S2DC_D4_KSH1_MAP_KSH3_MAP.MT7','MAPM','MAP.MAPM'),
    model('S2DC_D1_KSH1_MPK01_MAP.MT7','MAPM','MAP.MAPM'),
  ];
  assert.deepEqual(shenmue2WorldSceneRecords({models},world),models.slice(0,2));
});

test('grounding rejects an authored pose outside terrain or far above it', () => {
  const field={vertices:[[0,0,0],[10,0,0],[10,0,10],[0,0,10]],faces:[[0,0,0,0,0,1,2,3]]};
  assert.deepEqual(floorAtEntry(field,{position:[-5,0,5],yaw:0}),[-5,0,5]);
  assert.equal(floorAtEntry(field,{position:[5,0,5],yaw:0}),null);
  assert.equal(floorAtEntry(field,{position:[-5,10,5],yaw:0}),null);
});
