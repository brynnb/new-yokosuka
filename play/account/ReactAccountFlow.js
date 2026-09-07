import {
  MAX_CHARACTER_SLOTS,
  normalizeCharacterNameCapitalization,
  quickPlayConfirmationCount,
  recordQuickPlayConfirmation,
} from "./AccountRules.js";
import {
  resetAccountStore,
  useAccountStore,
} from "./react/accountStore.js";
import { availableCutscene } from "../config/cutscenes.js";

export function mostRecentlyPlayedCharacter(characters = []) {
  const playedAt = (character) => {
    const parsed = character?.lastLoginAt
      ? Date.parse(character.lastLoginAt)
      : Number.NaN;
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  };
  let selected = characters[0] || null;
  let selectedTime = playedAt(selected);
  for (const character of characters.slice(1)) {
    const candidateTime = playedAt(character);
    if (candidateTime > selectedTime) {
      selected = character;
      selectedTime = candidateTime;
    }
  }
  return selected;
}

export class ReactAccountFlow {
  constructor({
    request,
    register,
    useGuest,
    logout,
    openSettings = () => {},
    playableCharacters,
    sounds = null,
    storage = globalThis.localStorage,
  }) {
    this.request = request;
    this.register = register;
    this.useGuest = useGuest;
    this.logout = logout;
    this.openSettings = openSettings;
    this.playableCharacters = playableCharacters;
    this.sounds = sounds;
    this.storage = storage;
    this.authenticationResolve = null;
    this.characterResolve = null;
    useAccountStore.setState({ controller: this });
  }

  setConnectionStatus(status) {
    useAccountStore.setState({ connectionStatus: status });
  }

  authenticate({ screen = "entry" } = {}) {
    useAccountStore.setState({
      screen,
      error: "",
    });
    return new Promise((resolve) => {
      this.authenticationResolve = resolve;
    });
  }

  showConnecting(copy = "Retrieving your characters from the server.") {
    useAccountStore.setState({ screen: "connecting", connectingCopy: copy });
  }

  chooseCharacter(session) {
    const characters = [...(session.characters || [])];
    useAccountStore.setState({
      screen: "characterSelect",
      characters,
      selectedCharacter: mostRecentlyPlayedCharacter(characters),
      error: "",
    });
    return new Promise((resolve) => {
      this.characterResolve = resolve;
    });
  }

  showSessionEnded(message) {
    useAccountStore.setState({
      screen: "sessionEnded",
      sessionEndedMessage: message
        || "This character was opened in another browser or tab. Only one connection can control a character at a time.",
    });
  }

  showEntry() {
    useAccountStore.setState({ screen: "entry", error: "" });
  }

  showCutscenes() {
    useAccountStore.setState({ screen: "cutscenes", error: "" });
  }

  playCutscene(cutsceneId) {
    const cutscene = availableCutscene(cutsceneId);
    if (!cutscene || !this.authenticationResolve) {
      useAccountStore.setState({
        screen: "cutscenes",
        error: cutscene
          ? "The cutscene preview is not ready."
          : "That cutscene is not available.",
      });
      return false;
    }
    const resolve = this.authenticationResolve;
    this.authenticationResolve = null;
    this.showClosed();
    resolve({ kind: "cutscene-preview", cutsceneId: cutscene.id });
    return true;
  }

  showCutsceneError(message) {
    useAccountStore.setState({
      screen: "cutscenes",
      error: message || "The cutscene could not be played.",
    });
  }

  showClosed() {
    useAccountStore.setState({ screen: "closed", error: "" });
  }

  restartAfterLogout() {
    const resolve = this.characterResolve;
    this.characterResolve = null;
    resetAccountStore();
    if (!resolve) return false;
    resolve(null);
    return true;
  }

  showCredentials(mode) {
    useAccountStore.setState({
      screen: "credentials",
      credentialMode: mode,
      error: "",
    });
  }

  async submitCredentials(email, password) {
    const mode = useAccountStore.getState().credentialMode;
    this.showConnecting(
      mode === "login"
        ? "Signing in to your account."
        : "Creating your account.",
    );
    try {
      const session = mode === "login"
        ? await this.request("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        })
        : await this.register(email, password);
      this.#finishAuthentication(session);
    } catch (error) {
      useAccountStore.setState({
        screen: "credentials",
        error: error.message,
      });
    }
  }

  async quickPlay({ confirmed = false } = {}) {
    if (!confirmed && quickPlayConfirmationCount(this.storage) < 3) {
      useAccountStore.setState({ screen: "guestWarning", error: "" });
      return;
    }
    if (confirmed) recordQuickPlayConfirmation(this.storage);
    this.showConnecting("Opening your guest account.");
    try {
      this.#finishAuthentication(await this.useGuest(null));
    } catch (error) {
      useAccountStore.setState({ screen: "entry", error: error.message });
    }
  }

  selectCharacter(character) {
    useAccountStore.setState({ selectedCharacter: character });
    this.sounds?.changeCharacter();
  }

  enterWorld() {
    const selected = useAccountStore.getState().selectedCharacter;
    if (!selected || !this.characterResolve) return;
    const resolve = this.characterResolve;
    this.characterResolve = null;
    useAccountStore.setState({ screen: "closed" });
    resolve(selected);
  }

  showCharacterCreator() {
    useAccountStore.setState({
      screen: "characterCreate",
      creatorAvatarIndex: 0,
      creatorName: "",
      error: "",
    });
  }

  setCreatorAvatarIndex(index) {
    const count = this.playableCharacters.length;
    useAccountStore.setState({
      creatorAvatarIndex: (index + count) % count,
    });
    this.sounds?.changeCharacter();
  }

  setCreatorName(value) {
    useAccountStore.setState({
      creatorName: normalizeCharacterNameCapitalization(value),
    });
  }

  async createCharacter() {
    const state = useAccountStore.getState();
    const avatar = this.playableCharacters[state.creatorAvatarIndex || 0];
    try {
      const character = await this.request("/api/characters", {
        method: "POST",
        body: JSON.stringify({
          name: state.creatorName,
          avatarId: avatar.id,
        }),
      });
      const characters = [...state.characters, character];
      useAccountStore.setState({
        screen: "characterSelect",
        characters,
        selectedCharacter: character,
        error: "",
      });
      this.sounds?.success();
    } catch (error) {
      useAccountStore.setState({
        error: error.validationErrors?.length
          ? error.validationErrors
          : [error.message],
      });
    }
  }

  confirmDelete(character) {
    useAccountStore.setState({
      screen: "deleteCharacter",
      deleteTarget: character,
      error: "",
    });
  }

  async deleteCharacter() {
    const state = useAccountStore.getState();
    const character = state.deleteTarget;
    if (!character) return;
    try {
      await this.request(`/api/characters/${character.id}`, {
        method: "DELETE",
      });
      const characters = state.characters.filter(
        ({ id }) => id !== character.id,
      );
      useAccountStore.setState({
        screen: "characterSelect",
        characters,
        selectedCharacter: characters[0] || null,
        deleteTarget: null,
      });
    } catch (error) {
      useAccountStore.setState({ error: error.message });
    }
  }

  backToCharacterSelect() {
    useAccountStore.setState({
      screen: "characterSelect",
      deleteTarget: null,
      error: "",
    });
  }

  canCreateCharacter() {
    return useAccountStore.getState().characters.length
      < MAX_CHARACTER_SLOTS;
  }

  #finishAuthentication(session) {
    const resolve = this.authenticationResolve;
    this.authenticationResolve = null;
    resolve?.(session);
  }
}
