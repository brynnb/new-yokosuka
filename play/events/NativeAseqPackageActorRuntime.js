const ACTOR_TAG = /^[A-Z0-9_]{4}$/;
const MODEL_CODE = /^[A-Z0-9_]{3,8}$/;

function text(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be non-empty text`);
  }
  return value.trim();
}

function captureRoot(root) {
  return Object.freeze({
    enabled: root.isEnabled?.() !== false,
    position: root.position.asArray(),
    rotation: root.rotation.asArray(),
    scaling: root.scaling.asArray(),
    quaternion: root.rotationQuaternion?.asArray() || null,
  });
}

function restoreRoot(root, snapshot) {
  root.position.set(...snapshot.position);
  root.rotation.set(...snapshot.rotation);
  root.scaling.set(...snapshot.scaling);
  if (snapshot.quaternion) {
    root.rotationQuaternion ||= { set() {} };
    root.rotationQuaternion.set(...snapshot.quaternion);
  } else {
    root.rotationQuaternion = null;
  }
  root.setEnabled(snapshot.enabled);
  root.computeWorldMatrix?.(true);
}

function normalizeVariant(actorTag, value, common = value) {
  const modelCode = text(
    value?.modelCode,
    `${actorTag} model code`,
  ).toUpperCase();
  if (!MODEL_CODE.test(modelCode)) {
    throw new TypeError(`AUTH package actor ${actorTag} model identity is invalid`);
  }
  return Object.freeze({
    actorTag,
    label: text(common?.label, `${actorTag} label`),
    modelCode,
    assetPath: value?.assetPath
      ? text(value.assetPath, `${actorTag} model asset`)
      : null,
    textureAssetPath: value?.textureAssetPath
      ? text(value.textureAssetPath, `${actorTag} texture asset`)
      : null,
    browserFilename: text(
      value?.browserFilename,
      `${actorTag} browser filename`,
    ),
    assetFormat: value?.assetFormat || "MT5",
    characterScale: value?.characterScale ?? common?.characterScale ?? 1,
  });
}

/** Owns exact character bodies supplied by a cutscene archive, not world NPCs. */
export class NativeAseqPackageActorRuntime {
  constructor({ definitions, instantiate } = {}) {
    if (!definitions || Array.isArray(definitions) || typeof instantiate !== "function") {
      throw new TypeError("AUTH package actors require definitions and an instantiator");
    }
    this.definitions = new Map(Object.entries(definitions).map(([key, value]) => {
      const actorTag = key.toUpperCase();
      if (!ACTOR_TAG.test(actorTag)) {
        throw new TypeError(`AUTH package actor ${key} identity is invalid`);
      }
      const variants = Array.isArray(value?.variants)
        ? value.variants.map(variant => normalizeVariant(actorTag, variant, value))
        : [normalizeVariant(actorTag, value)];
      const variantCodes = new Set(variants.map(variant => variant.modelCode));
      if (variantCodes.size !== variants.length) {
        throw new Error(`AUTH package actor ${actorTag} model variants are duplicated`);
      }
      const defaultModelCode = String(
        value?.defaultModelCode || variants[0].modelCode,
      ).toUpperCase();
      if (!variantCodes.has(defaultModelCode)) {
        throw new Error(`AUTH package actor ${actorTag} default model is unavailable`);
      }
      const defaultVariant = variants.find(
        variant => variant.modelCode === defaultModelCode,
      );
      return [actorTag, Object.freeze({
        actorTag,
        label: text(value?.label, `${actorTag} label`),
        modelCode: defaultModelCode,
        defaultModelCode,
        variants: Object.freeze(variants),
        assetPath: defaultVariant.assetPath,
        // Some archive-local HRCM bodies carry their own TEXN/PVRT payloads.
        // Keep an external texture pack optional so those exact bodies do not
        // need a fabricated or duplicated secondary asset.
        textureAssetPath: defaultVariant.textureAssetPath,
        browserFilename: defaultVariant.browserFilename,
        assetFormat: defaultVariant.assetFormat,
        characterScale: defaultVariant.characterScale,
        // This byte is native actor state, captured from the live CLTH owner.
        // It selects shared solver/collision behavior and is deliberately
        // carried with an archive-local actor rather than inferred from a
        // cutscene ID or model name.
        nativeClothRuntimeMode: value?.nativeClothRuntimeMode ?? 0,
        // Native OSAG environment state is independent of CLTH ownership.
        // Zero is ordinary gameplay; nonzero modes must come from captured
        // package/scene state rather than a cutscene-name check.
        nativeSecondaryMotionRuntimeMode:
          value?.nativeSecondaryMotionRuntimeMode ?? 0,
      })];
    }));
    if (this.definitions.size === 0) {
      throw new Error("AUTH package actor definitions are empty");
    }
    for (const definition of this.definitions.values()) {
      if (
        !Number.isInteger(definition.nativeClothRuntimeMode)
        || definition.nativeClothRuntimeMode < 0
        || definition.nativeClothRuntimeMode > 0xff
        || !Number.isInteger(definition.nativeSecondaryMotionRuntimeMode)
        || definition.nativeSecondaryMotionRuntimeMode < 0
        || definition.nativeSecondaryMotionRuntimeMode > 0xff
      ) throw new TypeError(`AUTH package actor ${definition.actorTag} format is invalid`);
      for (const variant of definition.variants) {
        if (
          !["MT5", "MT7"].includes(variant.assetFormat)
          || !Number.isFinite(variant.characterScale)
          || variant.characterScale <= 0
        ) {
          throw new TypeError(
            `AUTH package actor ${definition.actorTag} variant format is invalid`,
          );
        }
      }
    }
    this.actorTags = new Set(this.definitions.keys());
    this.instantiate = instantiate;
    this.records = new Map();
    this.variantRecords = new Map();
    this.active = null;
    this.program = null;
  }

  async load() {
    this.clear();
    const definitions = [...this.definitions.values()].flatMap(definition => (
      definition.variants.map(variant => Object.freeze({
        ...variant,
        label: definition.label,
        nativeClothRuntimeMode: definition.nativeClothRuntimeMode,
        nativeSecondaryMotionRuntimeMode:
          definition.nativeSecondaryMotionRuntimeMode,
      }))
    ));
    const results = await Promise.allSettled(
      definitions.map(definition => this.instantiate(definition)),
    );
    const records = results.flatMap(result => (
      result.status === "fulfilled" ? [result.value] : []
    ));
    const failed = results.find(result => result.status === "rejected");
    if (failed) {
      for (const record of records) record?.root?.dispose?.(false, true);
      throw failed.reason;
    }
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const definition = definitions[index];
      if (
        !record?.root
        || !record?.model
        || record.actorCode !== definition.actorTag
      ) {
        for (const loaded of records) loaded?.root?.dispose?.(false, true);
        throw new Error(
          "AUTH package actor instantiator returned an invalid record",
        );
      }
    }
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const definition = definitions[index];
      record.root.setEnabled(false);
      if (!this.variantRecords.has(record.actorCode)) {
        this.variantRecords.set(record.actorCode, new Map());
      }
      const variants = this.variantRecords.get(record.actorCode);
      if (variants.has(definition.modelCode)) {
        for (const loaded of records) loaded?.root?.dispose?.(false, true);
        throw new Error("AUTH package actor variant identity is duplicated");
      }
      variants.set(definition.modelCode, record);
    }
    for (const definition of this.definitions.values()) {
      const record = this.variantRecords
        .get(definition.actorTag)
        ?.get(definition.defaultModelCode);
      if (!record) {
        for (const loaded of records) loaded?.root?.dispose?.(false, true);
        throw new Error(`AUTH package actor ${definition.actorTag} default model is missing`);
      }
      this.records.set(definition.actorTag, record);
    }
    return this.records.size;
  }

  begin(owner, actorTags) {
    if (this.active) throw new Error("AUTH package actors are already owned");
    if (owner === null || owner === undefined) {
      throw new TypeError("AUTH package actors require an owner");
    }
    const tags = actorTags.map(value => String(value || "").toUpperCase());
    if (tags.length === 0 || new Set(tags).size !== tags.length) {
      throw new TypeError("AUTH package actor ownership must be non-empty and unique");
    }
    const records = tags.map((actorTag) => {
      const record = this.records.get(actorTag);
      if (!record) throw new Error(`AUTH package actor ${actorTag} is unavailable`);
      return record;
    });
    this.active = {
      owner,
      selectedRecords: new Map(records.map(record => [record.actorCode, record])),
      snapshots: new Map(tags.flatMap(actorTag => (
        [...this.variantRecords.get(actorTag).values()]
          .map(record => [record, captureRoot(record.root)])
      ))),
    };
    for (const record of records) record.root.setEnabled(true);
    return records;
  }

  beginProgram(owner) {
    if (this.program) {
      throw new Error("AUTH package-actor program is already owned");
    }
    if (this.active) {
      throw new Error("AUTH package-actor program cannot begin during activity ownership");
    }
    if (owner === null || owner === undefined) {
      throw new TypeError("AUTH package-actor program requires an owner");
    }
    const records = [...this.records.values()];
    if (records.length !== this.definitions.size) {
      throw new Error("AUTH package actors are not loaded");
    }
    this.program = {
      owner,
      selectedRecords: new Map(this.records),
      snapshots: new Map(
        [...this.variantRecords.values()]
          .flatMap(variants => [...variants.values()])
          .map(record => [record, captureRoot(record.root)]),
      ),
    };
    return records;
  }

  programActor(actorTagValue) {
    if (!this.program) return null;
    return this.records.get(String(actorTagValue || "").toUpperCase()) || null;
  }

  selectProgramVariant(owner, actorTagValue, modelCodeValue) {
    if (this.program?.owner !== owner) return null;
    const actorTag = String(actorTagValue || "").toUpperCase();
    const modelCode = String(modelCodeValue || "").toUpperCase();
    const current = this.records.get(actorTag);
    const next = this.variantRecords.get(actorTag)?.get(modelCode);
    if (!current || !next) return null;
    if (current === next) return current;
    const currentState = captureRoot(current.root);
    current.root.setEnabled(false);
    restoreRoot(next.root, currentState);
    this.records.set(actorTag, next);
    return next;
  }

  end(owner, reason = "stopped") {
    if (this.active?.owner !== owner) return false;
    const preserve = Boolean(
      this.program && (reason === "complete" || reason === "replaced"),
    );
    if (!preserve) {
      for (const [record, snapshot] of this.active.snapshots) {
        restoreRoot(record.root, snapshot);
      }
      for (const [actorTag, record] of this.active.selectedRecords) {
        this.records.set(actorTag, record);
      }
    }
    this.active = null;
    return true;
  }

  endProgram(owner) {
    if (this.program?.owner !== owner) return false;
    if (this.active) {
      throw new Error("AUTH package-actor program cannot end during activity ownership");
    }
    for (const [record, snapshot] of this.program.snapshots) {
      restoreRoot(record.root, snapshot);
    }
    this.records = new Map(this.program.selectedRecords);
    this.program = null;
    return true;
  }

  clear() {
    if (this.active) this.end(this.active.owner);
    if (this.program) this.endProgram(this.program.owner);
    for (const variants of this.variantRecords.values()) {
      for (const record of variants.values()) record.root.dispose?.(false, true);
    }
    this.records.clear();
    this.variantRecords.clear();
  }
}

export function createNativeAseqPackageActorRuntime(options) {
  return new NativeAseqPackageActorRuntime(options);
}
