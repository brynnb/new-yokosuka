export function supportedDobuitaInteriorTransitions(nativeMapTransitions) {
  const inboundByArea = new Map();
  for (const transition of (
    nativeMapTransitions.reverseMatchedD000Transitions || []
  )) {
    if (transition.supported && transition.source?.area === "D000") {
      inboundByArea.set(transition.destination.area, transition);
    }
  }
  for (
    const transition
    of nativeMapTransitions.runtimeNativeVolumeTransitions || []
  ) {
    if (
      transition.supported
      && transition.source?.area === "D000"
      && /^D[A-Z0-9]{3}$/.test(transition.destination?.area || "")
    ) {
      inboundByArea.set(transition.destination.area, transition);
    }
  }
  return Object.freeze([...inboundByArea.values()]);
}
