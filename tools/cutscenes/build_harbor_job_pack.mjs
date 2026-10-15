#!/usr/bin/env node
// Harbor employment films use the shared AUTH/audio pipeline. Ordinary Yarn
// owns appointments, challenges and wages; presentation cannot award them.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const source=path.join(process.env.SHENMUE_DISC3_EXTRACTED_ROOT||path.join(root,"extracted_disc3_v2"),"data/SCENE/03");
const generatedBy="tools/cutscenes/build_harbor_job_pack.mjs";
const evidence="docs/design/story-harbor-work.md";
const archives={
  GOROCOOP:"23073336078302cec958cdedb84443428f1e6f64ca2126e311fd5dd7ea9312a1",
  MGOR:"7feb53502a9325de4ffaa6539d38b9d2d7adb4d431285339035fa25057ca8ee6",
  MARU:"a49e67dfd7f7655755396f33690e0840d94177cf181c46f16052e2cd866e975b",
  ALPHA:"d05201b595601a36e2da5df6cc5e817bf1c72927e76ab82d3318ca3cd71f099a",
  MIZUMARK:"6a1cd83fe0df231e4faa6294a5436aa2175c309815fd864a0603ffc2a085c08f",
  GOROMA:"906e93a9d55a9d60a5f1fd91ef8ded61ada192462e8e7fe3262753cf0bb77c1c",
  ALP_PAY:"e5a5096542be5c9cd50e4a0d1ab3042efcaee09667b5b68f558702a48ff6f709",
};
const profiles=[
  {id:"after-work-goro",archive:"GOROMA",auth:"SEQDATA2.AUTH",motion:"M_01GOJ.MOTN",frames:2410,actors:["DOOR","AKIR","GORO"],
    stream:"01GOJ",streamHash:"06c5dd27705cf46350c3b59ebdefc89c14174499959526d9f253358b68f90bb8",sound:"A1_GOJ.SND",soundHash:"210668743582286b7b4bfa406ee36f766233f06fcb88b67021b522a5afe4adf3"},
  {id:"payday",archive:"ALP_PAY",motion:"M_MO01.MOTN",assetOnly:true},
  {id:"goro-job-lead",archive:"GOROCOOP",auth:"SEQDATA1.AUTH",motion:"M_01GOH.MOTN",frames:2330,actors:["AKIR","GORO"],
    stream:"01GOHA",streamHash:"018d20a6b303b790e3dff9f1b872c776b974d3857e75f8b438e5742870e5721a",sound:"A1_GOH.SND",soundHash:"5537070981a30cb231cf7fd646735bda7cb8b201ef09ab023f9a4bd8b68a6908"},
  {id:"goro-job-appointment",archive:"MGOR",auth:"SEQDATA0.AUTH",motion:"M_01GOR.MOTN",frames:1960,actors:["AKIR","HINA","GORO","DOOR","HAKO"],
    stream:"01GORA",streamHash:"5ab0691cb71108cf8630d7395d67448989a5e40edbd250852d957eb7a855074a",sound:"A1_GOROU.SND",soundHash:"25a7de8fc75c0b9ea03d0015aef36fa8253230d6d965fad226af5ce3311f543e"},
  {id:"yada-job-interview",archive:"MARU",auth:"SEQDATA0.AUTH",motion:"M_01MAK.MOTN",frames:830,actors:["AKIR","TMRA","DOOR"]},
  {id:"mark-job-introduction",archive:"MARU",auth:"SEQDATA1.AUTH",motion:"M_01MAK.MOTN",frames:1934,actors:["FORK","AKIR","TMRA","ETC2","ETC1","MARK"],
    props:{FORK:"FOKS502G"},propTextureHash:"faadd8aecb7e224885eb12d3cbc731215eb64ffb4648649c61c7a9a9272bd280"},
  {id:"mark-lunch-intro",archive:"MIZUMARK",auth:"SEQDATA1.AUTH",motion:"M_01MAD.MOTN",frames:1120,actors:["BENB","AKIR","MRSK","MARK","OKYS"],
    props:{BENB:"BNMS301G"},propTextureHash:"92687965dcded1c555ecaf72a29f00086781de3dbfc1da3be0be148d5b9f5fda",
    // The original bank ends at a9041400. Do not alias this missing effect to
    // another sample or silently strip the AUTH command from its provenance.
    unavailableSounds:{"a9041500:/p16/prj16m5/AUTH01/01MAD/SE/body/ikepocha.aiff":{
      reason:"Original AUTH requests a9041500, absent from the pinned A1_MAD.SND bank (a9040000 through a9041400); incidental effect omitted.",
      evidence:"docs/design/story-harbor-work.md#mark-at-lunch-presentation-assets",
    }}},
  {id:"mark-lunch-aftermath",archive:"MIZUMARK",auth:"SEQDATA2.AUTH",motion:"M_01MAD.MOTN",frames:1050,actors:["AKIR","OKYS","MRSK","MARK"]},
].map(p=>p.archive==="MARU"?{...p,stream:"01MAK",streamHash:"991e51fcbe77d0e590fd5db522b6fee46fe11cf7b02fc9bcaa6b81917cfc075d",sound:"A1_MARK.SND",soundHash:"ef5b84e9994323af1b7dc315612030cd1b923e79aa8770dd0e8afc6cad394ba8"}
  :p.archive==="MIZUMARK"?{...p,stream:"01MAD",streamHash:"3295b7ef69bde0372cb212cc500adcababc86421d712ae860ecaead614a7714a",sound:"A1_MAD.SND",soundHash:"b76ce9d7ad7f386a45001adcbf12a855718b0254ca72475dfdec78c4bfb38890"}:p);
