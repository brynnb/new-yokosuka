import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import {createScriptEventPresentationCatalog} from "../play/scripts/ScriptEventPresentationCatalog.js";
import {StoryRegionRuntime} from "../play/scripts/StoryRegionRuntime.js";
import {parseAuthMovement,evaluateAuthActor} from "../src/AuthMovement.js";
import {parseAuthSequence} from "../src/AuthSequence.js";
import {parseAuthStrings} from "../src/AuthStrings.js";
import {parseNativeSrfRecords} from "../src/NativeLipSync.js";
import {afsMembers} from "../tools/lib/NativeAseqAudioPack.mjs";
import assets from "../src/runtime-assets.generated.json" with {type:"json"};
import placements from "../play/data/jomo-runtime-placements.json" with {type:"json"};
import regions from "../play/data/story-regions.json" with {type:"json"};
import investigation from "../tools/scripting/story-investigation.json" with {type:"json"};

const readJson=p=>JSON.parse(readFileSync(p,"utf8"));
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const catalog=createScriptEventPresentationCatalog();
const profiles=[
  {id:"fuku-translated-letter",resource:"01MEM",disc:1,offset:0xb22f8,frames:1051,owner:"0x6ce90",callback:"0x6d3a4",slot:34,prop:"MEMO",
    sha256:"cf859cd3450e3c6e18b965bcc39850b32e209dd96f6815a5a4683880b6b0a099",soundCount:25,samples:14,
    voiceFrames:[95,128,188,350,413,582,687,740,834,885,969],
    voices:["B001","A001","B002","A002","B005","B003","A003","B006","A005","B008","A006"]},
  {id:"fuku-after-jimmy",resource:"01JIB",disc:3,offset:0xaa6fc,frames:1150,owner:"0x78b50",callback:"0x7b0e4",slot:41,prop:"dor0",
    sha256:"e9659c20bd2071610d89a7425681161b92c713f5c04803fa4d5398cc3cb90273",soundCount:24,samples:12,
    voiceFrames:[185,269,313,375,472,558,686,815,930],
    voices:["B001","A001","B002","A002","B003","B004","B005","A003","B006"]},
];
for(const film of profiles){
  const dir="play/assets/hazuki/"+film.id,manifest=readJson(dir+"/manifest.json");
  const auth=readFileSync(dir+"/"+film.resource+".AUTH"),activity=manifest.activities[0];
  const audio=readJson("public/audio/world/"+film.id+"/manifest.json");
  const ir=readJson("tools/evidence/"+film.id+"-callback-ir.json");
  const extracted=process.env["SHENMUE_DISC"+film.disc+"_EXTRACTED_ROOT"] ||
    (film.disc===1?"extracted_files":"extracted_disc3_v2");
  const source=path.join(extracted,"data/SCENE/0"+film.disc);
  test(film.resource+" binds the embedded film, native owner slot and face/prop callback",()=>{
    const runtime=catalog.activity("s1.jomo."+film.id+".scene");
    assert.equal(runtime.area,"JOMO");
    assert.equal(runtime.cutscene.packageId,film.id);
    assert.equal(runtime.cutscene.worldId,"interior");
    assert.equal(runtime.cutscene.activity.slot,0);
    assert.equal(runtime.cutscene.activity.binding.activityId,activity.activityId);
    const member=manifest.source.members.find(m=>m.name===film.resource+".AUTH");
    assert.equal(member.sourceOffset,film.offset);
    assert.equal(hash(auth),film.sha256);
    assert.equal(member.sha256,film.sha256);
    assert.equal(member.sourceSha256,ir.source.mapinfoSha256);
    assert.equal(ir.source.disc,film.disc);
    assert.equal(ir.function.id,film.callback);
    const owner=ir.supportingFunctions.find(f=>f.id===film.owner);
    const actions=owner.blocks.flatMap(b=>b.actions);
    assert.ok(actions.some(a=>a.targetFileOffset===film.callback));
    assert.ok(actions.some(a=>a.operationHex==="0x0050" && a.arguments[0]?.value===film.slot));
    assert.equal(activity.durationFrames,film.frames);
    assert.deepEqual(activity.actors,["AKIR","FUKU",film.prop]);
    assert.deepEqual(activity.commandCounts,{camera:1,move:3,motion:5,sound:film.soundCount,voice:film.voices.length});
    for(const file of manifest.outputs)assert.equal(assets.assets[file.path].sha256,hash(readFileSync(file.path)));
  });
  test(film.resource+" resolves every authored voice and sound on its original frame",()=>{
    const commands=parseAuthSequence(auth).frames.flatMap(f=>f.commands),strings=parseAuthStrings(auth).strings;
    const voiceCommands=commands.filter(c=>c.name==="voice");
    const byPath=new Map(audio.voices.map(v=>[v.sourcePath,v]));
    assert.deepEqual(voiceCommands.map(c=>byPath.get(strings[c.stringIndex])?.voiceId),film.voices.map(id=>film.resource+id));
    assert.deepEqual(voiceCommands.map(c=>c.frame),film.voiceFrames);
    assert.equal(audio.voices.length,voiceCommands.length);
    for(const cmd of voiceCommands){
      const v=byPath.get(strings[cmd.stringIndex]);
      assert.equal(v.speakerId,cmd.actorTag);
      assert.ok(v.displayText.trim() && v.lipSync.cues.length);
    }
    const sounds=commands.filter(c=>c.name==="sound");
    assert.equal(sounds.length,film.soundCount);
    assert.equal(audio.sounds.length,film.samples);
    for(const cmd of sounds.filter(c=>!c.stop)){
      assert.ok(audio.sounds.some(sound=>sound.commandHex===cmd.commandHex && sound.sourcePath===strings[cmd.stringIndex]));
    }
    for(const item of [...audio.voices,...audio.sounds]){
      assert.equal(assets.assets[item.asset].sha256,item.sha256);
      assert.equal(hash(readFileSync(item.asset)),item.sha256);
    }
  });
  test(film.resource+" matches retail AUTH, speech members, subtitles and lip timings",
    {skip:!existsSync(path.join(source,"JOMO/MAPINFO.BIN"))},()=>{
      const map=readFileSync(path.join(source,"JOMO/MAPINFO.BIN"));
      assert.equal(hash(map),ir.source.mapinfoSha256);
      assert.deepEqual(map.subarray(film.offset,film.offset+auth.length),auth);
      const afs=readFileSync(path.join(source,"STREAM/"+film.resource+".AFS"));
      assert.equal(hash(afs),audio.sources.stream.sha256);
      const members=afsMembers(afs,film.resource),speech=members.filter(m=>/\.str$/i.test(m.name));
      const subtitles=parseNativeSrfRecords(members.find(m=>/\.srf$/i.test(m.name)).bytes);
      for(const voice of audio.voices){
        const index=speech.findIndex(m=>m.name.toLowerCase()===voice.nativeMember.toLowerCase());
        assert.notEqual(index,-1);
        assert.equal(hash(speech[index].bytes),voice.nativeSha256);
        assert.equal(voice.displayText,subtitles[index].displayText);
        assert.deepEqual(voice.lipSync,subtitles[index].lipSync);
      }
    });
}

