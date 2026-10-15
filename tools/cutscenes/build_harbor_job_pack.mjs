#!/usr/bin/env node
// Harbor employment films use the shared AUTH/audio pipeline. Ordinary Yarn
// owns appointments, challenges and wages; presentation cannot award them.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {parseAuthSequence} from "../../src/AuthSequence.js";
import {runtimeAssetUrl} from "../../src/RuntimeAssets.js";

const root=path.resolve(import.meta.dirname,"../..");
const source=path.join(process.env.SHENMUE_DISC3_EXTRACTED_ROOT||path.join(root,"extracted_disc3_v2"),"data/SCENE/03");
const generatedBy="tools/cutscenes/build_harbor_job_pack.mjs";
const evidence="docs/design/story-harbor-work.md";
const archives={
  GOROKEKN:"b46218e928a21665463da0a39bc956eb9799d89b81554fdd39f722c84cf89c71",
  "MB9Q/MPK00":"70a419eb5544dade0c62f3b2ca0a8d747eaf79e11e9df5c467b728d753b22f7c",
  RYUSATSU:"385fd95a064964da1723afade848a3673e5632d56c1536460df9be7acd03686c",
  BAT_MBQC:"52867cbea1dd59044282ee476405026a769a909eab8bbcced955f94975d470e0",
  NZMPHOTO:"c1b2ba44ca7111fb9e85237a775b253c0bcef99e7a4bbb3ed3c64e00bc46be1e",
  BOKOMARK:"f074ed751b0000c66357087fc8ed23c0a343080723bb511567b92c2d0ed96164",
  HIRUAUTH:"e740397e02958441010345d34d1369b20bbad9bc2ebdf397b413251b20a9a97e",
  GOROCOOP:"23073336078302cec958cdedb84443428f1e6f64ca2126e311fd5dd7ea9312a1",
  MGOR:"7feb53502a9325de4ffaa6539d38b9d2d7adb4d431285339035fa25057ca8ee6",
  MARU:"a49e67dfd7f7655755396f33690e0840d94177cf181c46f16052e2cd866e975b",
  ALPHA:"d05201b595601a36e2da5df6cc5e817bf1c72927e76ab82d3318ca3cd71f099a",
  MIZUMARK:"6a1cd83fe0df231e4faa6294a5436aa2175c309815fd864a0603ffc2a085c08f",
  GOROMA:"906e93a9d55a9d60a5f1fd91ef8ded61ada192462e8e7fe3262753cf0bb77c1c",
  ALP_PAY:"e5a5096542be5c9cd50e4a0d1ab3042efcaee09667b5b68f558702a48ff6f709",
};
const profiles=[
  {id:"goro-mai-marriage",archive:"GOROKEKN",auth:"SEQDATA0.AUTH",motion:"M_01GHO.MOTN",frames:1234,actors:["HINA","AKIR","GORO"],
    stream:"01GHO",streamHash:"c262947548666f943f1e07dccbe3042d168b27d48bd9bfbea4d8e12668fa2e70",sound:"A1_GKEKN.SND",soundHash:"e64d21ff00d541ee002566225a066ca8208780cf6f96c94eabb5a657bdd7345f"},
  {id:"goro-trap-aftermath",archive:"MB9Q/MPK00",resourceName:"MB9Q",auth:"SEQDATA1.AUTH",motion:"M_019RN.MOTN",frames:880,actors:["TONY","AKIR","JONZ","SMTH","RBRT"],
    // Retain YKB's original reference body for the cloth regression fixture;
    // it is Ryo, not an eighth fighter. GH borrows Tony/Smith's real bodies.
    extraMembers:["M_MB9Q2.MOTN","YKB_M.CHRM"],stagingActors:["BKA_","BKB_","BKC_","BKD_","BKE_","BKF_","BKG_","BKH_"],
    actorModels:{TONY:["Tony Abrams","GIJ_M"],SMTH:["Smith Bradley","GIB_M"],JONZ:["Jones Henders","GIF_L"],RBRT:["Mad Angels thug","GID_L"],
      BKA_:["Mad Angels fighter","GIA_L"],BKB_:["Mad Angels fighter","GID_L"],BKC_:["Mad Angels fighter","GIE_L"],BKD_:["Mad Angels fighter","GIF_L"],BKE_:["Mad Angels fighter","GIJ_M"],BKF_:["Mad Angels fighter","GIB_M"],BKG_:["Mad Angels fighter","GIJ_M"],BKH_:["Mad Angels fighter","GIB_M"]},
    actorTextureHash:"93b83942438429938cbbde61cbd5c0404792dadf1adac834c6e432e66d2d94cd",
    stream:"019RN",streamHash:"a7b214337ce9c402f5bda977813e1cd8bd6a284a1ffbdc90c5f307cce1ea72d2",sound:"A1_QRENQ.SND",soundHash:"e45706b0f968996730938ba1d78de4ab4119655a2ca059ed93a3f4afbe62d534"},
  {id:"mark-long-zha",archive:"RYUSATSU",auth:"SEQDATA1.AUTH",motion:"M_01MKJ.MOTN",frames:1000,actors:["AKIR","MARK"],
    stream:"01MKJ",streamHash:"cb353da35315b081014c3a92fe4e0a2bb2cb0f6c2d5ae2986eefca6585d32772",sound:"A1_MKJ.SND",soundHash:"264c861f97044a430b1723fcce33393b77ffce22483534bed0fabc7bde5b0408"},
  {id:"charlie-harbor-interrogation",archive:"BAT_MBQC",auth:"SEQDATA0.AUTH",motion:"M_01CBK.MOTN",frames:1560,actors:["AKIR","BTK_","BTH_","CHRL","BTA_"],
    actorModels:{BTK_:["Mad Angels biker","BTK_S"],BTH_:["Mad Angels biker","BTH_S"],BTA_:["Mad Angels biker","BTA_S"]},
    actorTextureHash:"21659e72e8d07d6672f87185bef848ed61a61e659f63c924c51af73512f7793f",
    stream:"01CBK",streamHash:"ac592d84435e75dddc18d05e66f969bfb815ac2310f5a5396fc1cba64b3e0792",sound:"A1_CBK.SND",soundHash:"9c57255615360306201708cba0ded088d6a61c62e975a5a906a4c264e39e0758"},
  {id:"nozomi-photo-intro",archive:"NZMPHOTO",auth:"SEQDATA1.AUTH",motion:"M_01PHO.MOTN",frames:1220,actors:["PHT1","PHT2","BLC0","BLC1","AKIR","TJMA","HRSK","POLA"],
    props:{PHT1:"SHAS503G",PHT2:"SHAS506G",BLC0:"BLAS500G",BLC1:"BLAS500G",POLA:"POCS500G"},referenceActors:["BLC0","BLC1"],authoredPropBindings:true},
  {id:"nozomi-photo-ending",archive:"NZMPHOTO",auth:"SEQDATA2.AUTH",motion:"M_01PHO.MOTN",frames:1940,actors:["AKIR","TJMA","HRSK","PHT2","POLA","PHT1"],
    props:{PHT1:"SHAS503G",PHT2:"SHAS506G",POLA:"POCS500G"},authoredPropBindings:true},
  {id:"mark-after-work-intro",archive:"BOKOMARK",auth:"SEQDATA2.AUTH",motion:"M_01MKB.MOTN",frames:520,actors:["AKIR","DEB1","DEB2","MARK","MRSK","OKYS","BTC_"],
    actorModels:{DEB1:["Mad Angels thug","BTH_L"],DEB2:["Mad Angels thug","BTN_L"],BTC_:["Mad Angels thug","BTC_L"]},
    actorTextureHash:"526ca5ef63b27b189ceeac0dcadbd5950334105132b27008fd77ec95ef1965df",
    unavailableVoices:Object.fromEntries(["01MKBD003.str","01MKBD004.str"].map(id=>[id,{
      reason:`Original introduction requests ${id}, absent from the pinned English 01MKB.AFS; no substitute voice or invented subtitle.`,
      evidence:"docs/design/story-harbor-work.md#warehouse-no-17-mark-rescue",
    }])),
    unavailableSounds:{"a9041c00:/p16/prj16m5/AUTH01/01MKB/SE/footconcrete/joseiconsneaker1.aiff":{
      reason:"Original introduction requests a9041c00; the pinned A1_MKB.SND contains a9040000 through a9041b00 only. Incidental footstep omitted, no substitute.",
      evidence:"docs/design/story-harbor-work.md#warehouse-no-17-mark-rescue",
    }}},
  {id:"mark-after-work-aftermath",archive:"BOKOMARK",auth:"SEQDATA3.AUTH",motion:"M_01MKB.MOTN",frames:700,actors:["AKIR","MARK","MRSK","OKYS"]},
  {id:"mark-brother-explanation",archive:"BOKOMARK",auth:"SEQDATA4.AUTH",motion:"M_01MKB.MOTN",frames:1961,actors:["AKIR","MARK"]},
  {id:"workday-lunch",archive:"HIRUAUTH",auth:"SEQDATA1.AUTH",motion:"M_01BEN.MOTN",frames:450,silent:true,
    actors:[...Array.from({length:6},(_,i)=>[`BTF${i+1}`,`BTS${i+1}`]).flat(),"AKIR","YOHI","TYMK","TAKE","MARK","HTSI"],
    props:Object.fromEntries(Array.from({length:6},(_,i)=>[[`BTF${i+1}`,"BNMS301G"],[`BTS${i+1}`,"BNMS302G"]]).flat()),
    propTextureHash:"c6796091fbbb5a0ba8f3f50567fdf4b7419227ff984c38942d7bb0a08f635968"},
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
].map(p=>p.archive==="NZMPHOTO"?{...p,propTextureHash:"c689ecc4b3d11bcef397c5038c916e98fecf984662e60ea6be9fd994f0ff2060",stream:"01PHO",streamHash:"6c0170c065add4c5515ffec8ae68ca8ef223805f96fd654949274762dcb61edd",sound:"A1_NZPHO.SND",soundHash:"b00875e4a2dcf3db1af7eff22e55c3dc6b7ccf9a20490ecd0b374d0e06d54afc"}
  :p.archive==="BOKOMARK"?{...p,bank:21,stream:"01MKB",streamHash:"29dfd4ec9003c458ad53d6e1cabc621edd1a7fac8cff367b1e348de818e3e0fd",sound:"A1_MKB.SND",soundHash:"8286272d55f5011e16b49dc5cb7c0596a090e365ff409cbf96440a65ad02724e"}
  :p.archive==="MARU"?{...p,stream:"01MAK",streamHash:"991e51fcbe77d0e590fd5db522b6fee46fe11cf7b02fc9bcaa6b81917cfc075d",sound:"A1_MARK.SND",soundHash:"ef5b84e9994323af1b7dc315612030cd1b923e79aa8770dd0e8afc6cad394ba8"}
  :p.archive==="MIZUMARK"?{...p,stream:"01MAD",streamHash:"3295b7ef69bde0372cb212cc500adcababc86421d712ae860ecaead614a7714a",sound:"A1_MAD.SND",soundHash:"b76ce9d7ad7f386a45001adcbf12a855718b0254ca72475dfdec78c4bfb38890"}:p);
