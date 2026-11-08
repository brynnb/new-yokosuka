import assert from "node:assert/strict";
import test from "node:test";
import {StoryFrameHandoff} from "../play/scripts/StoryFrameHandoff.js";

function fixture(){
  const calls=[],waiters=[];
  const handoff=new StoryFrameHandoff({captureFrame:owner=>(calls.push(["capture",owner]),true),releaseFrame:owner=>(calls.push(["release",owner]),true),
    afterRender:signal=>new Promise((resolve,reject)=>{
      if(signal?.aborted){reject(signal.reason);return;}
      const abort=()=>reject(signal.reason);signal?.addEventListener("abort",abort,{once:true});
      waiters.push(()=>{signal?.removeEventListener("abort",abort);resolve();});
    })});
  return {handoff,calls,waiters};
}
const cutscene={id:"intro",handoffSequence:"choice"};

test("the captured film frame remains until its staged successor renders",async()=>{
  const f=fixture(),tx={},abort=new AbortController();f.handoff.expect(tx,cutscene);f.handoff.capture(cutscene);
  const pending=f.handoff.reveal(tx,"choice",abort.signal);assert.deepEqual(f.calls.map(call=>call[0]),["capture"]);
  f.waiters[0]();assert.equal(await pending,true);assert.deepEqual(f.calls.map(call=>call[0]),["capture","release"]);
  assert.equal(f.handoff.pendingFor(tx),false);
});

test("cancellation and late callbacks cannot release another transaction's frame",async()=>{
  const f=fixture(),old={},next={},abort=new AbortController();f.handoff.expect(old,cutscene);f.handoff.capture(cutscene);
  const pending=f.handoff.reveal(old,"choice",abort.signal);abort.abort();f.handoff.cancel(old);
  await assert.rejects(pending,{name:"AbortError"});f.handoff.expect(next,cutscene);f.handoff.capture(cutscene);
  assert.equal(f.handoff.cancel(old),false);assert.equal(f.handoff.pendingFor(next),true);
  assert.equal(f.calls.filter(call=>call[0]==="release").length,1);f.handoff.cancel(next);
  assert.equal(f.calls.filter(call=>call[0]==="release").length,2);
});

test("a failed or mismatched handoff cannot silently reveal gameplay",async()=>{
  const f=fixture(),tx={};f.handoff.expect(tx,cutscene);
  await assert.rejects(f.handoff.reveal(tx,"choice"),/unexpected scene/);
  f.handoff.capture(cutscene);await assert.rejects(f.handoff.reveal(tx,"other"),/unexpected scene/);
  assert.equal(f.handoff.cancel(tx),true);assert.equal(f.handoff.pendingFor(tx),false);
});