test("Ryo grips, shifts, unfolds and releases the original letter",()=>{
  const manifest=readJson("play/assets/hazuki/fuku-translated-letter/manifest.json");
  const activity=manifest.activities[0],memo=manifest.attachedObjects.MEMO;
  assert.equal(memo.sceneObject,true);
  assert.equal(memo.assetPath,manifest.sceneObjects.MEMO.assetPath);
  assert.deepEqual(memo.attachments.map(c=>[c.frame,c.action,c.parentActorTag,c.controlId]),[
    [273,"attach","AKIR",18],[390,"attach","AKIR",18],[548,"detach",undefined,undefined],
  ]);
  assert.deepEqual(memo.attachments.slice(0,2).map(c=>c.translation.map(n=>Math.round(n*1000))),[
    [116,12,-36],[147,6,-27],
  ]);
  assert.deepEqual(memo.attachments.slice(0,2).map(c=>c.rotationRaw),[[45003,65427,30081],[39360,64700,31173]]);
  assert.ok(memo.attachments.every(c=>c.activityId===activity.activityId));
  assert.deepEqual(memo.nodeTransforms.map(n=>[n.frame,n.nodeKey,n.mode,n.rotationRaw]),[
    [0,3,"set",[0,0,30601]],[0,14,"set",[0,0,30492]],[548,3,"set",[0,0,0]],[548,14,"set",[0,0,0]],
  ]);
  assert.deepEqual(activity.nativeHandPoseCues.map(c=>[c.frame,c.actorTag,c.side,c.poseTableOffset]),[[295,"AKIR","right","0x96ec0"]]);
  assert.deepEqual(activity.nativeHandComponentCues.map(c=>[c.frame,c.componentMask,c.rotationRaw]),[
    [295,21,[0,0,0]],[390,21,[4733,910,-2001]],
  ]);
  assert.deepEqual(activity.nativeBodyHandPoseCues.map(c=>[c.frame,c.targetIndex,c.durationNativeTicks]),[[555,8,16]]);
});

test("01JIB animates the bedroom door and times Fuku's and Ryo's ten facial expressions",()=>{
  const dir="play/assets/hazuki/fuku-after-jimmy",manifest=readJson(dir+"/manifest.json");
  const placement=placements.placements.find(p=>p.runtime?.staticDoorIndex===7);
  assert.deepEqual(manifest.sceneObjects.dor0,{model:"DR01_015",browserFilename:placement.model,objectTag:placement.runtime.objectTag});
  assert.equal(placement.runtime.objectTag,"dor7");
  const track=parseAuthMovement(readFileSync(dir+"/01JIB.AUTH")).actors.find(a=>a.tag==="dor0");
  const p=evaluateAuthActor(track,0);
  for(const [i,n] of [-p.x,p.y,p.z].entries())assert.ok(Math.abs(n-placement.position[i])<.04);
  assert.ok(Math.abs(evaluateAuthActor(track,993/30).rotationY)<.02);
  assert.ok(Math.abs(evaluateAuthActor(track,1029/30).rotationY+71.23)<.1);
  assert.ok(Math.abs(evaluateAuthActor(track,1055/30).rotationY)<.02);
  assert.deepEqual(manifest.activities[0].nativeFaceClipCues.map(c=>[c.frame,c.actorTag,c.clipGroup,c.selector,c.durationNativeTicks]),[
    [0,"FUKU",3,0,1],[0,"AKIR",0,0,1],[400,"AKIR",3,0,1],[555,"AKIR",7,0,10],[650,"AKIR",0,0,10],
    [720,"FUKU",5,0,10],[830,"AKIR",1,0,1],[900,"FUKU",7,0,1],[965,"AKIR",0,0,10],[1060,"FUKU",3,0,10],
  ]);
});

