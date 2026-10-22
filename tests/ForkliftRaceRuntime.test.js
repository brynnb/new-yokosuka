import test from "node:test";
import assert from "node:assert/strict";
import {ForkliftRaceRuntime} from "../play/forklift/ForkliftRaceRuntime.js";

test("Story race HUD consumes server gates and cannot write a local victory",()=>{
  const dom=Object.fromEntries(["raceHud","raceStart","raceTiming","raceRestart","raceQuit","raceCountdown","raceState","raceTimer","raceBest"].map(key=>[key,{}]));
  dom.raceCheckpoints={children:[]};
  const locks=[];
  const race=new ForkliftRaceRuntime({dom,getWorldId:()=>"ma00race",getActorPosition:()=>({x:96,z:107}),setMovementLocked:locked=>locks.push(locked)});
  race.marker={setEnabled(){},position:{set(){}}};
  const view={lap:1,laps:3,checkpoint:0,countdownMs:3000,elapsedMs:0};
  race.setObservedRace(view);race.start();race.simulate(100_000);
  assert.equal(race.session.status,"inactive");assert.equal(dom.raceState.textContent,"Lap 1 / 3");assert.equal(locks.at(-1),true);
  assert.equal(dom.raceQuit.hidden,true);assert.equal(dom.raceRestart.hidden,true);
  race.setObservedRace({...view,lap:2,checkpoint:2,countdownMs:0,elapsedMs:71_000});
  assert.equal(dom.raceState.textContent,"Lap 2 / 3");assert.equal(dom.raceTimer.textContent,"01:11.000");assert.equal(locks.at(-1),false);
  race.abort();assert.notEqual(race.observedRace,null);
  race.clearObservedRace();assert.equal(race.observedRace,null);assert.equal(race.session.status,"inactive");assert.equal(dom.raceStart.hidden,false);
});
