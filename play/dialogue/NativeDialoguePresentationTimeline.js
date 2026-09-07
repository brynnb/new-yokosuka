function finiteTime(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export class NativeDialoguePresentationTimeline {
  constructor(program, {
    onMessageStart = () => {},
    onMessageEnd = () => {},
    onNativeCommand = () => {},
    onToken = () => {},
    onComplete = () => {},
  } = {}) {
    this.program = program;
    this.callbacks = {
      onMessageStart,
      onMessageEnd,
      onNativeCommand,
      onToken,
      onComplete,
    };
    this.commandIndex = 0;
    this.activeMessage = null;
    this.elapsedSeconds = 0;
    this.started = false;
    this.completed = false;
  }

  start(elapsedSeconds = 0) {
    if (this.started) return false;
    this.started = true;
    return this.update(elapsedSeconds);
  }

  update(elapsedSeconds) {
    if (this.completed) return false;
    const elapsed = finiteTime(elapsedSeconds);
    if (elapsed === null) {
      throw new TypeError("elapsedSeconds must be a finite non-negative number");
    }
    if (elapsed < this.elapsedSeconds) {
      throw new RangeError("native dialogue presentation time cannot go backwards");
    }
    this.started = true;
    this.elapsedSeconds = elapsed;
    const commands = this.program?.commands || [];
    let changed = false;

    while (this.commandIndex < commands.length) {
      const command = commands[this.commandIndex];
      const commandTime = finiteTime(command.nativeTimeSeconds);
      if (commandTime === null || commandTime > elapsed) break;
      this.finishActiveMessage(commandTime, "nativeDeadline");
      this.commandIndex += 1;
      this.callbacks.onToken(command, commandTime);
      if (command.kind === "message") {
        this.activeMessage = command;
        this.callbacks.onMessageStart(command.message, command);
      } else if (command.kind === "nativeCommand") {
        this.callbacks.onNativeCommand(command);
      }
      changed = true;
    }

    const duration = finiteTime(this.program?.nativeDurationSeconds);
    if (
      duration !== null &&
      elapsed >= duration &&
      this.commandIndex >= commands.length
    ) {
      this.finishActiveMessage(duration, "nativeDeadline");
      this.completed = true;
      this.callbacks.onComplete({
        nativeDurationSeconds: duration,
      });
      changed = true;
    }
    return changed;
  }

  advance() {
    if (this.completed) return false;
    const commands = this.program?.commands || [];
    const nextMessage = commands
      .slice(this.commandIndex)
      .find((command) => (
        command.kind === "message"
        && finiteTime(command.nativeTimeSeconds) !== null
      ));
    const duration = finiteTime(this.program?.nativeDurationSeconds);
    const target = nextMessage
      ? finiteTime(nextMessage.nativeTimeSeconds)
      : duration;
    if (target === null || target < this.elapsedSeconds) return false;
    return this.update(target);
  }

  finishActiveMessage(nativeTimeSeconds, reason) {
    if (!this.activeMessage) return;
    const command = this.activeMessage;
    this.activeMessage = null;
    this.callbacks.onMessageEnd(command.message, {
      command,
      nativeTimeSeconds,
      reason,
      releaseVoiceIfActive: true,
      clearTextPresentation: true,
    });
  }
}

export function createNativeDialoguePresentationTimeline(program, callbacks) {
  return new NativeDialoguePresentationTimeline(program, callbacks);
}
