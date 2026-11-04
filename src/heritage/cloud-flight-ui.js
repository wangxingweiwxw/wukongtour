import './cloud-flight.css';

// A small capability-specific dock; the game pushes state rather than letting
// the UI read the controller or own a render loop. Altitude is deliberately not
// a live region, so screen readers are not interrupted every tenth of a second.
export function createCloudFlightUI({onToggle, onVertical = () => {}}) {
  const panel = document.createElement('aside');
  panel.id = 'cloudFlightPanel';
  panel.className = 'cloud-flight-panel';
  panel.setAttribute('aria-label', '筋斗云游览控制');
  panel.hidden = true;
  panel.innerHTML = `<div class="cloud-flight-heading"><span>悬空寺 · 腾云游览</span><span class="cloud-flight-altitude" hidden></span></div>
    <button type="button" class="cloud-flight-toggle" id="cloudFlightToggle"><kbd>G</kbd> <span>上筋斗云</span></button>
    <p class="cloud-flight-intro">乘云近看岩层与层檐</p>
    <p class="cloud-flight-keys" hidden><span><kbd>W A S D</kbd> 飘行 <kbd>Shift</kbd> 加速</span><span><kbd>Space</kbd> 上升 <kbd>Q</kbd> 下降</span></p>
    <div class="cloud-flight-vertical" aria-label="筋斗云升降" hidden><button type="button" data-vertical="1" aria-label="按住上升筋斗云" aria-pressed="false">↑ 上升</button><button type="button" data-vertical="-1" aria-label="按住下降筋斗云" aria-pressed="false">↓ 下降</button></div>`;
  document.body.append(panel);
  const toggle = panel.querySelector('.cloud-flight-toggle');
  const toggleText = toggle.querySelector('span');
  const toggleKey = toggle.querySelector('kbd');
  const altitudeText = panel.querySelector('.cloud-flight-altitude');
  const intro = panel.querySelector('.cloud-flight-intro');
  const keys = panel.querySelector('.cloud-flight-keys');
  const verticalControls = panel.querySelector('.cloud-flight-vertical');
  const verticalButtons = [...verticalControls.querySelectorAll('button')];
  const pointers = new Map(), keyboard = new Set();
  let lastState = '', lastAltitude = '', available = false, lastVertical = 0;

  function publishVertical() {
    const held = [...pointers.values(), ...keyboard];
    const direction = available ? Math.sign(held.reduce((total, value) => total + value, 0)) : 0;
    if (direction !== lastVertical) { lastVertical = direction; onVertical(direction); }
    for (const button of verticalButtons) {
      button.setAttribute('aria-pressed', String(available && held.includes(Number(button.dataset.vertical))));
    }
  }
  function release() {
    if (!pointers.size && !keyboard.size && !lastVertical) return;
    pointers.clear(); keyboard.clear(); publishVertical();
  }
  function visibilityChanged() { if (document.hidden) release(); }

  toggle.onclick = () => { if (!toggle.disabled) { release(); onToggle(); toggle.blur(); } };
  toggle.onkeydown = event => {
    // Keep native button activation while preventing Space from also ascending.
    if (event.code === 'Space' || event.code === 'Enter') event.stopPropagation();
  };
  for (const button of verticalButtons) {
    const direction = Number(button.dataset.vertical);
    button.onpointerdown = event => {
      if (!available || button.disabled) return;
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, direction); publishVertical();
    };
    const pointerRelease = event => { pointers.delete(event.pointerId); publishVertical(); };
    button.onpointerup = button.onpointercancel = button.onlostpointercapture = pointerRelease;
    button.onkeydown = event => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault(); event.stopPropagation();
      if (available) { keyboard.add(direction); publishVertical(); }
    };
    button.onkeyup = event => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault(); event.stopPropagation(); keyboard.delete(direction); publishVertical();
    };
    button.onblur = () => { keyboard.delete(direction); publishVertical(); };
    button.oncontextmenu = event => event.preventDefault();
  }
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', visibilityChanged);

  function update({enabled = false, active = false, status = 'off', altitude = 0, paused = false}) {
    const landing = status === 'landing', takingOff = status === 'takeoff';
    available = enabled && active && !landing && !takingOff && !paused;
    if (!available) release();
    const stateKey = [enabled, active, landing, takingOff, paused].join('/');
    if (stateKey !== lastState) {
      lastState = stateKey;
      panel.hidden = !enabled;
      panel.classList.toggle('is-airborne', active);
      document.body.classList.toggle('cloud-flight-enabled', enabled);
      document.body.classList.toggle('cloud-flight-airborne', enabled && active);
      toggleText.textContent = landing ? '正在落地' : takingOff ? '正在起云' : active ? '落地' : '上筋斗云';
      toggleKey.hidden = landing || takingOff;
      toggle.disabled = !enabled || paused || landing || takingOff;
      toggle.setAttribute('aria-label', landing ? '筋斗云正在落地' : takingOff ? '筋斗云正在起飞' : active ? '按 G 落地' : '按 G 上筋斗云');
      altitudeText.hidden = !active;
      intro.hidden = active;
      keys.hidden = !active;
      verticalControls.hidden = !active;
      for (const button of verticalButtons) button.disabled = !available;
    }
    if (enabled && active) {
      const value = `${Math.max(0, Number.isFinite(altitude) ? altitude : 0).toFixed(1)} m`;
      if (value !== lastAltitude) {
        lastAltitude = value;
        altitudeText.textContent = value;
        altitudeText.setAttribute('aria-label', `离地高度 ${value}`);
      }
    }
  }
  function destroy() {
    available = false; release();
    window.removeEventListener('blur', release);
    document.removeEventListener('visibilitychange', visibilityChanged);
    document.body.classList.remove('cloud-flight-enabled', 'cloud-flight-airborne');
    panel.remove();
  }
  return {update, destroy};
}
