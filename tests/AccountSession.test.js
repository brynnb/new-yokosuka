import assert from "node:assert/strict";
import test from "node:test";

import {
  AccountSession,
  registerAccount,
  useGuestAccount,
} from "../play/account/AccountSession.js";
import { useGameUiStore } from "../play/ui/react/gameUiStore.js";

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("local development reuses an active guest without showing choices", async () => {
  const session = {
    account: { accountType: "guest" },
    characters: [{ id: "guest-character" }],
  };
  let requests = 0;
  assert.equal(await useGuestAccount(session, {
    storage: memoryStorage(),
    request: async () => {
      requests += 1;
    },
  }), session);
  assert.equal(requests, 0);
});

test("local development switches directly to its saved guest", async () => {
  const storage = memoryStorage([
    ["new-yokosuka.guest-token.v1", "local-guest-token"],
  ]);
  const calls = [];
  const guestSession = { account: { accountType: "guest" } };
  assert.equal(await useGuestAccount(
    { account: { accountType: "registered" } },
    {
      storage,
      request: async (path, options) => {
        calls.push([path, JSON.parse(options.body)]);
        return guestSession;
      },
    },
  ), guestSession);
  assert.deepEqual(calls, [[
    "/api/auth/guest",
    { guestToken: "local-guest-token" },
  ]]);
});

test("registration restores and upgrades locally saved guest progress", async () => {
  const storage = memoryStorage([
    ["new-yokosuka.guest-token.v1", "local-guest-token"],
  ]);
  const calls = [];
  const session = { account: { accountType: "registered" } };
  const result = await registerAccount("ryo@example.com", "password123", {
    storage,
    request: async (path, options) => {
      calls.push([path, JSON.parse(options.body)]);
      return path.endsWith("/register") ? session : {};
    },
  });

  assert.equal(result, session);
  assert.deepEqual(calls, [
    ["/api/auth/guest", { guestToken: "local-guest-token" }],
    ["/api/auth/register", {
      email: "ryo@example.com",
      password: "password123",
    }],
  ]);
  assert.equal(storage.getItem("new-yokosuka.guest-token.v1"), null);
});

test("registration creates a fresh account when no local guest exists", async () => {
  const storage = memoryStorage();
  const calls = [];
  await registerAccount("nozomi@example.com", "password123", {
    storage,
    request: async (path, options) => {
      calls.push([path, JSON.parse(options.body)]);
      return {};
    },
  });

  assert.deepEqual(calls, [
    ["/api/auth/register", {
      email: "nozomi@example.com",
      password: "password123",
    }],
  ]);
});

test("failed registration keeps the local guest token", async () => {
  const key = "new-yokosuka.guest-token.v1";
  const storage = memoryStorage([[key, "local-guest-token"]]);

  await assert.rejects(
    registerAccount("ryo@example.com", "password123", {
      storage,
      request: async (path) => {
        if (path.endsWith("/register")) throw new Error("email already exists");
        return {};
      },
    }),
    /email already exists/,
  );
  assert.equal(storage.getItem(key), "local-guest-token");
});

