import './journey.css';
import {setReferenceImage} from './reference-crops.js';

const REFERENCE_NOTE = '原创 MC 风格主题场景，非文物测绘复原。';
const MAP_REFERENCE_NOTE = '本程暂以访古地图作为观察参考。';
const FAILURE_TEXT = {
  'wrong-answer': '再看看图中的细节，换一个答案试试。答错不会扣分。',
  'out-of-range': '距离观察点有些远了。先走回金色圆环，再来记录。',
  'inactive-scene': '这条记录属于另一站，请先前往对应场景。',
  'invalid-point': '暂时找不到这处观察点，请返回路线重新选择。',
  'unknown-point': '暂时找不到这处观察点，请返回路线重新选择。',
  'invalid-answer': '请选择下方的一个答案。',
  'invalid-position': '请返回场景，走到观察点后重试。',
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, className, action) {
  const node = element('button', className, text);
  node.type = 'button';
  if (action) node.addEventListener('click', action);
  return node;
}

/** DOM-only view: all completion and proximity decisions belong to journey-state. */
export function createJourneyUI({journeys, state, onTravel, onInteract, onAnswer, onReturn, onOpen, onOpenMap}) {
  let active = true, target = {}, observedPoint = null, observingCompleted = false;
  let answerPending = false, observationGeneration = 0, lastTargetKey = '';
  const owned = [], relocations = [];
  const own = node => { owned.push(node); return node; };
  const current = () => journeys.find(journey => journey.id === state.activeId) || journeys[0];
  document.body.classList.add('journey-ui-ready');

  const actions = document.querySelector('.header-actions');
  const routeButton = own(button('访古地图', 'journey-route-button', openMap));
  routeButton.id = 'journeyRoutesButton';
  const returnButton = own(button('返回访古', 'journey-return-button', () => onReturn?.()));
  returnButton.id = 'returnToJourney';
  returnButton.hidden = true;
  actions?.prepend(returnButton, routeButton);

  // Existing handlers stay attached when the controls move into this native disclosure.
  const tools = own(element('details', 'journey-tools'));
  const summary = element('summary', '', '更多');
  summary.setAttribute('aria-label', '更多功能：模型库、留影与视角');
  const toolItems = element('div', 'journey-tool-items');
  for (const node of [...(actions?.children || [])]) {
    if (node === routeButton || node === returnButton || node.id === 'cameraMode') continue;
    relocations.push({node, parent: node.parentNode, next: node.nextSibling});
    toolItems.append(node);
  }
  const mobileCamera = button('切换全景 / 跟随视角', 'journey-mobile-camera', () => document.getElementById('cameraMode')?.click());
  toolItems.prepend(mobileCamera);
  tools.append(summary, toolItems);
  actions?.append(tools);
  toolItems.addEventListener('click', event => {
    if (event.target.closest('button,a')) tools.open = false;
  });
  const closeToolsOutside = event => { if (!tools.contains(event.target)) tools.open = false; };
  document.addEventListener('pointerdown', closeToolsOutside);

  const location = own(element('section', 'journey-location'));
  location.setAttribute('aria-label', '当前访古路线');
  const locationNumber = element('span', 'journey-kicker');
  const locationName = element('h2');
  const locationSubtitle = element('p');
  const stationProgress = element('div', 'journey-station-progress');
  location.append(locationNumber, locationName, locationSubtitle, stationProgress);

  const hud = own(element('aside', 'journey-hud'));
  hud.id = 'journeyHUD';
  hud.setAttribute('aria-label', '当前观察任务');
  const hudHeading = element('div', 'journey-hud-heading');
  const hudKicker = element('span', 'journey-kicker', '下一处 · 观察');
  const hudTotal = element('span', 'journey-hud-total');
  hudHeading.append(hudKicker, hudTotal);
  const targetTitle = element('h3');
  const targetHint = element('p', 'journey-hint');
  const bearing = element('div', 'journey-bearing');
  const bearingIcon = element('span', 'journey-bearing-icon', '◇');
  bearingIcon.setAttribute('aria-hidden', 'true');
  const bearingText = element('span');
  const distanceText = element('strong');
  bearing.append(bearingIcon, bearingText, distanceText);
  const interactButton = button('向金色圆环出发', 'journey-primary', () => {
    if (target.complete) openRoutes(); else onInteract?.();
  });
  interactButton.id = 'journeyInteract';
  interactButton.disabled = true;
  const hudHelp = element('small', 'journey-hud-help', '沿金色光点前进 · 到达后按 E 观察');
  hud.append(hudHeading, targetTitle, targetHint, bearing, interactButton, hudHelp);
  document.body.append(location, hud);

  const routeDialog = own(element('dialog', 'journey-dialog journey-routes'));
  routeDialog.id = 'journeyRoutes';
  routeDialog.setAttribute('aria-labelledby', 'journeyRouteTitle');
  const routeHead = element('div', 'journey-dialog-head');
  const routeTitles = element('div');
  const routeTitle = element('h2', '', '山河游记');
  routeTitle.id = 'journeyRouteTitle';
  routeTitles.append(element('span', 'journey-kicker', `${journeys.length} 程山河 · ${journeys.reduce((sum, entry) => sum + entry.points.length, 0)} 处发现`), routeTitle,
    element('p', '', '走进一处风景，辨认一个细节，把故事收进游记。'));
  const mapRoutes = button('地图选路线 →', 'journey-route-go journey-map-link', openMap);
  mapRoutes.id = 'journeyMapLink';
  mapRoutes.hidden = typeof onOpenMap !== 'function';
  routeTitles.append(mapRoutes);
  const closeRoutes = button('×', 'journey-close', () => routeDialog.close());
  closeRoutes.setAttribute('aria-label', '关闭访古路线');
  routeHead.append(routeTitles, closeRoutes);
  const journeyProgress = element('div', 'journey-overall-progress');
  journeyProgress.setAttribute('role', 'status');
  const routeGrid = element('div', 'journey-route-grid');
  const journalHead = element('div', 'journey-journal-heading');
  journalHead.append(element('h3', '', '随行游记'), element('p', '', '已记录的细节可以随时重温。'));
  const journal = element('div', 'journey-journal');
  routeDialog.append(routeHead, journeyProgress, routeGrid, journalHead, journal,
    element('p', 'journey-reference-note', REFERENCE_NOTE));
  document.body.append(routeDialog);

  const observation = own(element('dialog', 'journey-dialog journey-observation'));
  observation.id = 'journeyObservation';
  observation.setAttribute('aria-labelledby', 'journeyObservationTitle');
  const observationHead = element('div', 'journey-dialog-head');
  const observationTitles = element('div');
  const observationKicker = element('span', 'journey-kicker');
  const observationTitle = element('h2');
  observationTitle.id = 'journeyObservationTitle';
  observationTitles.append(observationKicker, observationTitle);
  const closeObservationButton = button('×', 'journey-close', closeObservation);
  closeObservationButton.setAttribute('aria-label', '关闭观察，继续漫游');
  observationHead.append(observationTitles, closeObservationButton);
  const observationLayout = element('div', 'journey-observation-layout');
  const figure = element('figure', 'journey-reference');
  const referenceViewport = element('div', 'journey-reference-viewport');
  const reference = element('img');
  reference.loading = 'lazy';
  referenceViewport.append(reference);
  const imageError = element('p', 'journey-image-error', '图片暂未载入。可先阅读观察线索，稍后再次查看。');
  imageError.hidden = true;
  reference.addEventListener('error', () => { imageError.hidden = false; });
  reference.addEventListener('load', () => { imageError.hidden = true; });
  const imageViewer = own(element('dialog', 'journey-dialog journey-reference-viewer'));
  imageViewer.setAttribute('aria-label', '观察图片大图');
  const closeImageViewer = button('关闭大图', 'journey-viewer-close', () => imageViewer.close());
  const viewerViewport = element('div', 'journey-reference-viewport');
  const viewerImage = element('img');
  viewerViewport.append(viewerImage);
  imageViewer.append(closeImageViewer, viewerViewport);
  document.body.append(imageViewer);
  const expandReference = button('查看大图', 'journey-expand-reference', () => {
    setReferenceImage(viewerViewport, viewerImage, reference.getAttribute('src'), reference.alt);
    const [width, height] = (viewerViewport.style.aspectRatio || '4 / 3').split('/').map(Number);
    imageViewer.style.setProperty('--viewer-ratio', String(width / height));
    showDialog(imageViewer, closeImageViewer);
  });
  expandReference.setAttribute('aria-haspopup', 'dialog');
  const referenceCaption = element('figcaption');
  figure.append(referenceViewport, imageError, referenceCaption, expandReference);
  const questionArea = element('section', 'journey-question-area');
  const questionHint = element('p', 'journey-question-hint');
  const question = element('h3');
  question.id = 'journeyQuestion';
  const answers = element('div', 'journey-answers');
  answers.setAttribute('role', 'group');
  answers.setAttribute('aria-labelledby', 'journeyQuestion');
  const feedback = element('div', 'journey-feedback');
  feedback.id = 'journeyFeedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  const continueButton = button('继续探索 →', 'journey-primary journey-continue', closeObservation);
  continueButton.hidden = true;
  const observationNote = element('small', 'journey-reference-note', REFERENCE_NOTE);
  questionArea.append(questionHint, question, answers, feedback, continueButton, observationNote);
  observationLayout.append(figure, questionArea);
  observation.append(observationHead, observationLayout);
  document.body.append(observation);
  observation.addEventListener('close', () => { observationGeneration++; answerPending = false; });

  function showDialog(dialog, focusTarget) {
    tools.open = false;
    onOpen?.();
    if (!dialog.open) dialog.showModal();
    queueMicrotask(() => { if (dialog.open) (focusTarget || dialog.querySelector('button'))?.focus({preventScroll: true}); });
  }

  function refresh() {
    const journey = current();
    const localProgress = state.progress(journey.id), total = state.progress();
    locationNumber.textContent = `第 ${String(journeys.indexOf(journey) + 1).padStart(2, '0')} 程 / ${String(journeys.length).padStart(2, '0')}`;
    locationName.textContent = journey.name;
    locationSubtitle.textContent = journey.subtitle || journey.region;
    stationProgress.replaceChildren();
    for (const point of journey.points) {
      const dot = element('span', state.has(point.id) ? 'is-recorded' : '');
      dot.textContent = state.has(point.id) ? '✓' : '·';
      dot.title = `${point.title}：${state.has(point.id) ? '已记录' : '待发现'}`;
      stationProgress.append(dot);
    }
    stationProgress.append(element('small', '', `${localProgress.done} / ${localProgress.total} 处已记录`));
    hudTotal.textContent = `${total.done} / ${total.total}`;
    hudTotal.title = '全旅程收集进度';
    routeButton.textContent = total.done === total.total ? '访古地图 · 全收集' : '访古地图';
    journeyProgress.textContent = total.done === total.total
      ? `✓ ${total.total} 处发现已入册。山河有尽，回望仍有新意。`
      : `游记已收集 ${total.done} / ${total.total} · 自由选站，进度会保存在当前浏览器`;
    journeyProgress.classList.toggle('is-complete', total.done === total.total);
    routeGrid.replaceChildren();
    journal.replaceChildren();
    journeys.forEach((entry, index) => {
      const progress = state.progress(entry.id);
      const card = element('article', `journey-route-card${entry.id === state.activeId ? ' is-current' : ''}`);
      const number = element('span', 'journey-route-number', String(index + 1).padStart(2, '0'));
      const cardMeta = element('div', 'journey-route-meta');
      cardMeta.append(element('span', '', entry.region), element('b', '', `${progress.done} / ${progress.total}`));
      card.append(number, cardMeta, element('h3', '', entry.name), element('p', '', entry.intro || entry.subtitle));
      const miniSteps = element('div', 'journey-mini-steps');
      entry.points.forEach(point => miniSteps.append(element('span', state.has(point.id) ? 'is-recorded' : '', state.has(point.id) ? '✓' : '○')));
      const go = button(entry.id === state.activeId && active ? '继续这一程 →' : '前往这一程 →', 'journey-route-go', () => {
        routeDialog.close();
        onTravel?.(entry.id);
      });
      go.dataset.journey = entry.id;
      card.append(miniSteps, go);
      routeGrid.append(card);

      const section = element('section', 'journey-journal-section');
      section.append(element('h4', '', entry.name));
      entry.points.forEach(point => {
        const completed = state.has(point.id);
        const record = button('', `journey-record${completed ? ' is-recorded' : ''}`, () => openObservation(point, {completed: true}));
        record.disabled = !completed;
        record.append(element('span', '', `${completed ? '✓' : '○'}  ${point.title}`), element('small', '', completed ? '重温 →' : '待发现'));
        section.append(record);
      });
      journal.append(section);
    });
    lastTargetKey = '';
    if (Object.keys(target).length) updateTarget(target);
  }

  function setMode(isActive) {
    active = Boolean(isActive);
    document.body.classList.toggle('journey-mode', active);
    location.hidden = hud.hidden = !active;
    returnButton.hidden = active;
    if (!active) closeObservation();
    refresh();
  }

  function updateTarget(next) {
    target = next || {};
    const distance = Number.isFinite(target.distance) ? Math.max(0, Math.round(target.distance)) : null;
    const key = JSON.stringify([target.title, target.hint, distance, target.ready, target.complete, target.direction]);
    if (key === lastTargetKey) return;
    lastTargetKey = key;
    hud.classList.toggle('is-ready', Boolean(target.ready));
    hud.classList.toggle('is-complete', Boolean(target.complete));
    hudKicker.textContent = target.complete ? '本程 · 已入册' : '下一处 · 观察';
    targetTitle.textContent = target.complete ? '这一程，已看见。' : target.title || '寻找第一处细节';
    targetHint.textContent = target.complete ? '本程的发现已收好。继续漫游，或翻开路线前往下一站。' : target.hint || '沿金色光点，走到观察圆环。';
    bearing.hidden = Boolean(target.complete);
    bearingText.textContent = target.ready ? '已到达观察点' : target.direction || '寻找金色圆环';
    distanceText.textContent = target.ready ? '可观察' : distance === null ? '—' : `${distance} m`;
    interactButton.disabled = !target.ready && !target.complete;
    interactButton.textContent = target.complete ? '选择下一程 →' : target.ready ? 'E · 观察并记入游记' : '走近后即可观察';
    hudHelp.textContent = target.complete ? '在「访古地图 → 游记与路线」重温已发现的内容' : '沿金色光点前进 · 到达后按 E 观察';
  }

  function openMap() {
    if (typeof onOpenMap !== 'function') { openRoutes(); return; }
    tools.open = false;
    closeObservation();
    if (routeDialog.open) routeDialog.close();
    onOpen?.();
    onOpenMap();
  }

  function openRoutes() {
    closeObservation();
    for (const dialog of document.querySelectorAll('dialog[open]')) if (dialog !== routeDialog) dialog.close();
    refresh();
    showDialog(routeDialog, routeGrid.querySelector(`[data-journey="${state.activeId}"]`));
  }

  function openObservation(point, {completed = false} = {}) {
    if (!point) return;
    observedPoint = point;
    observingCompleted = Boolean(completed && state.has(point.id));
    answerPending = false;
    observationGeneration++;
    const journey = journeys.find(entry => entry.points.some(p => p.id === point.id)) || current();
    observationKicker.textContent = `${journey.name} · ${observingCompleted ? '游记重温' : '发现一处细节'}`;
    observationTitle.textContent = point.title;
    const referenceKind = point.referenceKind || journey.referenceKind || 'game';
    const fromMap = referenceKind === 'map';
    const referenceLabel = fromMap ? '访古地图' : referenceKind === 'photo' ? '建筑照片' : '游戏画面';
    setReferenceImage(referenceViewport, reference, point.reference || journey.reference,
      `${journey.name}：${point.title} · ${referenceLabel}`);
    referenceCaption.hidden = !fromMap;
    referenceCaption.textContent = fromMap ? '访古地图 · 本程造型参考' : '';
    observationNote.textContent = fromMap ? MAP_REFERENCE_NOTE : REFERENCE_NOTE;
    imageError.hidden = true;
    questionHint.textContent = point.hint || '看看场景，再对照图片里的建筑。';
    question.textContent = point.question;
    answers.replaceChildren();
    answers.hidden = observingCompleted;
    feedback.replaceChildren();
    feedback.className = 'journey-feedback';
    continueButton.hidden = true;
    continueButton.textContent = routeDialog.open ? '返回游记 →' : '继续探索 →';
    point.options.forEach((option, index) => {
      const choice = button('', 'journey-answer', async () => {
        if (answerPending || observingCompleted) return;
        answerPending = true;
        const generation = observationGeneration;
        for (const node of answers.children) node.disabled = true;
        let result;
        try { result = await onAnswer?.(index); }
        catch { result = {ok: false, reason: 'unavailable'}; }
        if (generation !== observationGeneration || !observation.open) return;
        answerPending = false;
        for (const node of answers.children) node.disabled = false;
        showAnswer(result || {ok: false, reason: 'unavailable'}, point);
      });
      choice.dataset.answer = String(index);
      choice.append(element('span', 'journey-answer-letter', String.fromCharCode(65 + index)), element('span', '', option));
      answers.append(choice);
    });
    if (observingCompleted) showAnswer({ok: true, already: true, saved: true}, point);
    showDialog(observation, closeObservationButton);
    observation.scrollTop = 0;
  }

  function showAnswer(result, point = observedPoint) {
    if (!point || point.id !== observedPoint?.id) return;
    feedback.replaceChildren();
    feedback.classList.toggle('is-success', Boolean(result?.ok));
    feedback.classList.toggle('is-error', !result?.ok);
    if (!result?.ok) {
      feedback.append(element('p', '', FAILURE_TEXT[result?.reason] || '这次未能记录，请稍后再试。'));
      feedback.scrollIntoView({block: 'nearest'});
      return;
    }
    observingCompleted = true;
    for (const node of answers.children) {
      node.disabled = true;
      node.classList.toggle('is-correct', Number(node.dataset.answer) === point.answer);
    }
    feedback.append(element('strong', '', result.already ? '✓ 已收入游记' : '✓ 新发现，已入册'), element('p', '', point.explanation));
    if (result.saved === false) feedback.append(element('small', '', '本次已记录。浏览器暂不能保存，关闭页面后可能丢失。'));
    continueButton.hidden = false;
    refresh();
    continueButton.focus({preventScroll: true});
    continueButton.scrollIntoView({block: 'nearest'});
  }

  function closeObservation() {
    if (imageViewer.open) imageViewer.close();
    if (observation.open) observation.close();
  }

  function destroy() {
    closeObservation();
    if (routeDialog.open) routeDialog.close();
    document.removeEventListener('pointerdown', closeToolsOutside);
    for (const {node, parent, next} of relocations.reverse()) {
      if (next?.parentNode === parent) parent.insertBefore(node, next); else parent.append(node);
    }
    owned.forEach(node => node.remove());
    document.body.classList.remove('journey-mode', 'journey-ui-ready');
  }

  setMode(true);
  return {setMode, refresh, updateTarget, openObservation, showAnswer, closeObservation, openRoutes, destroy};
}
