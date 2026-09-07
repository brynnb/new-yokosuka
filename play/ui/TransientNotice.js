const MAX_NOTICE_DURATION_MILLISECONDS = 2000;

export class TransientNotice {
  constructor({
    element,
    setTimeoutFn = window.setTimeout.bind(window),
    clearTimeoutFn = window.clearTimeout.bind(window),
  }) {
    this.element = element;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.timeout = null;
    this.active = false;
  }

  show(text, durationMilliseconds = MAX_NOTICE_DURATION_MILLISECONDS) {
    if (this.timeout !== null) this.clearTimeoutFn(this.timeout);
    this.element.textContent = text;
    this.element.hidden = false;
    this.active = true;
    const duration = Math.min(
      MAX_NOTICE_DURATION_MILLISECONDS,
      Math.max(0, durationMilliseconds),
    );
    this.timeout = this.setTimeoutFn(() => {
      this.timeout = null;
      this.active = false;
      this.element.hidden = true;
    }, duration);
  }

  hide() {
    if (this.timeout !== null) this.clearTimeoutFn(this.timeout);
    this.timeout = null;
    this.active = false;
    this.element.hidden = true;
  }

  dispose() {
    this.hide();
  }
}

export const TRANSIENT_NOTICE_MAX_DURATION_MILLISECONDS =
  MAX_NOTICE_DURATION_MILLISECONDS;
