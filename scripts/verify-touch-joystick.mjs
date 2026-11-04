import assert from 'node:assert/strict';
import {joystickAxes, createTouchJoystick} from '../src/heritage/touch-joystick.js';

const passed = [];
const check = (name, test) => { test(); passed.push(name); };
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-10, `${value} != ${expected}`);

function setup() {
  const win = new EventTarget(), doc = new EventTarget();
  doc.defaultView = win; doc.hidden = false;
  const pad = new EventTarget(), properties = new Map(), captures = new Set();
  let disabled = false, disabledWrites = 0, allowed = true;
  Object.defineProperty(pad, 'disabled', {get:() => disabled, set:value => { disabled = value; disabledWrites++; }});
  pad.getBoundingClientRect = () => ({left:10, top:20, width:140, height:140});
  pad.setPointerCapture = id => captures.add(id);
  pad.hasPointerCapture = id => captures.has(id);
  pad.releasePointerCapture = id => { captures.delete(id); fire('lostpointercapture', {pointerId:id}); };
  const thumb = {getBoundingClientRect:() => ({width:40, height:40})};
  const element = {ownerDocument:doc, dataset:{}, style:{setProperty:(name, value) => properties.set(name, value)},
    querySelector:selector => selector === '.joystick-pad' ? pad : thumb};
  const moves = [];
  const control = createTouchJoystick({element, onMove:input => moves.push(input), isEnabled:() => allowed});
  function fire(type, values = {}) {
    const event = new Event(type, {cancelable:true, bubbles:true});
    Object.assign(event, {pointerId:1, pointerType:'touch', button:0, clientX:80, clientY:40}, values);
    let stopped = false;
    event.stopPropagation = () => { stopped = true; };
    pad.dispatchEvent(event);
    return {event, stopped};
  }
  const latest = () => moves.at(-1);
  const assertStopped = () => {
    assert.deepEqual(latest(), {x:0, z:0});
    assert.equal(element.dataset.active, undefined);
    assert.equal(properties.get('--joystick-x'), '0px');
    assert.equal(properties.get('--joystick-y'), '0px');
    assert.equal(captures.size, 0);
  };
  return {win, doc, pad, element, properties, captures, moves, control, fire, latest, assertStopped,
    setAllowed:value => { allowed = value; }, disabledWrites:() => disabledWrites};
}

check('Radial dead zone, direction and proportional speed', () => {
  assert.equal(joystickAxes(6, 0, 50).x, 0);
  assert.equal(joystickAxes(4, 4, 50).x, 0);
  near(joystickAxes(28, 0, 50).x, .5);
  near(joystickAxes(0, -28, 50).z, .5);
  near(joystickAxes(-50, 0, 50).x, -1);
  near(joystickAxes(0, 50, 50).z, -1);
});
check('Clamps arbitrary diagonal drags to unit speed and circular thumb travel', () => {
  for (let angle = 0; angle < 2 * Math.PI; angle += .03) {
    for (const distance of [0, 5, 25, 50, 5000]) {
      const input = joystickAxes(Math.cos(angle) * distance, Math.sin(angle) * distance, 50);
      assert.ok(Math.hypot(input.x, input.z) <= 1 + 1e-12);
      assert.ok(Math.hypot(input.offsetX, input.offsetY) <= 50 + 1e-12);
      if (distance >= 50) near(Math.hypot(input.x, input.z), 1);
    }
  }
  assert.deepEqual(joystickAxes(NaN, 0, 50), {x:0, z:0, offsetX:0, offsetY:0});
  assert.deepEqual(joystickAxes(2, 3, 0), {x:0, z:0, offsetX:0, offsetY:0});
});
check('Offset press moves immediately; captured drag updates without a second finger taking over', () => {
  const s = setup(), down = s.fire('pointerdown');
  assert.equal(down.event.defaultPrevented, true); assert.equal(down.stopped, true);
  assert.deepEqual(s.latest(), {x:0, z:1}); assert.equal(s.element.dataset.active, 'true');
  assert.ok(s.captures.has(1));
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
    s.fire(type, {pointerId:2, clientX:130, clientY:90});
    assert.deepEqual(s.latest(), {x:0, z:1}); assert.ok(s.captures.has(1));
  }
  s.fire('pointermove', {clientX:108, clientY:90}); near(s.latest().x, .5); near(s.latest().z, 0);
  s.fire('pointerup'); s.assertStopped();
  s.fire('pointermove', {clientX:130, clientY:90}); s.assertStopped();
  s.fire('pointerdown', {pointerId:3, clientX:130, clientY:90}); near(s.latest().x, 1);
  s.control.destroy();
});
check('Release, cancellation, capture loss, blur, hidden tab, resize and reset stop reliably', () => {
  const stops = [s => s.fire('pointerup'), s => s.fire('pointercancel'), s => s.fire('lostpointercapture'),
    s => s.pad.dispatchEvent(new Event('blur')),
    s => s.win.dispatchEvent(new Event('blur')), s => {s.doc.hidden = true; s.doc.dispatchEvent(new Event('visibilitychange'));},
    s => s.win.dispatchEvent(new Event('resize')), s => s.control.reset()];
  for (const stop of stops) {
    const s = setup(); s.fire('pointerdown'); stop(s); s.assertStopped();
    s.fire('pointermove'); s.assertStopped(); s.control.destroy();
  }
});
check('Disable clears movement, updates disabled only on change, and supports a fresh drag after enabling', () => {
  const s = setup(); s.fire('pointerdown');
  s.control.setEnabled(false); s.assertStopped(); assert.equal(s.pad.disabled, true);
  s.control.setEnabled(false); assert.equal(s.disabledWrites(), 1);
  s.fire('pointerdown'); s.assertStopped();
  s.control.setEnabled(true); assert.equal(s.pad.disabled, false);
  s.control.setEnabled(true); assert.equal(s.disabledWrites(), 2);
  s.fire('pointerdown', {pointerId:4}); assert.equal(s.latest().z, 1); s.control.destroy();
});
check('Runtime pause blocks input and stops an existing drag without enabling it again', () => {
  const s = setup(); s.setAllowed(false); s.fire('pointerdown'); s.assertStopped();
  s.setAllowed(true); s.fire('pointerdown'); assert.equal(s.latest().z, 1);
  s.setAllowed(false); s.fire('pointermove'); s.assertStopped();
  s.setAllowed(true); s.fire('pointerdown'); s.setAllowed(false);
  s.control.setEnabled(true); s.assertStopped(); s.control.destroy();
});
check('Destroy releases capture and removes all pad listeners; right mouse button cannot start a drag', () => {
  const s = setup(); s.fire('pointerdown', {pointerType:'mouse', button:2}); s.assertStopped();
  s.fire('pointerdown'); s.control.destroy(); s.assertStopped();
  const count = s.moves.length, result = s.fire('pointerdown');
  assert.equal(result.event.defaultPrevented, false); assert.equal(result.stopped, false);
  s.win.dispatchEvent(new Event('resize')); assert.equal(s.moves.length, count);
  s.control.destroy();
});

console.log(JSON.stringify({ok:true, checks:passed.length, passed}, null, 2));