test("the evening hall dispatch opens at 19:00 and respects Goro, Jimmy and one-time story state",()=>{
  const route=investigation.routes.find(r=>r.id==="fuku-after-jimmy");
  const region=regions.regions.find(r=>r.id===route.bounds);
  assert.deepEqual(route.hours,[19,24]);
  assert.deepEqual(region.hours,route.hours);
  assert.deepEqual(route.excludedNativeFlags,["2:410","2:780"]);
  assert.deepEqual(route.nativeEffects,[{address:"2:780",value:1}]);
  const source=readFileSync("tools/scripting/"+route.yarnTemplate,"utf8");
  assert.match(source,/native_value\("2:400"\) == 0 && !flag_set\("story\.s1\.jimmy-interrogation\.completed"\)/);
  const flags={"story.s1.jimmy-interrogation.completed":true};
  const character={id:1,playMode:"story",openingCompleted:true,storyFlags:flags};
  let date=new Date("1986-12-10T18:59:59Z"),starts=0;
  const runtime=new StoryRegionRuntime({regions:[region],controller:{status:"idle",start:async()=>{starts++}},
    getGameDate:()=>date,getCharacter:()=>character,publishPresence:()=>true});
  const frame={area:"JOMO",worldId:"interior",enabled:true,playerPosition:[-16.3,0,1.8]};
  assert.equal(runtime.update(frame),false);
  date=new Date("1986-12-10T19:00:00Z");
  assert.equal(runtime.update(frame),true);
  assert.equal(starts,1);
  runtime.reset();
  flags["story.s1.goro-job-lead.completed"]=true;
  assert.equal(runtime.update(frame),false);
  delete flags["story.s1.goro-job-lead.completed"];
  flags[route.completedFlag]=true;
  assert.equal(runtime.update(frame),false);
});

const lateMap=path.join(process.env.SHENMUE_DISC3_EXTRACTED_ROOT||"extracted_disc3_v2","data/SCENE/03/JOMO/MAPINFO.BIN");
test("retail JOMO selects the evening event internally and assigns the captured bedroom door",
  {skip:!existsSync(lateMap)},()=>{
    const map=readFileSync(lateMap);
    // Word values below are little-endian SH4 instructions at the decoded callback.
    assert.equal(map.readUInt16LE(0x8b32e),0xe513); // mov #19,r5
    assert.equal(map.readUInt16LE(0x8b330),0x3453); // cmp/ge r5,r4 on clock.hour
    assert.deepEqual([0x8b3b0,0x8b3b4,0x8b3b8].map(p=>map.readUInt32LE(p)),[400,410,780]);
    assert.deepEqual([0x8b35a,0x8b378,0x8b39a].map(p=>map.readUInt16LE(p)),[0xe501,0xe500,0xe500]); // expected flag values
    assert.equal(map.readUInt16LE(0x8b3c4),0xe522); // mov #34,r5
    assert.equal(map.readUInt16LE(0x8b3c6),0x2452); // mov.l r5,@r4, scene[0]
    assert.equal(map.readUInt16LE(0x8d09a),0xe522); // case 34
    // 0x78d86 queries JOMO's descriptor 11 for its first type-2 record.
    const ir=readJson("tools/evidence/fuku-after-jimmy-callback-ir.json").supportingFunctions[0];
    const lookup=ir.blocks.flatMap(b=>b.actions).find(a=>a.callFileOffset==="0x78d86");
    assert.deepEqual(lookup.arguments.map(a=>a.value),[3,11,2]);
    const descriptorOffset=0x92660+11*52;
    const sequence=0x92a08+4*map.readUInt32LE(descriptorOffset);
    const indices=[];
    for(let address=sequence;address+4<=0x92ad8;address+=4){
      const index=map.readUInt32LE(address);
      if(index===0xffffffff)break;
      indices.push(index);
    }
    const index=indices.find(i=>map.readUInt32LE(0x92b48+i*36)===2);
    assert.equal(index,7);
    const door=0x92b48+index*36;
    assert.equal(map.readUInt32LE(door+4),2);
    assert.deepEqual([20,24,28].map(i=>Number(map.readFloatLE(door+i).toFixed(3))),[16.302,0,1.833]);
  });