const characters={CHRL:["Charlie Grant","BIK_L"],YOHI:["Yohei Kondo","YHI_L"],TYMK:["Tsuyoshi Murakami","RFA_L"],TAKE:["Hiroaki Takeuchi","ZZC_L"],HTSI:["Hitoshi Numakubo","SGH_L"],
  GORO:["Goro Mihashi","KMB_L"],HINA:["Mai Sawano","MIB_L"],TMRA:["Ryozo Yada","KWD_L"],MARK:["Mark Kimberly","GIC_L"],
  // HRSK reuses the reviewed full body from nativeActivityActors, not the
  // character-name CSV's unshipped NZM_M reference.
  MRSK:["Shingo Murasaki","PPL_L"],OKYS:["Minoru Okayasu","OKA_L"],TJMA:["Eri Tajima","RFD_L"],HRSK:["Nozomi Harasaki","NZM_L"]};
const runtimePaths=[];
// Most employment archives are resident MFSY resources; the nine-input fight
// owns its own MB9Q package. Preserve that original path in provenance.
const archiveStem=archive=>archive.includes("/")?archive:`MFSY/${archive}`;
const profileArg=process.argv.indexOf("--profile");
const selected=profileArg<0?profiles:profiles.filter(p=>p.id===process.argv[profileArg+1]);
if(!selected.length)throw Error("Unknown harbor job profile");
for(const p of selected){
  const prefix=`play/assets/harbor/${p.id}`,audioPrefix=`public/audio/world/${p.id}`;
  const members=[],outputMembers=[],generatedAssets=[],sceneObjects={},packageActors={};
  const member=(archive,name)=>{
    // Multiple scene instances may share one archive model (six lunchboxes).
    // Provenance/output members describe unique source files, not instances.
    if(members.some(m=>m.archiveMember===name&&m.sourceManifestPath===`disc3/SCENE/03/${archiveStem(archive)}.PKS`))return name;
    const sourcePath=path.join(source,`${archiveStem(archive)}.PKS`),bytes=fs.readFileSync(sourcePath);
    if(sha256(bytes)!==archives[archive])throw Error(`Changed original ${archive}.PKS`);
    const found=parseIpacActivityArchive(bytes).members.find(m=>m.name===name);
    if(!found)throw Error(`Missing ${archive}/${name}`);
    members.push({name,sourcePath,sourceManifestPath:`disc3/SCENE/03/${archiveStem(archive)}.PKS`,archiveMember:name,sourceSha256:archives[archive],byteLength:found.bytes.length,sha256:sha256(found.bytes)});
    return name;
  };
  if(p.auth){
    member(p.archive,p.auth);
    if(p.silent){
      const bytes=parseIpacActivityArchive(fs.readFileSync(path.join(source,`MFSY/${p.archive}.PKS`))).members.find(m=>m.name===p.auth).bytes;
      // A silent profile must actually have no original audio commands; never
      // use this to conceal a missing bank or an unimplemented voice request.
      if(parseAuthSequence(bytes).sounds.length)throw Error(`Unexpected original audio in silent ${p.id}`);
    }
  }
  member(p.archive,p.motion);
  for(const name of p.extraMembers||[])outputMembers.push(member(p.archive,name));
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
    const bytes=fs.readFileSync(path.join(source,`${archiveStem(archive)}.PKF`));
    if(sha256(bytes)!==hash)throw Error(`Changed original ${archive}.PKF`);
    const assetPath=`${prefix}/${filename}`;
    generatedAssets.push({assetPath,bytes:extractNativeTexnPack(bytes,`${archive}.PKF`).bytes});return assetPath;
  };
  for(const tag of p.actors){
    if(!characters[tag])continue;
    const [label,code]=characters[tag];
    // A film is imported during application startup. Missing shared bodies
    // must fail generation, not leave the account menu waiting indefinitely.
    runtimeAssetUrl(`play/assets/characters/${code}.CHRM`);
    runtimeAssetUrl(`play/assets/characters/${code.slice(0,3)}_textures.bin`);
    packageActors[tag]={label,modelCode:code,browserFilename:`${code}.CHRM`,assetFormat:"MT5",characterScale:1,assetPath:`play/assets/characters/${code}.CHRM`,textureAssetPath:`play/assets/characters/${code.slice(0,3)}_textures.bin`};
  }
  if(p.actorModels){
    const textureAssetPath=texture(p.archive,p.actorTextureHash,"character-textures.bin");
    for(const [tag,[label,code]]of Object.entries(p.actorModels)){
      if(!p.actors.includes(tag)&&!p.stagingActors?.includes(tag))throw Error(`Unused package actor ${p.id}/${tag}`);
      outputMembers.push(member(p.archive,`${code}.CHRM`));
      packageActors[tag]={label,modelCode:code,browserFilename:`${code}.CHRM`,assetFormat:"MT5",characterScale:1,
        assetPath:`${prefix}/${code}.CHRM`,textureAssetPath,
        sourceBinding:{kind:"authored-package-model-association",archiveMember:`${code}.CHRM`,evidence}};
    }
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
    sceneObjects[tag]={model,browserFilename:`${model}.CHRM`,assetPath:`${prefix}/${model}.CHRM`,textureAssetPath:propTextureAssetPath,
      ...(p.referenceActors?.includes(tag)?{referenceOnly:true}:{}),
      ...(p.authoredPropBindings?{sourceBinding:{kind:"authored-package-prop-association",evidence}}:{})};
  }
  const manifest=buildNativeAseqActivityPack({generatedBy,resourceName:p.resourceName||p.archive,disc:3,sourceMembers:members,expectedMembers:members,
    bindingEvidence:evidence,selectionRule:"Walkthrough-guided authored harbor employment order; normalized local slot, not native owner selection.",
    outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),...(p.silent?{}:{audioManifest:`${audioPrefix}/manifest.json`}),
    motionBanks:[{bank:p.bank??16,member:p.motion}],activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:p.auth,actors:p.actors,durationFrames:p.frames,
      ...(sceneObjects.ROOM?{nativeSceneObjectStates:[{actorTag:"ROOM",presented:true}]}:{})}],
    packageActors,sceneObjects,outputMembers:[...new Set(outputMembers)],generatedAssets,
  });
  runtimePaths.push(`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path));
  console.log(`Built ${p.id}: ${manifest.activities[0].durationSeconds.toFixed(2)} seconds`);
  if(p.silent||!process.argv.includes("--audio"))continue;
  const audio=buildNativeAseqAudioPack({generatedBy,disc:3,authDirectory:path.join(root,prefix),authFiles:[p.auth],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:evidence,
    stream:{label:`${p.stream}.AFS`,path:path.join(source,`STREAM/${p.stream}.AFS`),manifestPath:`disc3/SCENE/03/STREAM/${p.stream}.AFS`,sha256:p.streamHash},
    soundBank:{label:p.sound,path:path.join(source,`SOUND/${p.sound}`),manifestPath:`disc3/SCENE/03/SOUND/${p.sound}`,sha256:p.soundHash},
    unavailableSounds:p.unavailableSounds,unavailableVoices:p.unavailableVoices,
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
    vgmstream:process.env.VGMSTREAM_CLI||path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli"),python:process.env.DTPK_PYTHON||"python3",
  });
  runtimePaths.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset));
  console.log(`Built ${p.id} audio: ${audio.voices.length} voices; ${audio.sounds.length} effects`);
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(runtimePaths)],{cwd:root,stdio:"inherit"});
