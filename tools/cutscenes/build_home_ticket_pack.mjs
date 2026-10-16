#!/usr/bin/env node
// Home and ticket-journey presentations, translated with the existing shared
// activity/audio compilers. Yarn, not the original room controller, saves progress.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack,registerNativeAseqMusic} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {addNativeAseqStageAssets} from "../lib/NativeAseqStageAssets.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";

const root=path.resolve(import.meta.dirname,"../..");
const mapHash="6a4e6e8d8e71aa450fef6922ebe0036776a94cb498710a562e4418a9338037fe";
const commonHash="916aab45137cf340516a1cdd2ee61540e7c6562a1e92c5f932e9055ae0db3b89";
const evidence="docs/design/story-ticket-journey.md";
const actor=(label,code)=>{
  const prefix=code==="INE_M"?"play/assets":"play/assets/characters";
  return {label,modelCode:code,browserFilename:`${code}.CHRM`,assetFormat:"MT5",characterScale:1,
    assetPath:`${prefix}/${code}.CHRM`,textureAssetPath:`${prefix}/${code.slice(0,3)}_textures.bin`};
};
const profiles=[
  {id:"family-departure",disc:3,area:"YDMA",directory:"hazuki",evidence:"docs/design/story-final-day.md#family-departure",resource:"A0180",offset:0x56dc,size:39616,hash:"8c2cac4b9757ad79d905affbc679d14160a07cff9a8ac4a0bd1dd842eed6c855",frames:2328,
    mapHash:"7dc07d2539f818589896f8a0642d8e9aa586c579e53e0088c6a8312d5d3aaf87",
    motion:"M_0180.BIN",motionSize:782904,motionHash:"0d3483e4cf3fa8638d86e1f5812eb75e5fa41f2da62ff00054a2fd6ec0adbc83",bank:22,base:0,actors:["ABAG","AKIR","FUKU","INE_"],
    stage:{archive:"YDMA.PKS",sha256:"ac19788f08f8f6df0c6fc967252660f389aa835dfa1da17e77cd5ed7e7ab72a8",textures:"YDMA.PKF",textureHash:"cb4f13f41c55bd91dca3f602e2a6147215dae70458f4df2afdb5e85a09bd865e",
      maps:["MAP","MAP01","MAP02","MAP03","MAP04","MAP05","MAP06","MAP07","MAP08","MAP09","MAP10"],
      // 89 untextured shapes, deliberately omitted by the shared MT5 visual
      // loader. Collision/trigger roles are not inferred from their shape.
      nonVisualMaps:{"MAP08.MAPM":"342bd5e842d2105dfe68ecedb862f7f1c8a107f5ea6e03d987e0a4330db7af4b"}},
    propModels:{ABAG:{file:"RBGS503G.MT5",size:47100,sha256:"298e63794a5c091783828274d77818f8abfd2e74366a3a8a6e8b989eef928ecf"}},
    music:{id:"bgm107",sourceId:"4da896949a69b4b3b57376150130bacd4bd5034dade910a07030961f10b79ada",bankHash:"f81dffcb63cf5f2f7fa04b94f462950f309b96e253e1f45a756e974b4d456a13",label:"Leaving Yokosuka"},
    stream:"A0180",streamHash:"03ddc7938efbf2f207f138e7b6ca38c5f5b7296e9267e4b4ddc301fe30eff17d",sound:"A1_KSTAB.SND",soundHash:"a6084db822026733c6f89ac738b9d584d2aec2c624351fb6d5fb50620934799a"},
  // The longer 0x9f1fc variant requests absent 01GETA001/B001 voices.
  // This original alternate matches all nineteen English AFS entries; do not
  // alias the missing names or silently cut commands out of the longer AUTH.
  {id:"nozomi-night-call",disc:3,evidence:"docs/design/story-nozomi-rescue.md",resource:"01GET",offset:0xae990,size:9480,hash:"42959eb45297b6dfc93906cf1403b4a4a0d10f7a9d98399973094e650ba9f78f",frames:2265,
    mapHash:"43c613a944cc021e26793193826cf6e7dde57cd5f55ce1bfa9c1e41ce33c9c89",commonHash:"4df506b3994e111f1bc105a4485a22b19abcdf9cb6a1a02b2e0fab3f049cf136",
    motion:"M_01GT.MOTN",motionSize:33268,motionHash:"d5fa591c1fadad7e1a4391390d57452c51ec69d5badaa598f1af54d3b55b618a",bank:25,base:32,actors:["TEL_","INE_","AKIR"],
    music:{id:"bgm063",sourceId:"9c6892be5fa729b65e082fca6ea936f53f9ddcd4b1e30a10fd75a688674758fc",bankHash:"10dd803ed6c835cfc54967205bcae9e9c7eed0ba9380a9d5e52c9d49f084c879",label:"Nozomi's late-night call"},
    stream:"01GET",streamHash:"094744020cc5e287d1bcad7b4f2e76643e502dca1b7bc76c8a42506724d9862e",sound:"A1_FUKYU.SND",soundHash:"ef51ec306c847c654388677b89f6cf67698287b51f11252c6f546486266476f7"},
  {id:"jimmy-morning-call",resource:"A0169",offset:0x9d7dc,size:7456,hash:"b113abdfdc1eb09823a1f80f17ea26e697afffe042b300ac656e4d9f53372a1d",frames:1600,
    motion:"M_0169.MOTN",motionSize:181132,motionHash:"091fa20c78398a3e3756ee21ffc0a26425ea6e3ecffcc316122a31f41fae3d7f",bank:19,base:0,actors:["TEL_","FUKU","AKIR"],
    stream:"A0169",streamHash:"f75f94816b8a8f011dbf372f57077596f45c21f382ed13816d80450672edb796",sound:"A1_JYTEL.SND",soundHash:"b36c631fd2911f0450652cbdddb1feaa608b01387f8b2b70a7abc69cddc9c2fe"},
  {id:"post-chen-home",resource:"A0160",offset:0xb7ff4,size:3276,hash:"5d559c6b948d565b4755ebdcaf04fc6d7d7276e8d5087a8c6b1a6b81e901e9e2",frames:650,
    motion:"M_0160.MOTN",motionSize:7456,motionHash:"f7b5e2410d8bf9bcb5e31372f1b69dceea706e1a26e975fc262ad73165040a62",bank:25,base:112,actors:["AKIR","FUKU"],
    stream:"A0160",streamHash:"9895738da8b143f1ea3930a66beef9492fc82e9eb0856014878d7db1606c4a49",sound:"A1_HUKHE.SND",soundHash:"f05518358966ff53f5f6ebda47710ead4d0f11a7dc9605e336a0da2bc17f7b10"},
  {id:"bank-savings",resource:"01BNK",offset:0xa0ef4,size:26476,hash:"e6664ffb1698433742c5877e389fe8376455959ad4ffd0a1f54fad0126376101",frames:756,
    motion:"M_01BK.MOTN",motionSize:10544,motionHash:"5601ff6d9cebf5a6a2ad125cb5ab3d427e319a17bcc364718f148ddbcd61ae9e",bank:24,base:0,actors:["BANK","AKIR"],
    stream:"01BNK",streamHash:"8c9326d2fc8bfa27d4599f9b42f6a38c8300cb25ef0402eb98ed52292656c0c0",sound:"A1_TUMIR.SND",soundHash:"8d3f347ce7aa7f870074cf0a09ffd3a94f83b012bead47aa63ab827d4b1c4c7c"},
  {id:"travel-family",resource:"01EAR",offset:0xb4460,size:15244,hash:"f7196a33095b31f38643bb19b1c6aba99f683d714592a9c26012df9a3f105318",frames:2467,
    motion:"M_01EAR.MOTN",motionSize:63684,motionHash:"e5d9f9571a52363b2d338897b7062806fc43dd4ff8d62d53b06691c27d926649",bank:25,base:144,actors:["AKIR","INE_","FUKU"],
    stream:"01EAR",streamHash:"f29867ee43becb0b3d502df754bc03d5ea4882bdd7e073038115098e73e8a76e",sound:"A1_KIKUM.SND",soundHash:"1796869c37bc441211d7e2478f56af77883e9d97492838d115dc941c05ddbc32"},
  {id:"fuku-travel-funds",resource:"01MON",offset:0xa9588,size:34804,hash:"bbcf4e63e836d54ceec791425a9bcea19a960e43e7d7aa4ce3a2d5d7c1940bac",frames:2660,
    motion:"M_01MO.MOTN",motionSize:45496,motionHash:"e3c709dcb3be13f67f99a6e832b2c11eaa3a3471c0c08f885ce5ed3a8c4cc224",bank:25,base:96,actors:["AKIR","FUKU","PIG_","COIN","PANF"],
    stream:"01MON",streamHash:"6b7044b821d0e34a90c0a6baaacac9cbc2df5bcd71cd2d91649337e3a6c81d06",sound:"A1_CHOFK.SND",soundHash:"d7717ae5387e0d1de4ca45ffc24764b77606979efddee97a911481983a327465"},
  {id:"global-airfare",area:"DSKI",resource:"01MIT",offset:0x24e90,size:12908,hash:"0d5c606b88fedfa2252d7bd1538c516cc053e43a152c3c3946789af727779733",frames:1470,
    mapHash:"17d1f11dda00b6040dab2d3cd914bf05b0caa605d90ed751cbd445f278e80f1e",
    motion:"M_01MIT.BIN",motionSize:76908,motionHash:"fdc0e3df9d0664a748bfb3119d4ec1a37df8ed866ff0344be82f1d33819412b4",bank:16,base:0,actors:["DOOR","TYOB","TIRA","SPEN","SIND","AKIR"],
    // F1SEKAIR is the room bank (a905); this AUTH requests the separate
    // a904 cinematic bank. S1_SEKAI has exactly those nine playable commands.
    stream:"01MIT",streamHash:"9f79b1cdf1254a76197b36597a20d88e93be9cdb55c8a7501a9833620348106c",sound:"S1_SEKAI.SND",soundHash:"3219ebe4f8454af793d7a27bbcb72fe3ea1525b28d5e3edc4fa3180d0c676357"},
  {id:"asia-airfare",area:"ARAR",resource:"01ETU",offset:0x12684,size:71032,hash:"0d76d7b59730cd8116d9b67480a26eec02b285d3aeaa9c8a5242d3432e91b251",frames:2129,
    mapHash:"e5adb7020c8c0704316adc482881b77ce9660f59c97f946ab2735e8ac9612c98",
    motion:"M_01ETU.BIN",motionSize:80996,motionHash:"6e069dd760bff2dd8c8815865f2dfcef58ebe3898cc36e9c77205d27e329759d",bank:48,base:0,actors:["INF1","INF2","MAGA","AKIR","ETKO"],
    stream:"01ETU",streamHash:"f21b7837177788630c2f7e849e5627152a1e335628ae70e4ffe4062afa39db4c",sound:"A1_ETUKO.SND",soundHash:"6e960914c59edd80ddc282179ec6379c26a7c461a15d89954ab2af3bb9fd5485"},
];
profiles.push(
  {id:"chai-intro",area:"GMCT",resource:"A0172",offset:0x5edc,size:56836,hash:"01e36d04c63cc52eb2399b17f652ed583308bcbbc873abddc85c9dc7b2865b00",frames:2200,
    mapHash:"1a63b5c07521fc8c9f3d8c734e1ec1336ef3d7f610fce6fc16c82eb1e4d1ce91",
    motion:"M_0172.BIN",motionSize:713600,motionHash:"6b566f4d2bc6890145e3c7f2ba1fdf0d9a3b73655e1ff537d4ac03dfa145ed68",bank:32,base:0,actors:["AKIR","CHAI"],
    stream:"A0172",streamHash:"bd0254f300db784f63a8af44b6b3dd37133f0016b9eae74454567e2d1c6efd80",sound:"A1_BGAM.SND",soundHash:"26c2a06889cf8128de66d34330732236a7d896685a751be38f152e697a29d1c7"},
  {...profiles.find(p=>p.id==="global-airfare"),id:"global-boat",offset:0x280fc,size:7768,hash:"fb621852f1ba096115a1d46a23ac600f9d5b6479608a071e178785d9a965a00a",actors:["TYOB","DOOR","SIND","AKIR"]},
  {...profiles.find(p=>p.id==="asia-airfare"),id:"boat-ticket-purchase",offset:0x23bfc,size:50212,hash:"676014994eafde1eedec3bd526d98989edae51c0ac13dc60ca462d31c8f8b7ea",frames:1998,actors:["INF3","MONY","PURS","TRAY","AKIR","ETKO"]},
  {...profiles.find(p=>p.id==="asia-airfare"),id:"boat-ticket-collection",resource:"A0165",offset:0x5ff4,size:19064,hash:"1cb299fd3831f2501cd9742d0dd00c2ea59e32d9be393d5b21af5e1f0bd35853",frames:2082,
    motion:"M_0165.BIN",motionSize:453880,motionHash:"2451ea8698e5e2ec6c7e2cf6097d78e0532cd874791bc5927cbcef202688f7ac",bank:16,actors:["AKIR","JIMY","KJHS","MNWA"],
    stream:"A0165",streamHash:"1e0a9ba2ffae287af250282cbab817087dde6274acd044bcc9b5f3f3175e1863",sound:"A1_ASIAR.SND",soundHash:"6b228b029deca6aa58fe0a17d0118111640ed18bacb47305457c9ad612ec4cab"},
);
const chaiIntro=profiles.find(p=>p.id==="chai-intro");
profiles.push(
  {...chaiIntro,id:"chai-victory",offset:0x13ce0,size:11708,hash:"138da958d954994cfe9c16c4322d6309ec652edead845849fb2de9389ba5fdac",frames:1150,actors:["DOOR","SLOT","AKIR","CHAI","NITO"]},
  {...chaiIntro,id:"chai-rescue",resource:"A0172A",offset:0x16a9c,size:5972,hash:"d2d2949a22bc2e214224f0048465333e5cc8dc059c787f0cd18ded24793bc893",frames:437,actors:["DOOR","SLOT","AKIR","CHAI","FUKU"],
    stream:"A0172A",streamHash:"cf360208aeca97a7d14e26647653449818510b5f36a003e5d3b1c2d457c682a1"},
);
const characters={FUKU:["Masayuki Fukuhara","FUK_M"],INE_:["Ine-san","INE_M"],SIND:["Satoshi Shinoda","SND_L"],ETKO:["Etsuko Sekine","JOJ_L"],
  JIMY:["Jimmy Yan","JIM_M"],KJHS:["Koji Hase","TPL_L"],MNWA:["Kazumi Minowa","MIR_L"],CHAI:["Chai","CHA_M"],NITO:["Yuji Nito","GAT_L"]};
