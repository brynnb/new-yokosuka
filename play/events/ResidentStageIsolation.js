// A replacement stage borrows the live world as an asset source, not scenery.
// Scheduled actors have separate ownership and must remain available to the cast.
export function acquireResidentStageIsolation(roots) {
  if (!Array.isArray(roots)) throw new TypeError("Stage isolation requires resident roots");
  const snapshots = roots.filter(root => !root.metadata?.scheduledActorInstanceId)
    .map(root => [root, root.isEnabled?.() !== false]);
  const restore = () => {
    const errors = [];
    for (const [root, enabled] of snapshots) {
      try { if (!root.isDisposed?.()) root.setEnabled(enabled); }
      catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Resident stage restore failed");
  };
  const hide = () => { for (const [root] of snapshots) root.setEnabled(false); };
  try { hide(); } catch (error) {
    try { restore(); } catch (restoreError) { throw new AggregateError([error, restoreError], "Resident stage isolation failed"); }
    throw error;
  }
  return { hide, restore, snapshots };
}
