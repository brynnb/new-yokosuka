import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import {AuthoredSceneStagingRuntime} from "../play/scripts/AuthoredSceneStagingRuntime.js";
import {NativeAseqSceneObjectRuntime} from "../play/events/NativeAseqSceneObjectRuntime.js";
import {NativeAseqAttachedObjectRuntime} from "../play/events/NativeAseqAttachedObjectRuntime.js";
import {readFileSync} from "node:fs";
import {evaluateAuthActor} from "../src/AuthMovement.js";

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const scenes=read("../play/data/authored-story-scenes.json").scenes;
const stage=name=>scenes.find(scene=>scene.id==="s1.mfsy.old-district-"+name);
const pose=(scene,t)=>evaluateAuthActor(scene.sceneObjectTracks.KAIS,t);
const end=scene=>pose(scene,scene.durationSeconds);

test("the harbor flashlight stays on its mark until release and follows one KCDT track through the decision",()=>{
  const bump=stage("head-bump"),prompt=stage("prompt"),reach=stage("reach"),miss=stage("miss");
  assert.equal(bump.actors[0].motionStartSeconds,133/30);
  assert.deepEqual(pose(bump,0),pose(bump,(380-133)/30));
  assert.deepEqual(end(bump),pose(prompt,0));
  assert.deepEqual(end(prompt),pose(reach,0));
  assert.deepEqual(end(prompt),pose(miss,0));
  assert.equal(prompt.waitForMotionCompletion,false);
  assert.equal(prompt.playThroughFinish,true);
  const qte=read("../play/data/story-challenges.json").challenges.find(c=>c.id==="s1.mfsy.old-district-flashlight");
  assert.deepEqual(qte.buttons,["Right"]);
  assert.equal(qte.windowMs,1000*prompt.durationSeconds);
  assert.equal(prompt.durationSeconds,1);
  assert.equal(reach.durationSeconds,14/30);
  assert.ok(Math.abs(end(prompt).rotationX-end(bump).rotationX)>100);
  assert.ok(Math.abs(end(miss).y-0.02688037)<0.00001);
  assert.ok(Math.abs(end(reach).x+116.16)<0.00001);
  assert.ok(Math.abs(end(reach).z+11.869)<0.00001);
});

test("right transfers the actual light to control 18; a miss uses the other two original motions",()=>{
  const reach=stage("reach"),caught=stage("catch"),miss=stage("miss");
  assert.equal(reach.actors[0].motionStartSeconds,66/30);
  assert.ok(Math.abs(caught.actors[0].motionStartSeconds-reach.actors[0].motionStartSeconds-reach.durationSeconds)<1e-10);
  assert.equal(caught.sceneObjectTracks,undefined);
  const light=caught.attachedObjects.KAIS;
  assert.equal(light.sceneObject,true);
  assert.equal(light.browserFilename,reach.sceneObjects.KAIS.browserFilename);
  assert.deepEqual(light.attachments[0],{
    activityId:caught.id,frame:0,parentActorTag:"AKIR",controlId:18,
    translation:[Math.fround(.17),Math.fround(.14),Math.fround(.03)],rotationRaw:[0x3236,0xb114,0x3360],
  });
  assert.equal(light.presentation[0].visible,true);
  assert.equal(caught.actors[0].motionCues[0].motion.name,"AKI_SEIKOUNIGE1_0153");
  assert.deepEqual(miss.attachedObjects,caught.attachedObjects);
  assert.equal(miss.actors[0].motion.name,"AKI_TENOBASISIPPAI1_0153");
  assert.equal(miss.actors[0].motionStartSeconds,60/30);
  const escape=miss.actors[0].motionCues[0];
  assert.equal(escape.motion.name,"AKI_SIPPAINIGERU1_0153");
  assert.equal(escape.atSeconds,2);
  assert.equal(escape.startSeconds,40/30);
  assert.equal(escape.playbackRate,.8);
});

