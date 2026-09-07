#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = "play/config/world-access-policy.json";
const bytes = await fs.readFile(path.join(root, sourcePath));
const policy = JSON.parse(bytes);
const worlds = policy.alwaysAccessibleInteriorWorldIds;
if (policy.schema !== "new-yokosuka-world-access-policy-v1"
  || !Array.isArray(worlds) || worlds.length === 0
  || worlds.some((id) => typeof id !== "string" || !id || id.trim() !== id)
  || new Set(worlds).size !== worlds.length || !policy.policy) {
  throw new Error("Invalid world access policy");
}

// D000 dispatcher arguments were incorrectly joined to physical door indices.
// Horizontal overlay containment proves neither dispatch nor player access.
// Keep native clock presentation separate until actual access bindings are proven.
const manifest = {
  schema: "new-yokosuka-timed-transition-access-v1",
  generatedFrom: [{ path: sourcePath, sha256: createHash("sha256").update(bytes).digest("hex") }],
  alwaysAccessibleInteriorWorldIds: worlds,
  alwaysAccessibleInteriorPolicy: policy.policy,
  rules: [],
  presentationOnlyAssociations: [],
  evidenceBoundary: "No verified physical-door access rules. The former layer-14/selector-30/DCHA rule and selector-63 portal exclusion joined unrelated dispatcher and physical-door identifiers. Native clock layers remain presentation only; reverse-entry associations supply storefront destinations."
};
await fs.writeFile(path.join(root, "play/data/timed-transition-access.json"), JSON.stringify(manifest, null, 2) + "\n");
process.stdout.write("Generated access policy without unproven door bindings.\n");
