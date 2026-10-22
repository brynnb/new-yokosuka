import assert from "node:assert/strict";
import test from "node:test";
import { PlayModeSession, consumeModeResume, effectiveAvatar } from "../play/account/PlayModeSession.js";

function fixture(options={}) {
  const events=[];
  const values=new Map();
  const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const character={id:7,avatarId:"fuku",playMode:"free_roam",modeRevision:2};
  const account={character,request:async (path,options)=>{events.push(["request",path,options]);return {character};}};
  const mode=new PlayModeSession({account,storage,canSwitch:()=>true,saveDialogue:async()=>events.push("save"),
    lock:()=>events.push("lock"),unlock:()=>events.push("unlock"),beforeSwitch:()=>events.push("before"),
    onState:state=>events.push(state),reload:()=>events.push("reload"),...options});
  return {mode,account,character,events,values,storage};
}
test("mode change saves first and reloads once; duplicate clicks cannot race",async()=>{
  const f=fixture();
  const change=f.mode.switchTo("story");
  assert.equal(await f.mode.switchTo("story"),false);
  assert.equal(await change,true);
  const request=f.events.find(Array.isArray);
  assert.deepEqual(JSON.parse(request[2].body),{mode:"story",revision:2});
  assert.ok(f.events.indexOf("save")<f.events.indexOf(request));
  assert.equal(f.events.filter(x=>x==="reload").length,1);
  assert.equal(effectiveAvatar({...f.character,playMode:"story"}),"ryo");
  assert.equal(effectiveAvatar(f.character),"fuku");
  const resume=await consumeModeResume(async path=>path==="/api/session"?{account:{id:1}}:{characters:[f.character]},f.storage);
  assert.equal(resume.character.id,7);
  assert.equal(f.values.size,0);
});
test("blocked activities and failed saves never make a mode request",async()=>{
  for(const options of [{canSwitch:()=>false},{saveDialogue:async()=>{throw Error("save failed");}}]) {
    const f=fixture(options);
    assert.equal(await f.mode.switchTo("story"),false);
    assert.equal(f.events.some(Array.isArray),false);
    assert.equal(f.values.size,0);
  }
});
test("lost acknowledgement reconciles committed mode; known rejection permits retry",async()=>{
  for(const changed of [true,false]){
    const f=fixture();
    f.account.request=async(path,options)=>{
      if(options.method==="POST") throw Error("network timeout");
      return {character:{...f.character,modeRevision:changed?3:2}};
    };
    assert.equal(await f.mode.switchTo("story"),changed);
    assert.equal(f.events.includes("reload"),changed);
    assert.equal(f.mode.pending,changed);
  }
});
test("disposal during save cancels switch without reloading or issuing requests",async()=>{
  const lifetime=new AbortController();
  const f=fixture({signal:lifetime.signal,saveDialogue:async()=>lifetime.abort()});
  assert.equal(await f.mode.switchTo("story"),false);
  assert.equal(f.events.some(Array.isArray),false);
  assert.equal(f.events.includes("reload"),false);
});
test("resume hint never authorizes a character outside the authenticated account",async()=>{
  const f=fixture();
  await f.mode.switchTo("story");
  await assert.rejects(consumeModeResume(async path=>path==="/api/session"?{account:{id:1}}:{characters:[]},f.storage),/no longer available/);
  assert.equal(f.values.size,0);
});
