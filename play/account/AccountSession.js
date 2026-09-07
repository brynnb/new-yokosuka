import { AccountConnectionStatus } from "./AccountConnectionStatus.js";
import { setAccountMenuVisible } from "./AccountMenuPresentation.js";
import { updateGameUi } from "../ui/react/gameUiStore.js";

const GUEST_TOKEN_KEY = "new-yokosuka.guest-token.v1";

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      body?.error || `Request failed (${response.status})`,
    );
    error.validationErrors = Array.isArray(body?.errors) ? body.errors : [];
    throw error;
  }
  return body;
}

function getGuestToken(storage = localStorage) {
  let token = storage.getItem(GUEST_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    storage.setItem(GUEST_TOKEN_KEY, token);
  }
  return token;
}

export async function registerAccount(
  email,
  password,
  { storage = localStorage, request = api } = {},
) {
  const guestToken = storage.getItem(GUEST_TOKEN_KEY);
  if (guestToken) {
    await request("/api/auth/guest", {
      method: "POST",
      body: JSON.stringify({ guestToken }),
    });
  }
  const session = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (guestToken) storage.removeItem(GUEST_TOKEN_KEY);
  return session;
}

export async function useGuestAccount(
  currentSession = null,
  { storage = localStorage, request = api } = {},
) {
  if (currentSession?.account?.accountType === "guest") {
    return currentSession;
  }
  return request("/api/auth/guest", {
    method: "POST",
    body: JSON.stringify({ guestToken: getGuestToken(storage) }),
  });
}

export class AccountSession {
  constructor({
    request = api,
    flow = null,
    openSettings = () => {},
    connectionStatus = new AccountConnectionStatus(),
  } = {}) {
    this.request = request;
    this.flow = flow;
    this.openSettings = openSettings;
    this.connectionStatus = connectionStatus;
    this.account = null;
    this.characters = [];
    this.character = null;
    this.inventory = [];
    this.characterSelectionPending = false;
  }

  async start({ previewCutscene = null } = {}) {
    const flow = await this.#accountFlow();
    this.connectionStatus.start((status) => flow.setConnectionStatus(status));
    let authenticationScreen = "entry";
    while (!this.character) {
      const authenticated = await flow.authenticate({
        screen: authenticationScreen,
      });
      authenticationScreen = "entry";
      if (authenticated?.kind === "cutscene-preview") {
        if (typeof previewCutscene !== "function") {
          flow.showCutsceneError("Cutscene previews are unavailable.");
          authenticationScreen = "cutscenes";
          continue;
        }
        document.body?.classList?.remove("account-pending");
        setAccountMenuVisible(false);
        let previewError = null;
        try {
          await previewCutscene(authenticated.cutsceneId);
        } catch (error) {
          previewError = error;
          console.error("[Cutscene preview]", error);
        } finally {
          document.body?.classList?.add("account-pending");
          setAccountMenuVisible(true);
        }
        if (previewError) flow.showCutsceneError(previewError?.message);
        else flow.showCutscenes();
        authenticationScreen = "cutscenes";
        continue;
      }
      flow.showConnecting();
      const characterList = await this.request("/api/characters");
      const session = {
        account: authenticated.account,
        characters: characterList?.characters || [],
      };
      this.#apply(session);
      this.characterSelectionPending = true;
      try {
        this.character = await flow.chooseCharacter(session);
      } finally {
        this.characterSelectionPending = false;
      }
    }
    this.connectionStatus.stop();
    this.#renderPlayerName();
    this.renderProgression(this.character);
    document.body?.classList?.remove("account-pending");
  }

  showSessionReplaced(message) {
    this.flow?.showSessionEnded(message);
  }

  setSettingsOpener(openSettings) {
    this.openSettings = openSettings;
    if (this.flow) this.flow.openSettings = openSettings;
  }

  async logout({ reload = () => location.reload() } = {}) {
    await this.request("/api/auth/logout", { method: "POST" });
    this.account = null;
    this.characters = [];
    this.character = null;
    this.inventory = [];
    if (
      this.characterSelectionPending
      && this.flow?.restartAfterLogout?.()
    ) {
      return;
    }
    reload();
  }

  applyWelcome(character, inventory = []) {
    if (!character) return;
    this.character = { ...this.character, ...character };
    this.inventory = inventory;
    this.renderProgression(character);
  }

  renderProgression(character) {
    if (!character) return;
    updateGameUi({
      playerName: character.name,
      level: character.level ?? 1,
      hp: `HP ${character.currentHp ?? 100} / ${character.maxHp ?? 100}`,
      yen: `$${Number(character.yen || 0).toLocaleString()}`,
    });
  }

  #apply(session) {
    this.account = session.account;
    this.characters = session.characters || [];
  }

  #renderPlayerName() {
    updateGameUi({ playerName: this.character.name });
  }

  async #accountFlow() {
    if (this.flow) return this.flow;
    const [
      { ReactAccountFlow },
      { AccountSounds },
      { SELECTABLE_CHARACTERS },
    ] = await Promise.all([
      import("./ReactAccountFlow.js"),
      import("./AccountSounds.js"),
      import("../config/characters.js"),
    ]);
    this.flow = new ReactAccountFlow({
      request: this.request,
      register: (email, password) => registerAccount(email, password, {
        request: this.request,
      }),
      useGuest: (session) => useGuestAccount(session, {
        request: this.request,
      }),
      logout: () => this.logout(),
      openSettings: (returnFocus) => this.openSettings(returnFocus),
      playableCharacters: SELECTABLE_CHARACTERS,
      sounds: new AccountSounds(),
    });
    return this.flow;
  }
}

export const accountSession = new AccountSession();
