import { NativeSceneGameplayState } from "../events/NativeSceneGameplayState.js";

// The original 0x002e callback submits a 640x480 rectangle from its packed
// channels. These Story cues use black RGB and the leading byte as alpha.
export class NativeStoryScreenFade {
  constructor({present, clear, handoff}) {
    this.present = present;
    this.clear = clear;
    this.transfer = handoff;
    this.active = null;
    this.channels = null;
  }

  play(transaction, cue, signal) {
    signal.throwIfAborted();
    const {durationFrames, fromAlpha, toAlpha, holdFrames = 0} = cue;
    if (this.active || !Number.isInteger(durationFrames) || durationFrames < 1 || durationFrames > 3600
      || !Number.isInteger(holdFrames) || holdFrames < 0 || holdFrames > 3600
      || ![fromAlpha,toAlpha].every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
      throw new Error("Invalid native Story screen fade");
    }
    this.channels ??= new NativeSceneGameplayState();
    this.channels.writeSceneEightChannelTransition({
      duration: durationFrames, endpoints: [[fromAlpha,0,0,0],[toAlpha,0,0,0]],
    });
    this.present(transaction,fromAlpha);
    return new Promise((resolve,reject) => {
      const abort = () => this.cancel(transaction,signal.reason);
      this.active = {transaction,durationFrames,fromAlpha,toAlpha,holdFrames,elapsedSeconds:0,frame:0,
        resolve,reject,detach:()=>signal.removeEventListener("abort",abort)};
      signal.addEventListener("abort",abort,{once:true});
    });
  }

  update(transaction, seconds) {
    const fade = this.active;
    if (!fade || fade.transaction !== transaction || !(seconds > 0)) return;
    fade.elapsedSeconds += seconds;
    const frame = Math.min(fade.durationFrames,Math.max(0,Math.floor(fade.elapsedSeconds*30 + 1e-8) - fade.holdFrames));
    if (frame === fade.frame) return;
    while (fade.frame < frame) {
      this.channels.advanceSceneEightChannelTransition();
      fade.frame++;
    }
    const alpha = this.channels.readSceneEightChannelTransition().currentWords[0] >>> 16;
    this.present(transaction,alpha);
    if (frame === fade.durationFrames) {
      this.active = null;
      fade.detach();
      fade.resolve();
    }
  }

  handoff(transaction) {
    if (this.active) throw new Error("Unfinished Story screen fade");
    this.transfer(transaction);
  }

  cancel(transaction, reason = new DOMException("Story screen fade released","AbortError")) {
    const fade = this.active;
    if (fade?.transaction === transaction) {
      this.active = null;
      fade.detach();
      fade.reject(reason);
    }
    this.clear(transaction);
  }
}
