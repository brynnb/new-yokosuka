import { formatControlBinding } from '../settings/GeneralPreferences.js';

// Shared by the world reveal and the collection popup. The world-only panel
// is optional; capture prevents toy input from reaching gameplay underneath.
export class CapsuleInspectionControls {
  constructor({dom, canvas, getBinding, onClose, onRotate, input = window}) {
    Object.assign(this, {dom, canvas, getBinding, onClose, onRotate, input});
    this.listeners = [];
    this.keys = new Set();
    this.drag = null;
  }

  open(name) {
    this.close();
    if (this.dom) {
      this.dom.inspectionItem.textContent = name;
      this.dom.inspectionCloseKey.textContent = formatControlBinding(this.getBinding('cancel'));
      this.dom.inspectionControls.hidden = false;
    }
    const listen = (target, type, handler) => {
      if (!target) return;
      target.addEventListener(type, handler, {capture: true});
      this.listeners.push(() => target.removeEventListener(type, handler, {capture: true}));
    };
    const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    const editable = event => event.target?.isContentEditable
      || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName);
    listen(this.dom?.inspectionClose, 'click', () => this.onClose());
    listen(this.input, 'keydown', event => {
      if (editable(event) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === this.getBinding('cancel')) {
        stop(event);
        if (!event.repeat) this.onClose();
      } else if (event.code === 'KeyA' || event.code === 'KeyD') {
        stop(event);
        this.keys.add(event.code);
      }
    });
    listen(this.input, 'keyup', event => {
      if (this.keys.delete(event.code)) stop(event);
    });
    listen(this.input, 'blur', () => { this.keys.clear(); this.releaseDrag(); });
    listen(this.canvas, 'pointerdown', event => {
      if (this.drag || (event.button !== 0 && event.button !== 2)) return;
      stop(event);
      this.drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
      this.canvas.setPointerCapture(event.pointerId);
    });
    listen(this.canvas, 'pointermove', event => {
      if (event.pointerId !== this.drag?.id) return;
      stop(event);
      this.onRotate((event.clientX - this.drag.x) * 0.01, (event.clientY - this.drag.y) * 0.01);
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      listen(this.canvas, type, event => {
        if (event.pointerId !== this.drag?.id) return;
        stop(event); this.releaseDrag();
      });
    }
    // Some gameplay listeners still use mouse events rather than pointers.
    for (const type of ['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu', 'wheel']) {
      listen(this.canvas, type, stop);
    }
  }

  update(deltaSeconds) {
    const direction = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    if (direction) this.onRotate(direction * Math.min(0.1, deltaSeconds) * 2, 0);
  }

  releaseDrag() {
    const id = this.drag?.id;
    this.drag = null;
    if (id !== undefined && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }

  close() {
    for (const remove of this.listeners) remove();
    this.listeners = [];
    this.keys.clear();
    this.releaseDrag();
    if (this.dom) this.dom.inspectionControls.hidden = true;
  }
}
