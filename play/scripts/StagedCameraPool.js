// Original interactive encounters may retain one angle across a motion lead,
// the timed input, and its result. The selection belongs to that Yarn run.
export class StagedCameraPool {
  constructor(random = Math.random) {
    this.random = random;
    this.sessions = new WeakMap();
  }

  select(pool, transaction) {
    let pools = this.sessions.get(transaction);
    if (!pools) this.sessions.set(transaction, pools = new Map());
    const current = pools.get(pool.id);
    const previous = pool.angles.findIndex(angle=>angle.cameraNumber===current);
    if (current != null && previous < 0) throw Error("Staged camera pool lost its angle: " + pool.id);
    let index = previous;
    if (pool.advance) {
      // The first angle is fixed. On retries the original rejection-samples
      // the other indices; drawing once among those gives the same distribution.
      if (current == null) index = 0;
      else {
        index = Math.floor(this.random() * (pool.angles.length - 1));
        if (index >= previous) index++;
      }
      pools.set(pool.id, pool.angles[index].cameraNumber);
    } else if (current == null) {
      throw Error("Staged camera pool has no active selection: " + pool.id);
    }
    return pool.angles[index];
  }
}
