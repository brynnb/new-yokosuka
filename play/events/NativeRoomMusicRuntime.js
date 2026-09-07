export class NativeRoomMusicRuntime {
  constructor({ playTemporaryTrack, stopTemporaryTrack } = {}) {
    if (
      typeof playTemporaryTrack !== "function"
      || typeof stopTemporaryTrack !== "function"
    ) {
      throw new TypeError("native room music requires complete presentation ownership");
    }
    this.playTemporaryTrack = playTemporaryTrack;
    this.stopTemporaryTrack = stopTemporaryTrack;
    this.active = null;
  }

  beginTransaction() {
    if (this.active) throw new Error("native room music is already owned");
    const token = Object.freeze({ kind: "native-room-music" });
    this.active = { token, trackId: null };
    return token;
  }

  playSequence(trackId) {
    const active = this.active;
    if (!active || active.trackId) return false;
    if (this.playTemporaryTrack(trackId, { gain: 1 }) !== true) return false;
    active.trackId = trackId;
    return true;
  }

  endTransaction(token) {
    const active = this.active;
    if (!active || active.token !== token) return false;
    try {
      if (active.trackId) this.stopTemporaryTrack(active.trackId);
    } finally {
      this.active = null;
    }
    return true;
  }
}

export function createNativeRoomMusicRuntime(options) {
  return new NativeRoomMusicRuntime(options);
}
