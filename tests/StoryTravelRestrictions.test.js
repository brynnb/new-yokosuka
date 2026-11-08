import assert from "node:assert/strict";
import test from "node:test";
import {storyTravelRestriction} from "../play/world/StoryTravelRestrictions.js";
import {MAP_TRANSITIONS} from "../src/MapTransitions.js";
import runtimeAssets from "../src/runtime-assets.generated.json" with {type:"json"};
import travelRules from "../play/data/story-travel-restrictions.json" with {type:"json"};

test("the residence gate reminds an eligible Story player until the first dojo visit", () => {
  const transition = MAP_TRANSITIONS.find(item => item.id === "jhd0-gate-to-ju00-entry-1");
  assert.ok(transition, "the rule names an actual gate");
  const character = {playMode:"story", openingCompleted:true,
    storyFlags:{"story.s1.first-allowance.completed":true}};
  assert.deepEqual(storyTravelRestriction(transition, character), {
    reason:"story_requirement", message:"I should go and talk to Fuku-san.",
    voiceAsset:"public/audio/world/story-travel/SA1082A005.wav",
  });
  character.storyFlags["story.s1.first-dojo.completed"] = true;
  assert.equal(storyTravelRestriction(transition, character), null);
});

test("every Story travel voice is registered as a versioned runtime asset", () => {
  for (const rule of travelRules.restrictions.filter(entry=>entry.voice)) {
    assert.match(runtimeAssets.assets[rule.voice.asset]?.sha256 || "", /^[0-9a-f]{64}$/, rule.voice.id);
    assert.ok(runtimeAssets.assets[rule.voice.asset].size > 0);
  }
});

test("Free roam, incomplete or older saves, and other doors are not restricted", () => {
  const gate = {id:"jhd0-gate-to-ju00-entry-1"};
  const flags = {"story.s1.first-allowance.completed":true};
  for (const character of [null, {playMode:"free", openingCompleted:true, storyFlags:flags},
    {playMode:"story", openingCompleted:false, storyFlags:flags},
    {playMode:"story", openingCompleted:true},
    {playMode:"story", openingCompleted:true, storyFlags:{}}]) {
    assert.equal(storyTravelRestriction(gate, character), null);
  }
  assert.equal(storyTravelRestriction({id:"jhd0-house-door-to-jomo-entry-0"},
    {playMode:"story", openingCompleted:true, storyFlags:flags}), null);
  assert.equal(storyTravelRestriction(gate, {playMode:"story", openingCompleted:true,
    storyFlags:{...flags,"notebook.s1.black-car":true}}), null, "later progress supersedes the original gate");
});
