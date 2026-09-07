function requireText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new TypeError(`${label} is required`);
  return text;
}

function browserAssetPath(path) {
  const source = requireText(path, "AUTH audio asset path");
  if (!source.startsWith("public/")) {
    throw new Error(`AUTH audio asset ${source} is not a public asset`);
  }
  return `/${source.slice("public/".length)}`;
}

function nativeCommandHex(word) {
  if (!Number.isInteger(word)) throw new TypeError("AUTH sound command word is unavailable");
  return [0, 8, 16, 24]
    .map(shift => ((word >>> shift) & 0xff).toString(16).padStart(2, "0"))
    .join("");
}

export class NativeAseqAudioCatalog {
  constructor(manifest) {
    if (![
      "new-yokosuka-aseq-audio-pack-v1",
      "new-yokosuka-aseq-audio-pack-v2",
    ].includes(manifest?.schema)) {
      throw new Error(`unsupported AUTH audio manifest ${manifest?.schema || "<missing>"}`);
    }
    this.voices = new Map();
    for (const record of manifest.voices || []) {
      const sourcePath = requireText(record?.sourcePath, "AUTH voice source path");
      if (this.voices.has(sourcePath)) throw new Error(`duplicate AUTH voice ${sourcePath}`);
      const silent = record?.unavailable === true;
      const asset = silent ? null : requireText(record?.asset, "AUTH voice asset");
      this.voices.set(sourcePath, Object.freeze({
        kind: "voice",
        voiceId: requireText(record?.voiceId, "AUTH voice ID"),
        sourcePath,
        silent,
        asset,
        assetUrl: asset ? browserAssetPath(asset) : null,
        assetUrls: Object.freeze(asset ? [browserAssetPath(asset)] : []),
        speakerId: record?.speakerId ? requireText(record.speakerId, "AUTH voice speaker") : null,
        sourceText: typeof record?.sourceText === "string" ? record.sourceText : null,
        displayText: typeof record?.displayText === "string" ? record.displayText : null,
        lipSync: record?.lipSync || null,
      }));
    }
    this.sounds = new Map();
    for (const record of manifest.sounds || []) {
      const commandHex = requireText(record?.commandHex, "AUTH sound command");
      const sourcePath = requireText(record?.sourcePath, "AUTH sound source path");
      const key = `${commandHex}:${sourcePath}`;
      if (this.sounds.has(key)) throw new Error(`duplicate AUTH sound ${key}`);
      const assets = Array.isArray(record.assets) && record.assets.length > 0
        ? record.assets.map(value => requireText(value?.asset, "AUTH sound asset"))
        : [requireText(record?.asset, "AUTH sound asset")];
      this.sounds.set(key, Object.freeze({
        kind: "sound",
        commandHex,
        sourcePath,
        asset: assets[0],
        assetUrl: browserAssetPath(assets[0]),
        assetUrls: Object.freeze(assets.map(browserAssetPath)),
        sampleRate: record.sampleRate,
      }));
    }
  }

  resolve(command, sourcePath) {
    if (command?.name === "voice") {
      const voice = this.voices.get(sourcePath);
      if (!voice) throw new Error(`AUTH voice ${sourcePath} is not catalogued`);
      return voice;
    }
    if (command?.name === "sound") {
      const commandHex = nativeCommandHex(command.commandWord);
      const sound = this.sounds.get(`${commandHex}:${sourcePath}`);
      if (!sound) {
        throw new Error(`AUTH sound ${commandHex}:${sourcePath} is not catalogued`);
      }
      return sound;
    }
    throw new TypeError("AUTH audio catalog received a non-audio command");
  }
}

export function createNativeAseqAudioCatalog(manifest) {
  return new NativeAseqAudioCatalog(manifest);
}
