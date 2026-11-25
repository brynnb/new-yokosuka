import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import test from "node:test";
import {closingCreditsFrame, closingCreditsEndTick} from "../play/scripts/ClosingCreditsPlayback.js";
import {NativeScriptActivityRunner} from "../play/scripts/NativeScriptActivityRunner.js";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => JSON.parse(fs.readFileSync(file));
const manifest = read("play/assets/ending/closing-credits/manifest.json");

test("all 61 original closing credit pages, the separate final card and the full score are registered", () => {
  const assets = read("src/runtime-assets.generated.json").assets;
  let next = 1;
  for (const sheet of manifest.sheets) {
    assert.equal(sheet.firstPage, next);
    assert.equal(sheet.height, sheet.pageCount * 512);
    next += sheet.pageCount;
  }
  assert.equal(next - 1, 61);
  assert.equal(manifest.logo.height, 64);
  for (const asset of [manifest.logo, ...manifest.sheets]) {
    const png = fs.readFileSync(asset.path);
    assert.equal(png.readUInt32BE(16), 512);
    assert.equal(png.readUInt32BE(20), asset.height);
    assert.equal(digest(png), asset.sha256);
    assert.equal(assets[asset.path].sha256, asset.sha256);
  }
  const score = read("public/music/manifest.json").tracks[manifest.music.trackId];
  assert.equal(score.loop, false);
  assert.ok(score.durationSeconds >= closingCreditsEndTick / 30);
  assert.equal(score.source.file, "RIM004.SND");
  assert.equal(digest(fs.readFileSync(manifest.music.asset)), assets[manifest.music.asset].sha256);
});

test("original page spacing and end state survive slow frames or a jump in the timeline", () => {
  assert.deepEqual(closingCreditsFrame(0), {phase:"intro",pages:[],opacity:0});
  assert.deepEqual(closingCreditsFrame(90).pages, [{n:1,y:480}]);
  assert.deepEqual(closingCreditsFrame(346).pages, [{n:1,y:-32},{n:2,y:480}]);
  const seen = new Set();
  for (let tick=0; tick < closingCreditsEndTick; tick+=13) {
    const {pages} = closingCreditsFrame(tick);
    for (const page of pages) seen.add(page.n);
    assert.ok(pages.length <= 2);
    if (pages.length === 2) assert.equal(pages[1].y-pages[0].y, 512);
  }
  assert.equal(seen.size,61);
  assert.deepEqual(closingCreditsFrame(15690).pages, [{n:61,y:0}]);
  assert.equal(closingCreditsFrame(15888).phase, "logo");
  assert.equal(closingCreditsFrame(16010).phase, "outro");
  assert.equal(closingCreditsEndTick,16040);
});

test("earned ship activity restores controls on cancellation, retry, completion and presentation failure", async () => {
  let accept, fail;
  let restores = 0;
  const runner = new NativeScriptActivityRunner({
    getArea:() => "MEND", nativeRuntime:{startObjectInteraction(){},onSettled(){},cancel(){}},
    captureClientState:()=>({stage:1}), restoreClientState:s=>{assert.equal(s.stage,1);restores++;},
    capturePlayerState:()=>({world:"s1-voyage"}), restorePlayerState:s=>assert.equal(s.world,"s1-voyage"),
    createClosingCredits:()=>({finished:new Promise((resolve,reject)=>{accept=resolve;fail=reject;}),stop:b=>{accept(b);return true;}}),
  });
  const activity = {kind:"closing-credits",area:"MEND",returnPlayerState:true};
  const context = {area:"MEND"};
  const first = runner.start(activity,context);
  assert.equal(runner.cancel(),true);
  assert.equal(await first,false);
  const second = runner.start(activity,context);
  accept(true);
  assert.equal(await second,true);
  const third = runner.start(activity,context);
  fail(Error("credits asset unavailable"));
  await assert.rejects(third,/credits asset unavailable/);
  assert.equal(restores,3);
  assert.equal(runner.active,null);
  assert.equal(runner.cancel(),false);
});
