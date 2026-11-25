import {expect} from "@playwright/test";
import {observeOriginalDialogue} from "./original-dialogue-observer.js";

const prefix = "s1.mfsy.hisaka-lunch.";
const lines = [
  ["delivery","E1061A001","Excuse me. Hokuhoku Lunches."],
  ["delivery","E1061B001","Ah...you."],
  ["delivery","E1061A002","I have a delivery... Twelve lunches."],
  ["delivery","E1061B002","Uh...yeah. Just put them there."],
  ["delivery","E1061A003","OK."],
  ["overhear","E1061C001","You're on duty in the New Warehouse District from 8 p.m. too?"],
  ["overhear","E1061D001","Yeah."],
  ["overhear","E1061C002","Man, guess we'll be short-handed here again."],
  ["overhear","E1061C003","As if night shift isn't busy enough."],
  ["leave","E1061B003","Hey. You're still here? If you're done, go on, get out."],
  ["leave","E1061A004","Yes..."],
  ["leave","E1061A005","Between 8 and 9 p.m., that's my chance."],
  ["return","E1061A006","Hisaka-san, I'm done."],
  ["return","E1061E001","Have any trouble finding it?"],
  ["return","E1061A007","Not really."],
  ["return","E1061E002","You've been a big help."],
  ["return","E1061E003","Thank you, Ryo."],
  ["return","E1061A008","Anytime."],
];

export function observeLunch(page) {
  return observeOriginalDialogue(page, lines.map(row => row[1]), prefix);
}

export async function waitForLunchLine(page, count) {
  await page.waitForFunction(count => window.originalDialogue?.lines.length >= count
    || window.storyProbe.sceneErrors.length, count, {timeout:120000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
}

export async function verifyLunchDelivery(page, testInfo) {
  await waitForLunchLine(page, lines.length);
  const result = await page.evaluate(() => window.stopOriginalDialogue());
  expect(result.lines.map(({id,text,stage}) => [stage?.slice(prefix.length),id,text])).toEqual(lines);
  expect(result.lines.every(line => Boolean(line.speaker))).toBe(true);
  expect(result.stages.map(stage=>stage.name.slice(prefix.length)))
    .toEqual(["approach","delivery","handover","overhear","leave","return"]);
  const stages = Object.fromEntries(result.stages.map(stage=>[stage.name.slice(prefix.length),stage]));
  expect(stages.delivery.actors).toEqual(expect.arrayContaining(["AKIR","KEBA"]));
  expect(stages.delivery.hands).toEqual(expect.arrayContaining([["BNT1","AKIR",18],["BNT2","AKIR",12]]));
  expect(stages.overhear.actors).toEqual(expect.arrayContaining(["AKIR","KEBA","KEBC","KEBD"]));
  expect(stages.overhear.objects).toEqual(expect.arrayContaining(["BNT1","BNT2"]));
  expect(result.handovers.map(item=>item.signature)).toEqual(["BNT1,BNT2|","BNT2|BNT1","|BNT1,BNT2"]);
  expect(result.handovers[1].frame).toBeGreaterThanOrEqual(155);
  expect(result.handovers[1].frame).toBeLessThan(236);
  expect(result.handovers[2].frame).toBeGreaterThanOrEqual(236);
  expect(result.sounds.map(sound=>[sound.stage,sound.asset])).toEqual([
    [prefix+"handover","BENTOTABLE.wav"],[prefix+"handover","BENTOTABLE.wav"],
  ]);
  expect(stages.return.actors).toEqual(expect.arrayContaining(["AKIR","HISA"]));
  await testInfo.attach("original-harbor-lunch-delivery", {body:JSON.stringify(result), contentType:"application/json"});
}
