/** Radial input avoids faster diagonal movement. The dead zone is rescaled so
 * the remaining travel still spans the full analogue speed range. Screen +Y is
 * down, while the movement controller uses +Z for forward/up. */
export function joystickAxes(dx, dy, radius, deadZone = .12) {
  if (![dx, dy, radius, deadZone].every(Number.isFinite) || radius <= 0) {
    return {x:0, z:0, offsetX:0, offsetY:0};
  }
  const distance = Math.hypot(dx, dy);
  if (!distance) return {x:0, z:0, offsetX:0, offsetY:0};
  const limit = Math.max(0, Math.min(.99, deadZone));
  const travel = Math.min(distance, radius);
  const speed = Math.max(0, (travel / radius - limit) / (1 - limit));
  const unitX = dx / distance, unitY = dy / distance;
  return {x:unitX * speed, z:-unitY * speed, offsetX:unitX * travel, offsetY:unitY * travel};
}

/** Own exactly one pointer on this pad, without intercepting page-wide touch.
 * The caller can reset when opening UI and setEnabled on scene/mode changes. */
export function createTouchJoystick({element, onMove, isEnabled = () => true}) {
  const pad = element?.querySelector('.joystick-pad');
  const thumb = element?.querySelector('.joystick-thumb');
  if (!pad || !thumb || typeof onMove !== 'function') throw new TypeError('Joystick requires a pad, thumb and onMove callback');
  const doc = element.ownerDocument;
  const win = doc.defaultView;
  let enabled = !pad.disabled, destroyed = false, pointerId = null, bounds = null;
  let lastX = NaN, lastZ = NaN;
  const listeners = [];

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function emit(x, z) {
    if (x === lastX && z === lastZ) return;
    lastX = x; lastZ = z;
    onMove({x, z});
  }
  function reset() {
    const heldPointer = pointerId;
    pointerId = null; bounds = null;
    element.style.setProperty('--joystick-x', '0px');
    element.style.setProperty('--joystick-y', '0px');
    delete element.dataset.active;
    emit(0, 0);
    // Clear ownership first: release may synchronously dispatch capture loss.
    if (heldPointer !== null) {
      try { if (pad.hasPointerCapture(heldPointer)) pad.releasePointerCapture(heldPointer); } catch { /* The browser may already have released a removed pointer. */ }
    }
  }
  function available() { return !destroyed && enabled && isEnabled(); }
  function consume(event) { event.preventDefault(); event.stopPropagation(); }
  function move(event) {
    const input = joystickAxes(event.clientX - bounds.x, event.clientY - bounds.y, bounds.radius);
    element.style.setProperty('--joystick-x', `${input.offsetX}px`);
    element.style.setProperty('--joystick-y', `${input.offsetY}px`);
    emit(input.x, input.z);
  }
  function down(event) {
    consume(event);
    if (!available()) { reset(); return; }
    if (pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const rect = pad.getBoundingClientRect(), knob = thumb.getBoundingClientRect();
    const radius = (Math.min(rect.width, rect.height) - Math.max(knob.width, knob.height)) / 2;
    if (!(radius > 0)) return;
    bounds = {x:rect.left + rect.width / 2, y:rect.top + rect.height / 2, radius};
    pointerId = event.pointerId;
    try { pad.setPointerCapture(pointerId); } catch { reset(); return; }
    element.dataset.active = 'true';
    move(event);
  }
  function drag(event) {
    consume(event);
    if (event.pointerId !== pointerId) return;
    if (!available()) { reset(); return; }
    move(event);
  }
  function end(event) {
    consume(event);
    if (event.pointerId === pointerId) reset();
  }
  function visibility() { if (doc.hidden) reset(); }

  listen(pad, 'pointerdown', down, {passive:false});
  listen(pad, 'pointermove', drag, {passive:false});
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(pad, type, end, {passive:false});
  // Suppress only the pad's compatibility click and long-press context menu.
  listen(pad, 'click', consume);
  listen(pad, 'contextmenu', consume);
  listen(pad, 'blur', reset);
  listen(win, 'blur', reset);
  listen(win, 'resize', reset);
  listen(doc, 'visibilitychange', visibility);
  reset();

  return {
    reset,
    setEnabled(value) {
      const next = Boolean(value);
      if (next !== enabled) { enabled = next; pad.disabled = !enabled; }
      if (!available()) reset();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      reset();
      listeners.splice(0).forEach(remove => remove());
    },
  };
}
