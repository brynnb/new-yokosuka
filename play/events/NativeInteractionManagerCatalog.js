export const NATIVE_INTERACTION_MANAGER_PACK_SCHEMA = (
  "new-yokosuka-native-interaction-manager-pack-v2"
);

function sourceKey({ disc, area, mapinfoSha256 } = {}) {
  return `${disc}:${String(area || "").toUpperCase()}:${mapinfoSha256}`;
}

export function createNativeInteractionManagerCatalog(pack) {
  if (pack?.schema !== NATIVE_INTERACTION_MANAGER_PACK_SCHEMA) {
    throw new Error("Unsupported native interaction-manager pack schema");
  }
  const managers = new Map();
  for (const manager of pack.managers || []) {
    const key = sourceKey(manager);
    if (!manager?.id || manager.id !== key || managers.has(key)) {
      throw new Error("Native interaction-manager pack has invalid identity");
    }
    managers.set(key, manager);
  }
  const expected = pack.summary || {};
  const descriptorCount = [...managers.values()].reduce(
    (total, manager) => total + manager.descriptorSequences.length,
    0,
  );
  const referenceCount = [...managers.values()].reduce(
    (total, manager) => total + manager.descriptorSequences.reduce(
      (subtotal, sequence) => subtotal + sequence.length,
      0,
    ),
    0,
  );
  if (
    expected.managerCount !== managers.size
    || expected.descriptorCount !== descriptorCount
    || expected.indirectReferenceCount !== referenceCount
  ) {
    throw new Error("Native interaction-manager summary does not match records");
  }
  return Object.freeze({
    summary: Object.freeze({ ...expected }),
    getBySource: source => managers.get(sourceKey(source)) || null,
    list: () => [...managers.values()],
  });
}