test("the flashlight keeps one camera and KAIS through delayed commands, both retry choices and cancellation",async t=>{
  for(const exit of ["catch","leave","cancel"]) await t.test(exit,async t=>{
    const engine=new BABYLON.NullEngine(),world=new BABYLON.Scene(engine);
    t.after(()=>engine.dispose());
    const player=new BABYLON.TransformNode("AKIR",world),instances=[],leases=[];
    const model={renderRoot:player,latestControllerFamily:{nodes:[{index:0,type:18}]},
      latestControllerMatrices:[Array.from(BABYLON.Matrix.Identity().asArray())]};
    const runtime=new AuthoredSceneStagingRuntime({
      worldSounds:{playAsset:()=>true},
      dialogueAudio:{playOneShot:()=>({}),stopOneShot:()=>{}},
      actors:{prepare:async()=>{},begin:()=>leases.push("actor begin"),end:()=>leases.push("actor end"),
        applyTransform:()=>true,activeActor:()=>({root:player,model})},
      camera:{begin:()=>leases.push("camera begin"),apply:()=>true,end:()=>leases.push("camera end")},
      motionRuntime:{loadNamedSelections:async()=>{},applyNamed:()=>true},
      capturePlayerState:()=>({position:[4,5,6]}),restorePlayerState:snapshot=>{
        assert.deepEqual(snapshot.position,[4,5,6]);leases.push("restore");return true;
      },
      createSceneObjects:definitions=>new NativeAseqSceneObjectRuntime({definitions,instantiateAsset:async()=>{
        const mesh=BABYLON.MeshBuilder.CreateBox("KAIS",{},world);
        mesh._filename="KAIS500G.CHRM";instances.push(mesh);return [mesh];
      }}),
      createAttachedObjects:(definitions,resolveActor,signal,resolveSceneObject)=>new NativeAseqAttachedObjectRuntime({
        definitions,resolveActor,resolveSceneObject,instantiateAsset:()=>assert.fail("loaded a second flashlight"),
      }),
    });
    const tx={area:"MFSY"},challenge="s1.mfsy.old-district-flashlight";
    const play=(name,op)=>runtime.play({scene:stage(name),kind:"scene-staging-"+op},tx);
    const fullStage=async(name,op="transition")=>{
      const started=play(name,op);
      await new Promise(resolve=>setImmediate(resolve));
      runtime.update(tx,stage(name).durationSeconds+1);
      assert.equal(await started,true);
      assert.equal(await play(name,"finish"),true);
    };
    const tick=dt=>assert.equal(runtime.update(tx,dt),true);
    const stable=()=>{
      const point=instances[0].position.clone(),elapsed=runtime.active.elapsed;
      tick(2.4);
      assert.deepEqual(instances[0].position.asArray(),point.asArray());
      assert.equal(runtime.active.elapsed,elapsed);
      assert.equal(instances[0].isEnabled(),true);
      assert.deepEqual(leases,["actor begin","camera begin"]);
    };
    await fullStage("head-bump","start");
    const owner=runtime.active,first=instances[0].position.asArray();
    stable();
    let now=0;
    const openPrompt=async()=>{
      assert.equal(await play("prompt","transition"),true);
      assert.equal(runtime.active,owner);
      assert.deepEqual(instances[0].position.asArray(),first);
      assert.equal(runtime.startChallengeClock("other",()=>9),false);
      stable(); // The server has not acknowledged challenge_ready.
      const opened=now;
      assert.equal(runtime.startChallengeClock(challenge,()=>(now-opened)/1000),true);
      assert.equal(runtime.startChallengeClock(challenge,()=>18),false);
    };
    await openPrompt();
    if(exit==="cancel"){
      now+=103;tick(.01);
      const finish=play("prompt","finish");
      assert.equal(runtime.cancel(tx),true);
      await assert.rejects(finish,{name:"AbortError"});
    }else{
      now+=1700;tick(.01); // Delayed timeout response, capped at the deadline.
      assert.equal(await play("prompt","finish"),true);
      stable();
      await fullStage("miss");
      stable();
      if(exit==="leave"){
        assert.equal(runtime.commitPlayerPose(tx),true);
      }else{
        assert.equal(runtime.active,owner);
        await openPrompt(); // New attempt restarts the original throw mark.
        let finished=false;
        const wait=play("prompt","finish").then(accepted=>{finished=true;return accepted;});
        now+=135;tick(.95);
        await Promise.resolve();
        assert.equal(finished,false);
        assert.equal(runtime.active.elapsed,.135);
        now+=865;tick(.005);
        assert.equal(await wait,true);stable();
        await fullStage("reach");stable();
        const arriving=play("catch","transition");
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(runtime.active,owner);
        assert.equal(owner.objects.objects.get("KAIS").root,owner.sceneObjects.objects.get("KAIS").root);
        assert.equal(instances[0].isEnabled(),true);
        const startX=instances[0].position.x;
        player.position.x+=3;tick(.05);
        assert.ok(Math.abs(instances[0].position.x-startX-3)<.00001);
        tick(stage("catch").durationSeconds);
        assert.equal(await arriving,true);assert.equal(await play("catch","finish"),true);
      }
    }
    assert.equal(runtime.active,null);
    assert.equal(instances.length,1);
    assert.equal(instances[0].isDisposed(),true);
    assert.deepEqual(leases,["actor begin","camera begin","camera end","actor end","restore"]);
  });
});

test("the MKSG actor and flashlight dispatch their five slot-four effects at the source frames", () => {
  const frames = name => (stage(name).soundCues || []).map(cue => {
    assert.equal(cue.kind, "effect");
    assert.ok(cue.asset.startsWith("public/audio/world/e1kaiqte/"));
    return [cue.asset.split("/").at(-1), Math.round(cue.atSeconds * 30)];
  });
  assert.deepEqual(frames("head-bump"), [["A9040100.wav", 227], ["A9040200.wav", 247]]);
  assert.deepEqual(frames("prompt"), []);
  assert.deepEqual(frames("reach"), []);
  assert.deepEqual(frames("catch"), [["A9040400.wav", 0], ["A9040500.wav", 12]]);
  assert.deepEqual(frames("miss"), [["A9040300.wav", 15]]);
});
