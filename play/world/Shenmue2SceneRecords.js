export function shenmue2WorldSceneRecords(catalog, world) {
  const prefixes = (world.scenePrefixes || [world.prefix]).map(prefix => `${prefix}_`);
  return (catalog?.models || []).filter((record) => (
    prefixes.some(prefix => record.filename.startsWith(prefix))
    && (
      (
        record.kind === "MAPM"
        && /^MAP\d*\.MAPM$/i.test(record.sourceMember || "")
      )
      || (
        record.kind === "PROP"
        && /^PROP\d*\.PROP$/i.test(record.sourceMember || "")
      )
    )
  ));
}
