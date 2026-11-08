// Holds a native film's last rendered frame while the next Story tableau is
// acquired. Ownership is transaction-scoped: a late cancellation must never
// remove a newer world transition's frame.
export class StoryFrameHandoff {
  constructor({captureFrame,releaseFrame,afterRender}) {
    if(![captureFrame,releaseFrame,afterRender].every(fn=>typeof fn==="function"))throw new TypeError("Story frame handoff requires frame adapters");
    this.captureFrame=captureFrame;this.releaseFrame=releaseFrame;this.afterRender=afterRender;this.pending=null;
  }

  expect(transaction,cutscene){
    if(!transaction||!cutscene?.id||!cutscene.handoffSequence||this.pending)throw Error("Invalid Story frame handoff");
    this.pending={transaction,cutsceneId:cutscene.id,sequenceId:cutscene.handoffSequence,captured:false};
  }

  pendingFor(transaction){return this.pending?.transaction===transaction;}

  capture(cutscene){
    const pending=this.pending;
    if(!pending||pending.cutsceneId!==cutscene?.id||pending.sequenceId!==cutscene.handoffSequence)throw Error("Story handoff has no matching transaction");
    if(!pending.captured){
      if(this.captureFrame(pending)!==true)throw Error("Story handoff could not capture the outgoing frame");
      pending.captured=true;
    }
  }

  async reveal(transaction,sequenceId,signal){
    const pending=this.pending;
    if(!pending||pending.transaction!==transaction)return false;
    if(pending.sequenceId!==sequenceId||!pending.captured)throw Error("Story handoff reached an unexpected scene");
    await this.afterRender(signal);
    signal?.throwIfAborted();
    if(this.pending!==pending)return false;
    this.pending=null;
    this.releaseFrame(pending);
    return true;
  }

  cancel(transaction){
    const pending=this.pending;
    if(!pending||pending.transaction!==transaction)return false;
    this.pending=null;
    if(pending.captured)this.releaseFrame(pending);
    return true;
  }
}
