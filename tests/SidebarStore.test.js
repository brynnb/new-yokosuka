import assert from "node:assert/strict";
import test from "node:test";

import {
  configureSidebarMenus,
  DEFAULT_APPEARANCE_VALUE,
  focusGameAfterSidebarSelect,
  selectSidebarCharacter,
  selectSidebarCutscene,
  selectSidebarEmote,
  selectSidebarTravel,
  setSidebarPickerOpen,
  useSidebarStore,
} from "../play/ui/react/sidebarStore.js";

test("Radix sidebar selections route through the game callbacks", async () => {
  const calls = [];
  configureSidebarMenus({
    emotes: [{ id: "wave", label: "Wave" }],
    characters: [{ id: "ryo", label: "Ryo" }],
    activeCharacterId: "ryo",
    defaultCharacterId: "ryo",
    onTravel: (worldId) => calls.push(["travel", worldId]),
    onCutscene: (cutsceneId) => calls.push(["cutscene", cutsceneId]),
    onEmote: (emote) => calls.push(["emote", emote.id]),
    onCharacter: (character) => calls.push(["character", character.id]),
    onSelectionCommitted: () => calls.push(["focus"]),
  });
  useSidebarStore.setState({ animationDisabled: false });

  setSidebarPickerOpen("travel", true);
  assert.equal(useSidebarStore.getState().openPicker, "travel");
  selectSidebarTravel("dobuita");
  selectSidebarCutscene("S1-000");
  selectSidebarEmote("wave");
  selectSidebarCharacter("ryo");
  let prevented = false;
  focusGameAfterSidebarSelect({
    preventDefault: () => {
      prevented = true;
    },
  });

  assert.equal(useSidebarStore.getState().openPicker, null);
  assert.equal(prevented, true);
  assert.deepEqual(calls, [
    ["travel", "dobuita"],
    ["cutscene", "S1-000"],
    ["emote", "wave"],
      ["character", "ryo"],
      ["focus"],
  ]);
});

test("disabled animation selection cannot dispatch an emote", () => {
  const emotes = [];
  configureSidebarMenus({
    emotes: [{ id: "wave", label: "Wave" }],
    characters: [],
    activeCharacterId: null,
    defaultCharacterId: null,
    onTravel() {},
    onEmote: (emote) => emotes.push(emote.id),
    onCharacter() {},
    onSelectionCommitted() {},
  });
  useSidebarStore.setState({
    animationDisabled: true,
    animationDisabledReason: "Emotes are unavailable for animal avatars",
  });

  selectSidebarEmote("wave");

  assert.deepEqual(emotes, []);
});

test("Default restores the avatar chosen during character creation", () => {
  const appearances = [];
  configureSidebarMenus({
    emotes: [],
    characters: [
      { id: "s1-hos-l", label: "Creation avatar" },
      { id: "ine", label: "Ine" },
    ],
    activeCharacterId: "ine",
    defaultCharacterId: "s1-hos-l",
    onTravel() {},
    onEmote() {},
    onCharacter: (character) => appearances.push(character.id),
    onSelectionCommitted() {},
  });

  selectSidebarCharacter(DEFAULT_APPEARANCE_VALUE);

  assert.deepEqual(appearances, ["s1-hos-l"]);
});

test("one travel-menu opening commits only one destination", () => {
  const destinations = [];
  let focusCount = 0;
  configureSidebarMenus({
    emotes: [],
    characters: [],
    activeCharacterId: null,
    defaultCharacterId: null,
    onTravel: (worldId) => destinations.push(worldId),
    onEmote() {},
    onCharacter() {},
    onSelectionCommitted: () => {
      focusCount += 1;
    },
  });

  setSidebarPickerOpen("travel", true);
  assert.equal(selectSidebarTravel("ma00"), true);
  assert.equal(selectSidebarTravel("dobuita"), false);

  assert.deepEqual(destinations, ["ma00"]);
  assert.equal(focusCount, 0);

  setSidebarPickerOpen("travel", true);
  assert.equal(selectSidebarTravel("dobuita"), true);
  assert.deepEqual(destinations, ["ma00", "dobuita"]);
  assert.equal(focusCount, 0);
});
