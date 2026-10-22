import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { expandFamilies } from "../tools/reference/story_event_expansions.mjs";

test("master inventory and conversation appendix are current and internally linked", () => {
  const result = spawnSync(process.execPath, ["tools/reference/generate_story_event_master.mjs", "--check"],
    {encoding: "utf8"});
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

function topicFixture() {
  return {
    inventory: {expansions: {"recurring.telephone": {method: "curated", events: [
      {id: "call", name: "A source-backed call", voices: ["E1032A011"]},
      {id: "alias", name: "An already listed event", aliasOf: "story.call", sources: ["routes"]},
    ]}}},
    events: [{id: "recurring.telephone", kind: "Conversation family"},
      {id: "story.call", kind: "Conversation", sources: ["routes"]}],
    source: {voices: {E1032A011: [{text: "Did anyone call for me?"}]}},
    conversations: [], challenges: [], encounters: [],
  };
}

test("source evidence is required and aliases do not inflate the topic count", () => {
  const fixture = topicFixture();
  assert.deepEqual(expandFamilies(fixture).counts,
    {rows: 2, topics: 1, aliases: 1, cases: 0, calendar: 0});
  delete fixture.source.voices.E1032A011;
  assert.throws(() => expandFamilies(fixture), /missing subtitle evidence/);
  const badAlias = topicFixture();
  badAlias.inventory.expansions["recurring.telephone"].events[1].aliasOf = "invented.event";
  assert.throws(() => expandFamilies(badAlias), /unknown parent event/);
});

test("QTE button segments form one encounter case and cannot be lost or assigned twice", () => {
  const fixture = {
    inventory: {expansions: {"failure.qte": {method: "challenge-cases",
      groups: [["chase", "Chase", ["chase.left", "chase.right"]]]}}},
    events: [{id: "failure.qte", kind: "Outcome family"}], source: {voices: {}},
    conversations: [], encounters: [],
    challenges: [{id: "chase.left"}, {id: "chase.right"}, {id: "work", kind: "delivery"}],
  };
  assert.equal(expandFamilies(fixture).counts.cases, 1);
  fixture.challenges.push({id: "chase.missing"});
  assert.throws(() => expandFamilies(fixture), /unclassified QTE segment/);
  fixture.challenges.pop();
  fixture.inventory.expansions["failure.qte"].groups.push(["duplicate", "Duplicate", ["chase.left"]]);
  assert.throws(() => expandFamilies(fixture), /assigned twice/);
});
