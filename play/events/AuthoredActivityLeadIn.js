// Reuse the scene player's actors, audio and cleanup for a simple authored
// conversation before an original activity. This is not recovered AUTH data.
export function prependAuthoredActivityLeadIn(prepared, leadIn, audioCatalog) {
  if (!leadIn) return prepared;
  if (!leadIn.evidence || !Array.isArray(leadIn.lines) || !leadIn.lines.length || !audioCatalog) {
    throw new Error("Authored scene lead-in needs provenance and voiced lines");
  }
  const visuals = prepared.frames.find(frame => frame.frame === 1)?.commands
    .filter(command => ["camera", "move", "motion"].includes(command.name));
  if (!visuals?.some(command => command.name === "camera")
    || !visuals.some(command => command.name === "move") || !visuals.some(command => command.name === "motion")) {
    throw new Error("Authored scene lead-in needs an established opening pose and camera");
  }
  const mapChannels = (track, transform) => ({ ...track, channels: Object.fromEntries(
    Object.entries(track.channels).map(([key, curve]) => [key, transform(curve)])),
  });
  const held = curve => curve.times.length ? { times: [0], values: [curve.values[0]], tangents: [0] } : curve;
  const frames = [{ frame: 1, commands: visuals.map(command => {
    if (command.name === "camera") return { ...command, camera: mapChannels(command.camera, held) };
    if (command.name === "move") return { ...command, movement: mapChannels(command.movement, held) };
    return { ...command, hold: true };
  }) }];
  let offset = 1;
  for (const line of leadIn.lines) {
    if (!Number.isSafeInteger(line.durationFrames) || line.durationFrames < 1) throw new Error("Invalid authored voice duration");
    const audio = audioCatalog.resolve({ name: "voice" }, line.sourcePath);
    if (audio.silent || !audio.displayText || !prepared.sequence.actors.includes(audio.speakerId)) throw new Error("Authored voice is unavailable or its actor is not staged");
    frames.push({ frame: offset, commands: [{ name: "voice", audio, stringValue: line.sourcePath }] });
    offset += line.durationFrames;
  }
  const shifted = curve => ({ ...curve, times: curve.times.map(time => time + offset / 30) });
  for (const frame of prepared.frames) frames.push({ ...frame, frame: frame.frame + offset,
    commands: frame.commands.map(command => {
      if (command.name === "camera") return { ...command, camera: mapChannels(command.camera, shifted) };
      if (command.name === "move") return { ...command, movement: mapChannels(command.movement, shifted) };
      return command;
    }),
  });
  const merged = new Map();
  for (const frame of frames) merged.set(frame.frame, [...(merged.get(frame.frame) || []), ...frame.commands]);
  return { ...prepared, record: { ...prepared.record, durationFrames: prepared.record.durationFrames + offset },
    frames: [...merged].sort(([a], [b]) => a - b).map(([frame, commands]) => ({ frame, commands })) };
}