test("authentication is followed by an account-scoped character fetch", async () => {
  const character = {
    id: 7,
    name: "Akira",
    level: 2,
    currentHp: 20,
    maxHp: 20,
    yen: 500,
  };
  const authenticated = {
    account: { accountType: "registered", email: "akira@example.com" },
  };
  const session = { ...authenticated, characters: [character] };
  const calls = [];
  const previousDocument = globalThis.document;
  globalThis.document = {
    body: { classList: { remove() {} } },
  };
  try {
    const flow = {
      setConnectionStatus() {},
      showConnecting() {
        calls.push(["showConnecting"]);
      },
      async authenticate() {
        calls.push(["authenticate"]);
        return authenticated;
      },
      async chooseCharacter(current) {
        calls.push(["chooseCharacter", current]);
        return character;
      },
    };
    const account = new AccountSession({
      request: async (path) => {
        calls.push(["request", path]);
        return { characters: [character] };
      },
      flow,
      connectionStatus: {
        start() {},
        stop() {},
      },
    });

    await account.start();

    assert.deepEqual(calls, [
      ["authenticate"],
      ["showConnecting"],
      ["request", "/api/characters"],
      ["chooseCharacter", session],
    ]);
    assert.equal(account.character, character);
    assert.equal(useGameUiStore.getState().playerName, "Akira");
    assert.equal(useGameUiStore.getState().level, 2);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("logout revokes the account session, clears local state, and reloads", async () => {
  const requests = [];
  let reloads = 0;
  const account = new AccountSession({
    request: async (path, options) => {
      requests.push([path, options]);
    },
  });
  account.account = { id: 1 };
  account.characters = [{ id: 2 }];
  account.character = { id: 2 };
  account.inventory = [{ id: 3 }];

  await account.logout({
    reload: () => {
      reloads += 1;
    },
  });

  assert.deepEqual(requests, [[
    "/api/auth/logout",
    { method: "POST" },
  ]]);
  assert.equal(account.account, null);
  assert.deepEqual(account.characters, []);
  assert.equal(account.character, null);
  assert.deepEqual(account.inventory, []);
  assert.equal(reloads, 1);
});

test("logout during character selection returns to entry without reloading", async () => {
  const requests = [];
  let reloads = 0;
  let restarted = 0;
  const account = new AccountSession({
    request: async (path, options) => {
      requests.push([path, options]);
    },
    flow: {
      restartAfterLogout() {
        restarted += 1;
        return true;
      },
    },
  });
  account.account = { id: 1 };
  account.characters = [{ id: 2 }];
  account.characterSelectionPending = true;

  await account.logout({
    reload: () => {
      reloads += 1;
    },
  });

  assert.deepEqual(requests, [[
    "/api/auth/logout",
    { method: "POST" },
  ]]);
  assert.equal(restarted, 1);
  assert.equal(reloads, 0);
  assert.equal(account.account, null);
  assert.deepEqual(account.characters, []);
});

test("cutscene previews return to the selector before authentication resumes", async () => {
  const previousDocument = globalThis.document;
  const bodyClasses = new Set(["account-pending"]);
  globalThis.document = {
    body: {
      classList: {
        add: value => bodyClasses.add(value),
        remove: value => bodyClasses.delete(value),
        toggle: (value, active) => (
          active ? bodyClasses.add(value) : bodyClasses.delete(value)
        ),
      },
    },
  };
  let authenticationCount = 0;
  let resumeAuthentication;
  const screens = [];
  const previewed = [];
  const character = { id: 1, name: "Akira", avatarId: "ryo" };
  const flow = {
    setConnectionStatus() {},
    authenticate({ screen }) {
      screens.push(["authenticate", screen]);
      authenticationCount += 1;
      if (authenticationCount <= 2) {
        return Promise.resolve({
          kind: "cutscene-preview",
          cutsceneId: authenticationCount === 1 ? "S1-000" : "S1-001",
        });
      }
      return new Promise((resolve) => {
        resumeAuthentication = resolve;
      });
    },
    showCutscenes() {
      screens.push(["showCutscenes"]);
    },
    showCutsceneError(message) {
      assert.fail(message);
    },
    showConnecting() {},
    chooseCharacter: async () => character,
  };
  const account = new AccountSession({
    request: async () => ({ characters: [character] }),
    flow,
    connectionStatus: { start() {}, stop() {} },
  });

  try {
    const started = account.start({
      previewCutscene: async (cutsceneId) => {
        previewed.push(cutsceneId);
      },
    });
    while (!resumeAuthentication) await new Promise(setImmediate);

    assert.deepEqual(previewed, ["S1-000", "S1-001"]);
    assert.deepEqual(screens, [
      ["authenticate", "entry"],
      ["showCutscenes"],
      ["authenticate", "cutscenes"],
      ["showCutscenes"],
      ["authenticate", "cutscenes"],
    ]);
    assert.equal(bodyClasses.has("account-pending"), true);

    resumeAuthentication({ account: { id: 7 } });
    await started;
    assert.equal(account.character, character);
  } finally {
    globalThis.document = previousDocument;
  }
});
