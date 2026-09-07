export function createCombatRootMotionApplier(root, onMoved = () => {}) {
  let activeKey = null;
  let originX = 0;
  let originZ = 0;
  let originYaw = 0;
  let localOriginX = 0;
  let localOriginZ = 0;
  return (sample) => {
    if (!sample) return;
    const key = `${sample.playbackRevision}:${sample.generation}`;
    const [localX = 0, , localZ = 0] = sample.translation;
    if (key !== activeKey) {
      activeKey = key;
      originX = root.position.x;
      originZ = root.position.z;
      originYaw = root.rotation.y;
      localOriginX = localX;
      localOriginZ = localZ;
    }
    const right = localX - localOriginX;
    const forward = -(localZ - localOriginZ);
    root.position.x = (
      originX
      + right * Math.cos(originYaw)
      + forward * Math.sin(originYaw)
    );
    root.position.z = (
      originZ
      - right * Math.sin(originYaw)
      + forward * Math.cos(originYaw)
    );
    onMoved(root.position);
  };
}
