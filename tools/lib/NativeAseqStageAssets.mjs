import fs from "node:fs";
import path from "node:path";
import {parseIpacActivityArchive,sha256} from "./NativeAseqActivityPack.mjs";
import {extractNativeTexnPack} from "./NativeTexnPack.mjs";

// Package-owned scenery shares the existing runtime fixture/isolated-stage
// lease. Generation records the original resources; it is not a world loader.
export function addNativeAseqStageAssets({stage,sourceDirectory,sourceManifestPrefix,assetPrefix,members,outputMembers,sceneObjects,generatedAssets}) {
  const archivePath=path.join(sourceDirectory,stage.archive);
  const archive=fs.readFileSync(archivePath),textures=fs.readFileSync(path.join(sourceDirectory,stage.textures));
  if(sha256(archive)!==stage.sha256||sha256(textures)!==stage.textureHash)throw Error(`Changed original stage ${sourceManifestPrefix}/${stage.archive}`);
  const maps=parseIpacActivityArchive(archive).members.filter(m=>/^MAP\d*\.MAPM$/.test(m.name));
  if(JSON.stringify(maps.map(m=>m.name))!==JSON.stringify(stage.maps.map(m=>`${m}.MAPM`)))throw Error(`Changed original stage maps ${stage.archive}`);
  if(stage.hiddenMaps?.some(name=>!stage.maps.includes(name)))throw Error(`Unknown hidden stage map ${stage.archive}`);
  const states=[];
  for(const [i,m]of maps.entries()){
    members.push({name:m.name,sourcePath:archivePath,sourceManifestPath:`${sourceManifestPrefix}/${stage.archive}`,sourceSha256:stage.sha256,archiveMember:m.name,byteLength:m.bytes.length,sha256:sha256(m.bytes)});
    if(stage.nonVisualMaps?.[m.name]){
      if(sha256(m.bytes)!==stage.nonVisualMaps[m.name])throw Error(`Changed non-visual stage resource ${stage.archive}/${m.name}`);
      continue;
    }
    outputMembers.push(m.name);
    sceneObjects[`RM${String(i).padStart(2,"0")}`]={model:stage.maps[i],browserFilename:m.name,assetPath:`${assetPrefix}/${m.name}`,textureAssetPath:`${assetPrefix}/stage-textures.bin`,lifecycle:{kind:"room-script-persistent"},
      initialPresentation:{position:[0,0,0],rotationDegrees:[0,0,0],scale:[1,1,1]}};
    // Alternate day/night surfaces are real geometry, not non-visual data.
    // Keep their provenance but explicitly select the authored stage layer.
    states.push({actorTag:`RM${String(i).padStart(2,"0")}`,presented:!stage.hiddenMaps?.includes(stage.maps[i])});
  }
  generatedAssets.push({assetPath:`${assetPrefix}/stage-textures.bin`,bytes:extractNativeTexnPack(textures,stage.textures).bytes,source:{path:`${sourceManifestPrefix}/${stage.textures}`,sha256:stage.textureHash}});
  return states;
}
