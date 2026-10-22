import fs from "node:fs";
import path from "node:path";
import {parseNativeWorldCollisions} from "../lib/native-world-collisions.mjs";
import {nativeCollisionSegments} from "../../play/world/NativeWorldCollision.js";
const root=path.resolve(import.meta.dirname,"../.."),server=process.env.NEW_YOKOSUKA_SERVER_DIR;
if(!server)throw Error("NEW_YOKOSUKA_SERVER_DIR is required");
const spec=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,"story-navigation.json")));
if(spec.schema!=="new-yokosuka-story-navigation-source-v1")throw Error("Unsupported navigation source");
const challenges=spec.challenges.map(def=>{
  const sourceRoot=process.env[`SHENMUE_DISC${def.disc}_EXTRACTED_ROOT`]||path.join(root,`extracted_disc${def.disc}_v2`);
  const sourcePath=`data/SCENE/0${def.disc}/${def.area}/MAPINFO.BIN`;
  const parsed=parseNativeWorldCollisions(fs.readFileSync(path.join(sourceRoot,sourcePath)));
  if(parsed.sha256!==def.sourceSha256)throw Error(`Changed navigation source ${def.area}`);
  const fields=parsed.containers.flatMap(c=>c.fields).filter(f=>f.id===def.field);
  if(fields.length!==1)throw Error(`Ambiguous navigation field ${def.area}/${def.field}`);
  const records=fields[0].sections.flatMap(s=>s.records);
  const walls=records.flatMap(record=>nativeCollisionSegments(record.geometry));
  if(!walls.length||walls.some(wall=>wall.flat().some(n=>!Number.isFinite(n))))throw Error(`Invalid navigation walls ${def.area}`);
  const wallDistance=([x,z],[[ax,az],[bx,bz]])=>{
    const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
    return Math.hypot(x-ax-dx*t,z-az-dz*t);
  };
  for(const guard of def.guards)for(let i=1;i<guard.route.length;i++){
    const [a,b]=[guard.route[i-1],guard.route[i]],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*4);
    for(let step=0;step<=n;step++){
      const p=a.map((x,axis)=>x+(b[axis]-x)*step/n);
      if(walls.some(w=>wallDistance(p,w)<def.radius))throw Error(`${guard.tag} patrol intersects original wall at ${p}`);
    }
  }
  const {disc,sourceSha256,field,...content}=def;
  return {...content,walls,source:{disc,path:sourcePath,sha256:parsed.sha256,field,recordCount:records.length}};
});
fs.writeFileSync(path.join(server,"internal/scriptevent/navigation.json"),JSON.stringify({schema:"new-yokosuka-story-navigation-v1",challenges})+"\n");
const mapIndex=process.argv.indexOf("--map");
if(mapIndex>=0){
  const def=challenges[0],[minX,maxX,minZ,maxZ]=def.bounds,scale=9,p=x=>40+(x-minX)*scale,q=z=>40+(z-minZ)*scale;
  const w=(maxX-minX)*scale+80,h=(maxZ-minZ)*scale+80;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/>`;
  for(const [[x1,z1],[x2,z2]]of def.walls)svg+=`<path d="M${p(x1)},${q(z1)} L${p(x2)},${q(z2)}" stroke="#555" stroke-width="2"/>`;
  for(const [i,g]of def.guards.entries())svg+=`<path d="${g.route.map(([x,z],index)=>`${index?'L':'M'}${p(x)},${q(z)}`).join(' ')}" stroke="${['red','orange','purple'][i]}" stroke-width="3" fill="none"/>`;
  for(const [label,[x,,z],color]of [['Start',def.player,'blue'],['Warehouse 8',def.goal,'green']])svg+=`<circle cx="${p(x)}" cy="${q(z)}" r="5" fill="${color}"/><text x="${p(x)+8}" y="${q(z)}" font-size="14">${label}</text>`;
  fs.writeFileSync(process.argv[mapIndex+1],svg+"</svg>");
}
console.log(`Compiled ${challenges.length} original-geometry navigation challenges`);