const asiaModels={
  TIRT230G:[19776,"25989de0432ac1014543fd70dcd40530c98fc02bd076962a5f700ec03fa0c35b"],
  TIRS703G:[68928,"d01d70fea30308739de0d21e5a771605fa78cc12765499d6e21aaa7cbdf034ae"],
  ZSR3H03G:[15664,"8f69c5549a650b928a7748d75b665dedb0771b476ab8020842e465e0f3366499"],
  ARP3H01G:[7488,"e61709183d8858a2d9df8c8c34cd60dac6d682f1ab9ef9787ab13a1e37f9b3f1"],
  UKES500G:[3936,"d9be08984129dcf4610de1ab09ccd772f6658c6fac2e104ec4bf76f18ae8a6d1"],
  OSAS5LOG:[4080,"f65cb8e739c629e76dcf2d6c40b56761649399bf71925b77838973912d27df8a"],
  SAFS500G:[7868,"7294b11ed28f87f045eeaf508cdfe1c2957abc3750d5b2a49ae9de47806aa493"],
};
const runtimePaths=[];
const profileIndex=process.argv.indexOf("--profile");
const selectedProfiles=profileIndex<0?profiles:profiles.filter(p=>p.id===process.argv[profileIndex+1]);
if(!selectedProfiles.length)throw Error("--profile requires a known ticket-journey presentation ID");
for(const p of selectedProfiles){
  const disc=p.disc??2,discPath=`disc${disc}/SCENE/0${disc}`;
  const source=path.join(process.env[`SHENMUE_DISC${disc}_EXTRACTED_ROOT`]||path.join(root,`extracted_disc${disc}_v2`),`data/SCENE/0${disc}`);
  const common=path.join(source,`JOMO/COMMON0${disc}.PKS`);
  const area=p.area||"JOMO",mapSource=path.join(source,area,"MAPINFO.BIN");
  const prefix=`play/assets/${p.directory||(p.area?"dobuita":"hazuki")}/${p.id}`,audioPrefix=`public/audio/world/${p.id}`;
  const members=[
    {name:`${p.resource}.AUTH`,sourcePath:mapSource,sourceManifestPath:`${discPath}/${area}/MAPINFO.BIN`,sourceOffset:p.offset,sourceSha256:p.mapHash||mapHash,byteLength:p.size,sha256:p.hash},
    {name:p.motion,sourcePath:p.area?path.join(source,area,p.motion):common,sourceManifestPath:`${discPath}/${area}/${p.area?p.motion:`COMMON0${disc}.PKS`}`,...(p.area?{}:{archiveMember:p.motion,sourceSha256:p.commonHash||commonHash}),byteLength:p.motionSize,sha256:p.motionHash},
  ];
  const props={},outputMembers=[],textureSources=[];let generatedAssets=[];
  if(area==="GMCT"){
    const bytes=fs.readFileSync(mapSource),chrs=bytes.indexOf("CHRS"),bindings=parseChrtSceneObjectBindings(bytes.subarray(chrs));
    for(const tag of p.actors.filter(tag=>tag!=="AKIR"&&!characters[tag])){
      const binding=bindings.find(value=>value.actorTag===tag);if(!binding)throw Error(`Unresolved original GMCT prop ${tag}`);
      // DGCT retains its existing scenery. Keep these original reference
      // actors without duplicate models; cabinet knock-over is omitted for now.
      props[tag]={model:binding.model,browserFilename:`GMCT-${tag}-reference`,referenceOnly:true,
        sourceBinding:{mapInfoChrsOffset:chrs,characterRecordOffset:binding.characterRecordOffset,defImageRecordOffset:binding.defImageRecordOffset}};
    }
  }
  if(p.actors.includes("TEL_")){
    // JOMO's existing TEL_ placement owns this phone. Borrow and restore it;
    // adding another model would put two phones at the same original pose.
    props.TEL_={model:"TELS514G",browserFilename:"S1_JOMO_TELS514G.MT5",objectTag:"TEL_"};
  }
  const prop=(tag,file,size,hash,archive=null)=>{
    members.push({name:file,sourcePath:path.join(source,area,archive||file),sourceManifestPath:`${discPath}/${area}/${archive||file}`,
      ...(archive?{archiveMember:file}:{}),byteLength:size,sha256:hash});
    outputMembers.push(file);
    props[tag]={model:file,browserFilename:file,assetPath:`${prefix}/${file}`,textureAssetPath:`${prefix}/textures.bin`};
    if(!archive)textureSources.push(path.join(source,area,file));
  };
  if(p.stage){
    addNativeAseqStageAssets({stage:p.stage,sourceDirectory:path.join(source,area),sourceManifestPrefix:`${discPath}/${area}`,assetPrefix:prefix,members,outputMembers,sceneObjects:props,generatedAssets});
  }
  for(const [tag,model]of Object.entries(p.propModels||{}))prop(tag,model.file,model.size,model.sha256);
  if(p.id==="bank-savings"){
    // The original room's bank-scene resource cluster names $BNKT2DBG.MT5
    // immediately before 01BNK. Its AMOV already owns the full book trajectory.
    const file="BNKT2DBG.MT5",textureSource=fs.readFileSync(path.join(source,"JOMO/MPK00.PKF"));
    if(sha256(textureSource)!=="6dd037556b29ba3731f0c1e9a3013ad5e84ec67a07b04f2185f5fb3338588888")throw Error("Changed bankbook textures");
    members.push({name:file,sourcePath:path.join(source,"JOMO",file),sourceManifestPath:`disc2/SCENE/02/JOMO/${file}`,byteLength:57340,sha256:"1ba59f425eb7cd90f598a4571569c3eefd4fa530dab65c5876edc7f6283a72f5"});
    props.BANK={model:"BNKT2DBG",browserFilename:file,assetPath:`${prefix}/${file}`,textureAssetPath:`${prefix}/textures.bin`};
    outputMembers.push(file);
    generatedAssets=[{assetPath:`${prefix}/textures.bin`,bytes:extractNativeTexnPack(textureSource,"JOMO/MPK00.PKF").bytes,
      source:{path:"disc2/SCENE/02/JOMO/MPK00.PKF",sha256:sha256(textureSource)}}];
  }
  if(p.id==="fuku-travel-funds"){
    // Two room placements share this model. Borrow the logical PIG_ only,
    // preserving the unrelated desk ornament and avoiding a third copy.
    props.PIG_={model:"BTAS500G",browserFilename:"S1_JOMO_BTAS500G.MT5",objectTag:"PIG_"};
    prop("COIN","OKAK301G.MT5",31056,"1a0b55b541b6a270ce4acc220e31fcf61cebc6774e36e2f4855d107992e828ef");
    prop("PANF","TIRS701G.MT5",68928,"ed04bb8b23c40878b276f960ca4033f3f6362224485b0cc6c6440eec97ad4459");
  }
  if(area==="DSKI"){
    props.DOOR={model:"door-transform-reference",browserFilename:"DOOR",referenceOnly:true};
    prop("TYOB","CLIK302G.CHRM",1716,"5e8a318cc8c226482dabd2b55c22778f197c88fd55a1f3e0ee96114bdbd99646","MPK00.PKS");
    if(p.actors.includes("TIRA"))prop("TIRA","TIRT240G.CHRM",1316,"67ced3a3f254674e11eacccb34ae4a3032c309a2587117fcd741966b509b813c","MPK00.PKS");
    if(p.actors.includes("SPEN"))prop("SPEN","PENK300G.CHRM",1532,"13d50de6c49805ef9930ff22931ccba6f3db94e72b909103a0bdf4f4a8b747f9","MPK00.PKS");
    const textureSource=path.join(source,area,"MPK00.PKF");
    if(sha256(fs.readFileSync(textureSource))!=="9b28a17766ee9d856ac0385b79f141d984232af7ed91419d6fb51e229fdb9871")throw Error("Changed Global Travel textures");
    textureSources.push(textureSource);
  }
  if(area==="ARAR"){
    const bytes=fs.readFileSync(mapSource),chrs=bytes.indexOf("CHRS");
    const bindings=parseChrtSceneObjectBindings(bytes.subarray(chrs));
    for(const tag of p.actors.filter(tag=>tag!=="AKIR"&&!characters[tag])){
      const binding=bindings.find(value=>value.actorTag===tag),definition=asiaModels[binding?.model];
      if(!definition)throw Error(`Unresolved original ARAR prop ${tag}`);
      prop(tag,`${binding.model}.MT5`,...definition);
      props[tag].sourceBinding={mapInfoChrsOffset:chrs,characterRecordOffset:binding.characterRecordOffset,defImageRecordOffset:binding.defImageRecordOffset};
    }
  }
  if(textureSources.length)generatedAssets.push({assetPath:`${prefix}/textures.bin`,bytes:Buffer.concat(textureSources.map(file=>extractNativeTexnPack(fs.readFileSync(file),file).bytes))});
  const manifest=buildNativeAseqActivityPack({generatedBy:"tools/cutscenes/build_home_ticket_pack.mjs",resourceName:p.resource,disc,
    sourceMembers:members,expectedMembers:members,bindingEvidence:p.evidence||evidence,
    selectionRule:"Exact embedded AUTH selected by authored chapter order. Slot 0 is a package-local handle, not a recovered native story selector.",
    outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
    motionBanks:[{bank:p.bank,member:p.motion,parseOptions:{sequenceIndexBase:p.base}}],
    activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:`${p.resource}.AUTH`,actors:p.actors,durationFrames:p.frames,
      ...(p.stage?{browserMapVisibility:[],browserIsolatedStage:true,browserLightingPresetIndex:0,nativeSceneObjectStates:Object.entries(props).filter(([,v])=>v.lifecycle?.kind==="room-script-persistent").map(([actorTag])=>({actorTag,presented:true}))}:{})}],
    packageActors:Object.fromEntries(Object.entries(characters).filter(([tag])=>p.actors.includes(tag)).map(([tag,[label,code]])=>[tag,actor(label,code)])),
    ...(Object.keys(props).length?{sceneObjects:props,outputMembers,generatedAssets}:{}),
  });
  runtimePaths.push(`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path));
  console.log(`Built ${p.id}: ${manifest.activities[0].durationSeconds.toFixed(2)} seconds`);
  if(!process.argv.includes("--audio"))continue;
  const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_home_ticket_pack.mjs",disc,
    authDirectory:path.join(root,prefix),authFiles:[`${p.resource}.AUTH`],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:p.evidence||evidence,
    stream:{label:`${p.stream}.AFS`,path:path.join(source,`STREAM/${p.stream}.AFS`),manifestPath:`${discPath}/STREAM/${p.stream}.AFS`,sha256:p.streamHash},
    soundBank:{label:p.sound,path:path.join(source,"SOUND",p.sound),manifestPath:`${discPath}/SOUND/${p.sound}`,sha256:p.soundHash},
    ...(p.id==="boat-ticket-collection"?{unavailableVoices:Object.fromEntries(["A0165A008.str","A0165A009.str"].map(name=>[name,{
      reason:"This exact original AUTH reference is absent from A0165.AFS; retain its cue without substitute speech.",evidence:"disc2/SCENE/02/STREAM/A0165.AFS original member directory",
    }]))}:{}),
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,
    dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),vgmstream:process.env.VGMSTREAM_CLI||path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli"),python:process.env.DTPK_PYTHON||"python3",
  });
  runtimePaths.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset));
  if(p.music)runtimePaths.push(...registerNativeAseqMusic(root,p.music));
  console.log(`Built ${p.id} audio: ${audio.voices.length} voices; ${audio.sounds.length} effects`);
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(runtimePaths)],{cwd:root,stdio:"inherit"});