const characters={GORO:["Goro Mihashi","KMB_L"],HINA:["Mai Sawano","MIB_L"],TMRA:["Ryozo Yada","KWD_L"],MARK:["Mark Kimberly","GIC_L"],
  MRSK:["Shingo Murasaki","PPL_L"],OKYS:["Minoru Okayasu","OKA_L"]};
const runtimePaths=[];
const profileArg=process.argv.indexOf("--profile");
const selected=profileArg<0?profiles:profiles.filter(p=>p.id===process.argv[profileArg+1]);
if(!selected.length)throw Error("Unknown harbor job profile");
for(const p of selected){
  const prefix=`play/assets/harbor/${p.id}`,audioPrefix=`public/audio/world/${p.id}`;
  const members=[],outputMembers=[],generatedAssets=[],sceneObjects={},packageActors={};
  const member=(archive,name)=>{
    const sourcePath=path.join(source,`MFSY/${archive}.PKS`),bytes=fs.readFileSync(sourcePath);
    if(sha256(bytes)!==archives[archive])throw Error(`Changed original ${archive}.PKS`);
    const found=parseIpacActivityArchive(bytes).members.find(m=>m.name===name);
    if(!found)throw Error(`Missing ${archive}/${name}`);
    members.push({name,sourcePath,sourceManifestPath:`disc3/SCENE/03/MFSY/${archive}.PKS`,archiveMember:name,sourceSha256:archives[archive],byteLength:found.bytes.length,sha256:sha256(found.bytes)});
    return name;
  };
  if(p.auth)member(p.archive,p.auth);
  member(p.archive,p.motion);
  if(p.assetOnly){
    // ALP_PAY has salary motions, but no AUTH film. Preserve those originals
    // without fabricating a native activity; Yarn owns the authored handover.
    const bytes=fs.readFileSync(path.join(source,`MFSY/${p.archive}.PKS`));
    const payload=parseIpacActivityArchive(bytes).members.find(m=>m.name===p.motion).bytes;
    fs.mkdirSync(path.join(root,prefix),{recursive:true});
    fs.writeFileSync(path.join(root,prefix,p.motion),payload);
    const assetPath=`${prefix}/${p.motion}`;
    fs.writeFileSync(path.join(root,prefix,"manifest.json"),JSON.stringify({generatedBy,resourceName:p.archive,sourceMembers:members.map(({sourcePath,...record})=>record),
      outputs:[{path:assetPath,byteLength:payload.length,sha256:sha256(payload)}],evidence},null,2)+"\n");
    runtimePaths.push(`${prefix}/manifest.json`,assetPath);
    console.log(`Built ${p.id}: original salary motion bank, no native AUTH`);
    continue;
  }
  const texture=(archive,hash,filename)=>{
    const bytes=fs.readFileSync(path.join(source,`MFSY/${archive}.PKF`));
    if(sha256(bytes)!==hash)throw Error(`Changed original ${archive}.PKF`);
    const assetPath=`${prefix}/${filename}`;
    generatedAssets.push({assetPath,bytes:extractNativeTexnPack(bytes,`${archive}.PKF`).bytes});return assetPath;
  };
  for(const tag of p.actors){
    if(!characters[tag])continue;
    const [label,code]=characters[tag];
    packageActors[tag]={label,modelCode:code,browserFilename:`${code}.CHRM`,assetFormat:"MT5",characterScale:1,assetPath:`play/assets/characters/${code}.CHRM`,textureAssetPath:`play/assets/characters/${code.slice(0,3)}_textures.bin`};
  }
  for(const tag of p.actors.filter(t=>["DOOR","HAKO"].includes(t)))sceneObjects[tag]={model:"unmapped-original-reference",browserFilename:`${p.archive}-${tag}-reference`,referenceOnly:true};
  if(p.id==="yada-job-interview"){
    // ALPHA is absent from the resident harbor map. Load its original HRCM
    // map only for the interview and release it with the scene's object lease.
    outputMembers.push(member("ALPHA","MAPALP.MAPD"));
    const textureAssetPath=texture("ALPHA","8c8f0a6b1ba88e96ebc453d12826aaea74a85dad57ade4893df7c3daaf530612","alpha-textures.bin");
    sceneObjects.ROOM={model:"MAPALP",browserFilename:"MAPALP.MAPD",assetPath:`${prefix}/MAPALP.MAPD`,textureAssetPath,
      lifecycle:{kind:"room-script-persistent"},initialPresentation:{position:[0,0,0],rotationDegrees:[0,0,0],scale:[1,1,1]}};
  }
  const propTextureAssetPath=p.props?texture(p.archive,p.propTextureHash,"textures.bin"):null;
  if(p.id==="mark-job-introduction"){
    const textureAssetPath=propTextureAssetPath;
    // Original MARU props/cast; the ETC1/ETC2 model association is authored.
    for(const [tag,model] of [["ETC1","SGG_L"],["ETC2","SGJ_L"]]){
      outputMembers.push(member("MARU",`${model}.CHRM`));
      packageActors[tag]={label:"Harbor worker",modelCode:model,browserFilename:`${model}.CHRM`,assetFormat:"MT5",characterScale:1,assetPath:`${prefix}/${model}.CHRM`,textureAssetPath};
    }
  }
  for(const [tag,model]of Object.entries(p.props||{})){
    outputMembers.push(member(p.archive,`${model}.CHRM`));
    sceneObjects[tag]={model,browserFilename:`${model}.CHRM`,assetPath:`${prefix}/${model}.CHRM`,textureAssetPath:propTextureAssetPath};
  }
  const manifest=buildNativeAseqActivityPack({generatedBy,resourceName:p.archive,disc:3,sourceMembers:members,expectedMembers:members,
    bindingEvidence:evidence,selectionRule:"Walkthrough-guided authored harbor employment order; normalized local slot, not native owner selection.",
    outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
    motionBanks:[{bank:16,member:p.motion}],activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:p.auth,actors:p.actors,durationFrames:p.frames,
      ...(sceneObjects.ROOM?{nativeSceneObjectStates:[{actorTag:"ROOM",presented:true}]}:{})}],
    packageActors,sceneObjects,outputMembers,generatedAssets,
  });
  runtimePaths.push(`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path));
  console.log(`Built ${p.id}: ${manifest.activities[0].durationSeconds.toFixed(2)} seconds`);
  if(!process.argv.includes("--audio"))continue;
  const audio=buildNativeAseqAudioPack({generatedBy,disc:3,authDirectory:path.join(root,prefix),authFiles:[p.auth],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:evidence,
    stream:{label:`${p.stream}.AFS`,path:path.join(source,`STREAM/${p.stream}.AFS`),manifestPath:`disc3/SCENE/03/STREAM/${p.stream}.AFS`,sha256:p.streamHash},
    soundBank:{label:p.sound,path:path.join(source,`SOUND/${p.sound}`),manifestPath:`disc3/SCENE/03/SOUND/${p.sound}`,sha256:p.soundHash},
    unavailableSounds:p.unavailableSounds,
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
    vgmstream:process.env.VGMSTREAM_CLI||path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli"),python:process.env.DTPK_PYTHON||"python3",
  });
  runtimePaths.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset));
  console.log(`Built ${p.id} audio: ${audio.voices.length} voices; ${audio.sounds.length} effects`);
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(runtimePaths)],{cwd:root,stdio:"inherit"});
