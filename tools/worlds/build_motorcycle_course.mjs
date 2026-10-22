#!/usr/bin/env node
// Compile reviewed road surfaces, not the NBIK executable/controller. The
// extracted mesh supplies geometry; gates, balance and starting point are authored.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import * as B from "@babylonjs/core";
import {Mt5Loader} from "../../src/Mt5Loader.js";
import {resolveServerRepo} from "../../scripts/server-repo.mjs";

const root=path.resolve(import.meta.dirname,"../.."),server=resolveServerRepo();
const source="extracted_disc3_v2/data/SCENE/03/NBIK/MAP17.MT5";
const bytes=fs.readFileSync(path.join(root,source));
const engine=new B.NullEngine();engine.doNotHandleContextLost=false;
const scene=new B.Scene(engine),loader=new Mt5Loader(scene);
// Collision compilation needs positions/indices only, never GPU textures.
loader.readTextures=()=>{};
try {
  const [model]=await loader.load(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  // Adjacent transformed source tiles differ by fractions of a millimetre.
  // Weld at 1 mm so collision does not invent a crack between visible tiles.
  const triangles=[],seen=new Set(),round=n=>Math.round(n*1000)/1000;
  for(const mesh of model.getChildMeshes()){
    // Original decoded texture IDs d8a4d2926631425f / d8a4d2926531425f
    // (slots 77/86) are asphalt with lane markings. Slot 78 is pavement,
    // not road; bounds or a flat normal alone cannot identify driveable faces.
    if(!["mt5_mat_77","mt5_mat_86"].includes(mesh.material?.name))continue;
    const positions=mesh.getVerticesData("position"),indices=mesh.getIndices(),matrix=mesh.computeWorldMatrix(true);
    if(!positions||!indices)continue;
    const vertices=[];
    // Navigation/combat movement snapshots use browser-world coordinates.
    // The shared actor presenter performs the native-X conversion itself.
    for(let i=0;i<positions.length;i+=3){const v=B.Vector3.TransformCoordinates(new B.Vector3(...positions.slice(i,i+3)),matrix);vertices.push([v.x,v.y,v.z].map(round));}
    for(let i=0;i<indices.length;i+=3){
      const t=indices.slice(i,i+3).map(j=>vertices[j]);
      const [a,b,c]=t.map(p=>B.Vector3.FromArray(p)),normal=B.Vector3.Cross(b.subtract(a),c.subtract(a));
      if(normal.length()<.001||Math.abs(normal.y)/normal.length()<.9)continue;
      const key=t.map(v=>v.join(",")).sort().join(";");if(seen.has(key))continue;
      seen.add(key);triangles.push(t);
    }
  }
  if(triangles.length<100)throw Error("Original motorcycle road geometry is incomplete");
  const sections=[];let previous=18;
  for(let z=-66;z>=-846;z-=6){
    const spans=[];
    for(const t of triangles){
      const crossings=[];
      for(let i=0;i<3;i++){const a=t[i],b=t[(i+1)%3];if((a[2]<=z&&b[2]>z)||(b[2]<=z&&a[2]>z)){const u=(z-a[2])/(b[2]-a[2]);crossings.push([a[0]+u*(b[0]-a[0]),a[1]+u*(b[1]-a[1])]);}}
      if(crossings.length===2)spans.push(crossings.sort((a,b)=>a[0]-b[0]));
    }
    const merged=[];
    for(const span of spans.sort((a,b)=>a[0][0]-b[0][0])){const last=merged.at(-1);if(last&&span[0][0]<=last[1][0]+.01){if(span[1][0]>last[1][0])last[1]=span[1];}else merged.push(span.map(p=>[...p]));}
    const road=merged.sort((a,b)=>Math.abs((a[0][0]+a[1][0])/2-previous)-Math.abs((b[0][0]+b[1][0])/2-previous))[0];
    if(!road||road[1][0]-road[0][0]<2)throw Error(`No continuous road at z=${z}`);
    const width=road[1][0]-road[0][0],x=width>24?Math.max(road[0][0]+4,Math.min(road[1][0]-4,previous)):(road[0][0]+road[1][0])/2;
    const y=road[0][1]+(road[1][1]-road[0][1])*(x-road[0][0])/width;
    sections.push([round(x),round(y),z]);previous=x;
  }
  const checkpoints=sections.filter((_,i)=>i>0&&(i%10===0||i===sections.length-1)).map(p=>({position:p,radius:6}));
  const definition={id:"s1.nbik.nozomi-ride",area:"NBIK",worldId:"nbik",durationMs:120000,
    player:[...sections[0],Math.atan2(sections[1][0]-sections[0][0],sections[1][2]-sections[0][2])],
    maxSpeed:16,acceleration:5,braking:12,drag:.5,steeringRate:1.2,radius:.45,centerline:sections,checkpoints,triangles,
      evidence:{source,sha256:createHash("sha256").update(bytes).digest("hex"),materialSlots:[77,86],textureIds:["d8a4d2926631425f","d8a4d2926531425f"],
      facts:"Original transformed road/bridge triangles in browser-world coordinates, matching shared movement snapshots. No extracted Entry or default AKIR placement exists for NBIK.",
      adaptation:"Reviewed authored start/end on the original main road; deterministic ordered gates. Simplified steering, acceleration, braking, road-edge scrape and 120 real-second limit. Original traffic and native route-controller behavior are not reconstructed."}};
  const catalog={schema:"new-yokosuka-story-driving-v1",challenges:[definition]};
  // Keep generated geometry rows compact; pretty-printing every coordinate
  // would turn this small course into thousands of unhelpful source lines.
  let output=JSON.stringify({...catalog,challenges:[{...definition,centerline:[],triangles:[]}]},null,2);
  for(const [key,rows]of [["centerline",sections],["triangles",triangles]])output=output.replace(`"${key}": []`,`"${key}": [\n${rows.map(row=>`        ${JSON.stringify(row)}`).join(",\n")}\n      ]`);
  fs.writeFileSync(path.join(server,"internal/scriptevent/driving.json"),output+"\n");
  console.info(JSON.stringify({triangles:triangles.length,sections:sections.length,player:definition.player,checkpoints}));
}finally{engine.dispose();}
