import assert from "node:assert/strict";
import test from "node:test";

import { AccountSounds } from "../play/account/AccountSounds.js";

test("account menu sounds use the audited native effect assignments", () => {
  const played = [];
  const sounds = new AccountSounds({
    audioFactory: (source) => ({
      set volume(value) {
        played.push({ source, volume: value });
      },
      play() {
        return Promise.resolve();
      },
    }),
  });

  sounds.move();
  sounds.blocked();
  sounds.confirm();
  sounds.changeValue();
  sounds.changeValueQuiet();
  sounds.changeCharacter();
  sounds.success();

  assert.deepEqual(played, [
    {
      source: "/audio/menu/selectchange.ogg",
      volume: 0.175,
    },
    {
      source: "/audio/menu/blocked.ogg",
      volume: 0.175,
    },
    {
      source: "/audio/menu/select.ogg",
      volume: 0.175,
    },
    {
      source: "/audio/menu/changevalue.ogg",
      volume: 0.175,
    },
    {
      source: "/audio/menu/changevaluequiet.ogg",
      volume: 0.175,
    },
    {
      source: "/audio/menu/changevaluequiet.ogg",
      volume: 0.175,
    },
    {
      source: "/audio/menu/success.ogg",
      volume: 0.175,
    },
  ]);
});

test("menu sounds follow effects volume and both mute preferences", () => {
  const played = [];
  let state = {
    overallVolume: 0.5,
    effectsVolume: 0.5,
    effectsMuted: false,
    masterMuted: false,
  };
  const sounds = new AccountSounds({
    preferences: { getState: () => state },
    audioFactory: () => ({
      set volume(value) {
        played.push(value);
      },
      play: () => Promise.resolve(),
    }),
  });

  sounds.confirm();
  state = {
    overallVolume: 1,
    effectsVolume: 0.8,
    effectsMuted: true,
    masterMuted: false,
  };
  sounds.confirm();
  state = {
    overallVolume: 1,
    effectsVolume: 0.8,
    effectsMuted: false,
    masterMuted: true,
  };
  sounds.confirm();
  assert.deepEqual(played, [0.0875]);
});
