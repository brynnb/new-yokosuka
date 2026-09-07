import assert from "node:assert/strict";
import test from "node:test";

import {
  mostRecentlyPlayedCharacter,
  ReactAccountFlow,
} from "../play/account/ReactAccountFlow.js";
import {
  resetAccountStore,
  useAccountStore,
} from "../play/account/react/accountStore.js";

function controller(overrides = {}) {
  resetAccountStore();
  return new ReactAccountFlow({
    request: async () => ({}),
    register: async () => ({}),
    useGuest: async () => ({}),
    logout: async () => {},
    playableCharacters: [{ id: "ryo", label: "Ryo" }],
    storage: {
      getItem: () => "3",
      setItem: () => {},
    },
    ...overrides,
  });
}

test("selecting a character updates selection without remounting the screen", async () => {
  const flow = controller();
  const characters = [
    { id: 1, name: "Akira", avatarId: "ryo" },
    { id: 2, name: "Nozomi", avatarId: "ryo" },
  ];
  const selection = flow.chooseCharacter({ characters });

  flow.selectCharacter(characters[1]);

  assert.equal(useAccountStore.getState().screen, "characterSelect");
  assert.equal(useAccountStore.getState().selectedCharacter, characters[1]);
  flow.enterWorld();
  assert.equal(await selection, characters[1]);
});

test("character selection defaults to the most recently played slot", () => {
  const characters = [
    {
      id: 1,
      name: "First slot",
      lastLoginAt: "2026-07-29T12:00:00Z",
    },
    { id: 2, name: "Never played" },
    {
      id: 3,
      name: "Last played",
      lastLoginAt: "2026-07-31T12:00:00Z",
    },
  ];
  assert.equal(mostRecentlyPlayedCharacter(characters), characters[2]);

  const flow = controller();
  void flow.chooseCharacter({ characters });
  assert.equal(
    useAccountStore.getState().selectedCharacter,
    characters[2],
  );
});

test("account authentication resolves before character selection begins", async () => {
  const flow = controller({
    useGuest: async () => ({ account: { id: 7 } }),
  });
  const authentication = flow.authenticate();

  await flow.quickPlay();

  assert.deepEqual(await authentication, { account: { id: 7 } });
  assert.equal(useAccountStore.getState().screen, "connecting");
});

test("logging out cancels character selection and returns to entry", async () => {
  const flow = new ReactAccountFlow({
    request: async () => {},
    register: async () => {},
    useGuest: async () => {},
    logout: async () => {},
    playableCharacters: [],
    storage: null,
  });
  const selection = flow.chooseCharacter({
    characters: [{ id: 1, name: "Akira" }],
  });

  assert.equal(flow.restartAfterLogout(), true);
  assert.equal(await selection, null);
  assert.equal(useAccountStore.getState().screen, "entry");
  assert.deepEqual(useAccountStore.getState().characters, []);
});

test("cutscene selection resolves an in-memory preview intent", async () => {
  const flow = controller();
  const authentication = flow.authenticate({ screen: "cutscenes" });
  assert.equal(useAccountStore.getState().screen, "cutscenes");
  assert.equal(flow.playCutscene("S1-000"), true);
  assert.deepEqual(await authentication, {
    kind: "cutscene-preview",
    cutsceneId: "S1-000",
  });
  assert.equal(useAccountStore.getState().screen, "closed");
});

test("leaving the cutscene selector returns directly to account entry", () => {
  const flow = controller();

  flow.showEntry();

  assert.equal(useAccountStore.getState().screen, "entry");
});
