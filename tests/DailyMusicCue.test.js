import assert from "node:assert/strict";
import test from "node:test";

import { DailyMusicCue } from "../play/audio/DailyMusicCue.js";

test("daily music cue triggers once when an eligible world crosses 9 PM", () => {
  let triggers = 0;
  const cue = new DailyMusicCue({
    hour: 21,
    excludedWorldIds: ["arcade"],
    onTrigger: () => triggers++,
  });

  assert.equal(cue.update(new Date("1986-06-09T20:59:59Z"), "dobuita"), false);
  assert.equal(cue.update(new Date("1986-06-09T21:00:01Z"), "dobuita"), true);
  assert.equal(cue.update(new Date("1986-06-09T22:00:00Z"), "dobuita"), false);
  assert.equal(triggers, 1);
});

test("daily music cue stays silent when 9 PM is crossed in an excluded world", () => {
  let triggers = 0;
  const cue = new DailyMusicCue({
    hour: 21,
    excludedWorldIds: ["arcade"],
    onTrigger: () => triggers++,
  });

  cue.update(new Date("1986-06-09T20:59:59Z"), "arcade");
  cue.update(new Date("1986-06-09T21:00:01Z"), "arcade");
  cue.update(new Date("1986-06-09T21:05:00Z"), "dobuita");
  assert.equal(cue.isEligible("arcade"), false);
  assert.equal(cue.isEligible("dobuita"), true);
  assert.equal(triggers, 0);
});

test("daily music cue does not catch up when entering after 9 PM", () => {
  let triggers = 0;
  const cue = new DailyMusicCue({
    hour: 21,
    includedWorldIds: ["dobuita"],
    triggerWindowSeconds: 2,
    onTrigger: () => triggers++,
  });

  cue.update(new Date("1986-06-09T20:59:00Z"), "interior");
  cue.update(new Date("1986-06-09T21:15:00Z"), "dobuita");
  assert.equal(triggers, 0);
});

test("daily music cue can trigger again on the following day", () => {
  let triggers = 0;
  const cue = new DailyMusicCue({
    hour: 21,
    onTrigger: () => triggers++,
  });

  cue.update(new Date("1986-06-09T20:59:59Z"), "dobuita");
  cue.update(new Date("1986-06-09T21:00:01Z"), "dobuita");
  cue.update(new Date("1986-06-10T20:59:59Z"), "dobuita");
  cue.update(new Date("1986-06-10T21:00:01Z"), "dobuita");
  assert.equal(triggers, 2);
});
