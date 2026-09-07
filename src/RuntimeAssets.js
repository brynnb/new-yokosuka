import manifest from "./runtime-assets.generated.json" with { type: "json" };
import { R2_URL, OFFLINE_MODE } from "./constants.js";

export const runtimeAssets = manifest.assets;

export function runtimeAssetKey(sourcePath, record = runtimeAssets[sourcePath]) {
  if (!record || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    throw new Error(`Unregistered runtime asset: ${sourcePath}`);
  }
  return `shenmue/runtime/${record.sha256}/${sourcePath}`;
}

export function runtimeAssetUrl(sourcePath, { offline = OFFLINE_MODE, baseUrl = R2_URL } = {}) {
  const key = runtimeAssetKey(sourcePath);
  if (offline) return `/${sourcePath.replace(/^public\//, "")}`;
  return `${baseUrl.replace(/\/$/, "")}/${key}`;
}

// Manifests retain source-relative paths for reproducible extraction. Resolve
// only registered resources at the I/O boundary; unrelated URLs stay untouched.
export function resolveRuntimeAssetUrl(url) {
  if (typeof url !== "string") return url;
  const sourcePath = url.startsWith("/audio/") || url.startsWith("/music/")
    ? `public${url}` : url.replace(/^\//, "");
  return Object.hasOwn(runtimeAssets, sourcePath) ? runtimeAssetUrl(sourcePath) : url;
}

function patternRegex(pattern) {
  const tokens = pattern.match(/\*\*\/|\*\*|\*|\{[^}]+\}|[^*{]+/g) || [];
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${tokens.map(token => {
    if (token === "**/") return "(?:.*/)?";
    if (token === "**") return ".*";
    if (token === "*") return "[^/]*";
    if (token.startsWith("{")) return `(?:${token.slice(1, -1).split(",").map(escape).join("|")})`;
    return escape(token);
  }).join("")}$`);
}

// Unlike filesystem globs this catalog is identical in clean clones and on
// extractor machines. Returned keys are repository-relative source paths.
export function runtimeAssetGroup(patterns) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  const include = list.filter(p => !p.startsWith("!")).map(patternRegex);
  const exclude = list.filter(p => p.startsWith("!")).map(p => patternRegex(p.slice(1)));
  return Object.fromEntries(Object.keys(runtimeAssets)
    .filter(file => include.some(re => re.test(file)) && !exclude.some(re => re.test(file)))
    .map(file => [file, runtimeAssetUrl(file)]));
}
