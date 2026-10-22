const RESUME_KEY = "new-yokosuka.mode-resume.v1";
export const PLAY_MODES = Object.freeze(["story", "free_roam"]);

export function effectiveAvatar(character) {
  return character?.playMode === "story" ? "ryo" : character?.avatarId;
}

// A one-use character id is only a navigation hint, not authentication. The
// normal cookie/ownership boundary is checked again after the full teardown.
export async function consumeModeResume(request, storage = globalThis.sessionStorage) {
  if (!storage) return null;
  const id = Number(storage.getItem(RESUME_KEY));
  storage.removeItem(RESUME_KEY);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const session = await request("/api/session");
  const { characters } = await request("/api/characters");
  const character = characters.find(item => item.id === id);
  if (!character) throw new Error("The saved character is no longer available.");
  return { ...session, characters, character };
}

export class PlayModeSession {
  constructor({ account, canSwitch, saveDialogue, lock, unlock,
    onState, signal = null, reload = () => location.reload(), storage = sessionStorage }) {
    Object.assign(this, { account, canSwitch, saveDialogue, lock, unlock,
      onState, signal, reload, storage });
    this.pending = false;
  }

  async switchTo(mode) {
    const character = this.account.character;
    if (this.signal?.aborted || !PLAY_MODES.includes(mode) || !character || this.pending || mode === character.playMode) return false;
    if (!this.canSwitch()) {
      this.onState({ modeError: "Finish your current activity before changing mode." });
      return false;
    }
    this.pending = true;
    this.onState({ modeBusy: true, modeError: null });
    this.lock();
    let requested = false;
    try {
      // Finish native writes before changing their destination context.
      await this.saveDialogue();
      this.signal?.throwIfAborted();
      this.storage.setItem(RESUME_KEY, String(character.id));
      requested = true;
      await this.account.request(`/api/characters/${character.id}/play-mode`, {
        method: "POST", signal: this.requestSignal(),
        body: JSON.stringify({ mode, revision: character.modeRevision }),
      });
      // A reload is intentional: no old scene owner, NPC revision or pending
      // loader may leak into the restored personal mode.
      if (!this.signal?.aborted) this.reload();
      return true;
    } catch (error) {
      if (this.signal?.aborted) return false;
      if (requested) {
        try {
          const { character: current } = await this.account.request(
            `/api/characters/${character.id}/state`, { signal: this.requestSignal() });
          if (this.signal?.aborted) return false;
          if (current.modeRevision !== character.modeRevision) {
            this.reload();
            return true;
          }
        } catch {
          if (this.signal?.aborted) return false;
          // The outcome is unknown. Reload through authentication instead of
          // resuming an old world and potentially saving over a committed swap.
          this.reload();
          return false;
        }
      }
      this.storage.removeItem(RESUME_KEY);
      this.pending = false;
      this.unlock();
      this.onState({ modeBusy: false, modeError: error.message || "Could not save. Please retry." });
      return false;
    }
  }

  requestSignal() {
    const timeout = AbortSignal.timeout(10000);
    return this.signal ? AbortSignal.any([this.signal, timeout]) : timeout;
  }
}
