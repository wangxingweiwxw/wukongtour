import './compound.css';

const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const action = (text, className, handler) => {
  const node = make('button', className, text);
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
};

/** Presentation for the compound. Camera, movement and navigation live in the controller. */
export function createCompoundUI({onEnter, onWalk, onOverview, onInspect, onRoofToggle, onFocusNext, onReset, onExit, onExport, onRestore}) {
  let active = false, mode = 'walk', buildings = [], selectedId = '', roofHidden = false;
  let nearby = {}, route = {}, lastNearby = '', lastRoute = '';
  let worldName = '古建群';
  const actions = document.querySelector('.header-actions');

  const enter = action('', 'compound-enter', () => onEnter?.());
  enter.id = 'compoundEnter';
  enter.append(make('span', 'compound-desktop-label', '古建群漫游'), make('span', 'compound-mobile-label', '古建群'));
  enter.setAttribute('aria-label', '进入古建群漫游');
  const exit = action('返回访古', 'compound-exit', () => onExit?.());
  exit.id = 'compoundExit';
  exit.hidden = true;
  actions?.prepend(enter, exit);

  const panel = make('section', 'compound-panel');
  panel.id = 'compoundPanel';
  panel.hidden = true;
  panel.setAttribute('aria-label', '古建群漫游与建筑观察');
  const head = make('div', 'compound-panel-head');
  const heading = make('span', 'compound-kicker', '古建群 · 街巷漫游');
  const settings = make('details', 'compound-settings');
  const summary = make('summary', '', '查看设置');
  summary.setAttribute('aria-label', '建筑选择、屋顶与漫游设置');
  const settingsContent = make('div', 'compound-settings-content');
  const buildingLabel = make('label', 'compound-building-label', '挑一座古建，旋转细看');
  const select = make('select');
  select.id = 'compoundBuilding';
  select.setAttribute('aria-label', '选择单体建筑');
  select.addEventListener('change', () => { if (select.value) onInspect?.(select.value); });
  buildingLabel.append(select);
  const description = make('p', 'compound-building-description');
  const settingsActions = make('div', 'compound-settings-actions');
  const roof = action('揭开屋顶', 'compound-soft-button', () => onRoofToggle?.());
  roof.id = 'compoundRoofToggle';
  roof.setAttribute('aria-pressed', 'false');
  const reset = action('回到入口', 'compound-soft-button', () => { settings.open = false; onReset?.(); });
  reset.id = 'compoundReset';
  const nearbyInspect = action('细看附近古建', 'compound-soft-button', inspectNearby);
  nearbyInspect.id = 'compoundNearbyInspect';
  const exportModel = action('导出古建群 GLB', 'compound-soft-button', () => onExport?.());
  exportModel.id = 'compoundExport';
  const restore = action('返回内置古建群', 'compound-soft-button', () => onRestore?.());
  restore.id = 'compoundRestore';
  restore.hidden = true;
  const settingsHint = make('p', 'compound-settings-hint', 'WASD 行走 · Shift 奔跑 · V 细看附近古建 · C 全景 · Esc 回漫游。查看时暂停人物，拖动旋转、滚轮缩放。');
  settingsActions.append(roof, reset, nearbyInspect, exportModel, restore);
  settingsContent.append(buildingLabel, description, settingsActions, settingsHint);
  settings.append(summary, settingsContent);
  head.append(heading, settings);

  const modes = make('div', 'compound-modes');
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', '场景查看模式');
  const walkButton = action('悟空漫游', 'compound-mode-button', () => onWalk?.());
  const overviewButton = action('建筑群全景', 'compound-mode-button', () => onOverview?.());
  const inspectButton = action('单体细看', 'compound-mode-button', () => {
    const chosen = buildings.find(item => item.id === selectedId) || buildings.find(item => item.name === nearby.name) || buildings[0];
    if (chosen) onInspect?.(chosen.id);
  });
  walkButton.id = 'compoundWalk';
  overviewButton.id = 'compoundOverview';
  inspectButton.id = 'compoundInspect';
  const modeButtons = {walk: walkButton, overview: overviewButton, inspect: inspectButton};
  modes.append(walkButton, overviewButton, inspectButton);

  const context = make('div', 'compound-context');
  const contextText = make('div', 'compound-context-text');
  const contextName = make('strong');
  const contextSub = make('small');
  contextText.append(contextName, contextSub);
  const next = action('', 'compound-next', () => onFocusNext?.());
  next.id = 'compoundNext';
  next.append(make('span', 'compound-desktop-label', '前往下一处 →'), make('span', 'compound-mobile-label', '下一处 →'));
  next.setAttribute('aria-label', '为下一处地标显示行走指引');
  const resume = action('回到漫游', 'compound-next', () => onWalk?.());
  resume.id = 'compoundResume';
  context.append(contextText, next, resume);

  const nearRow = make('div', 'compound-nearby');
  const nearText = make('span');
  const nearButton = action('V · 细看', 'compound-nearby-action', inspectNearby);
  nearRow.append(nearText, nearButton);
  panel.append(head, modes, context, nearRow);
  document.body.append(panel);

  function inspectNearby() {
    const chosen = buildings.find(item => item.name === nearby.name);
    if (chosen) { settings.open = false; onInspect?.(chosen.id); }
  }

  function renderContext() {
    const selected = buildings.find(item => item.id === selectedId);
    const hasNearby = typeof nearby.name === 'string' && nearby.name.length > 0;
    const distance = Number.isFinite(nearby.distance) ? `${Math.max(0, Math.round(nearby.distance))} m` : '';
    const proximity = hasNearby ? `${nearby.inside ? '正在堂内' : '邻近'} · ${nearby.name}${distance && !nearby.inside ? ` · ${distance}` : ''}` : '沿街巷寻访古建';
    if (mode === 'walk') {
      contextName.textContent = route.complete ? '这一圈，已走遍' : route.name || '从山门开始，走进古建群';
      contextSub.textContent = route.total ? `${route.index ?? 0} / ${route.total} · ${proximity}` : proximity;
      heading.textContent = worldName;
    } else {
      contextName.textContent = mode === 'inspect' ? selected?.name || '选择一座古建' : '屋檐、庭院与街巷';
      contextSub.textContent = '人物已暂停 · 拖动旋转 / 滚轮缩放';
      heading.textContent = `${worldName} · ${mode === 'inspect' ? '单体细看' : '俯瞰全景'}`;
    }
    contextName.title = contextName.textContent;
    contextSub.title = contextSub.textContent;
    nearText.textContent = proximity;
    nearButton.disabled = nearbyInspect.disabled = !buildings.some(item => item.name === nearby.name);
    nearRow.hidden = mode !== 'walk';
    next.hidden = mode !== 'walk';
    next.disabled = Boolean(route.complete);
    resume.hidden = mode === 'walk';
    description.textContent = selected?.description || '从列表中挑选单体；查看完可回到悟空身边继续行走。';
    inspectButton.disabled = !buildings.length;
    roof.textContent = roofHidden ? '恢复屋顶' : '揭开屋顶';
    roof.setAttribute('aria-pressed', String(roofHidden));
  }

  function setActive(value) {
    active = Boolean(value);
    document.body.classList.toggle('compound-mode', active);
    panel.hidden = !active;
    enter.hidden = active;
    exit.hidden = !active;
    if (!active) settings.open = false;
    renderContext();
  }

  function setMode(value) {
    if (!(value in modeButtons)) return;
    mode = value;
    panel.dataset.mode = value;
    document.body.dataset.compoundView = value;
    for (const [name, node] of Object.entries(modeButtons)) {
      node.classList.toggle('is-active', name === value);
      node.setAttribute('aria-pressed', String(name === value));
    }
    settings.open = false;
    renderContext();
  }

  function setBuildings(value) {
    buildings = Array.isArray(value) ? value.filter(item => item?.id && item?.name) : [];
    if (!buildings.some(item => item.id === selectedId)) selectedId = buildings[0]?.id || '';
    select.replaceChildren();
    for (const building of buildings) {
      const option = make('option', '', building.name);
      option.value = building.id;
      select.append(option);
    }
    select.disabled = !buildings.length;
    select.value = selectedId;
    renderContext();
  }

  function setSelection(buildingId) {
    if (!buildings.some(item => item.id === buildingId)) return;
    selectedId = buildingId;
    select.value = buildingId;
    renderContext();
  }

  function setNearby(value) {
    const nextValue = value || {};
    const key = JSON.stringify([nextValue.name, Number.isFinite(nextValue.distance) ? Math.round(nextValue.distance) : null, nextValue.inside]);
    if (key === lastNearby) return;
    lastNearby = key;
    nearby = nextValue;
    renderContext();
  }

  function setRoute(value) {
    const key = JSON.stringify(value || {});
    if (key === lastRoute) return;
    lastRoute = key;
    route = value || {};
    renderContext();
  }

  function setRoofHidden(value) { roofHidden = Boolean(value); renderContext(); }
  function setWorld(world) {
    worldName = world.displayName || '古建群';
    restore.hidden = !world.imported;
    renderContext();
  }
  const closeSettings = event => { if (!settings.contains(event.target)) settings.open = false; };
  const closeOnEscape = event => { if (event.code === 'Escape') settings.open = false; };
  document.addEventListener('pointerdown', closeSettings);
  document.addEventListener('keydown', closeOnEscape);

  function destroy() {
    document.removeEventListener('pointerdown', closeSettings);
    document.removeEventListener('keydown', closeOnEscape);
    enter.remove(); exit.remove(); panel.remove();
    document.body.classList.remove('compound-mode');
    delete document.body.dataset.compoundView;
  }

  setMode('walk');
  setActive(false);
  return {setActive, setMode, setBuildings, setSelection, setNearby, setRoofHidden, setRoute, setWorld, destroy};
}
