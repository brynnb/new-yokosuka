import { PlayMusicDirector } from "./MusicDirector.js";
import { AMBIENT_MANIFEST } from "../config/ambient.js";

export class AmbientDirector extends PlayMusicDirector {
  constructor(options = {}) {
    super({
      ...options,
      initialVolume: options.volume,
      initialMuted: false,
      persistPreferences: false,
      audioLabel: "Ambient",
    });
    this.setManifest(options.manifest || AMBIENT_MANIFEST);
  }
}
