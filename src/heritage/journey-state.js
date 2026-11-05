import {JOURNEYS} from './journey-data.js';

export const JOURNEY_SAVE_KEY = 'wukong-journey-v1';
export const OBSERVATION_RADIUS = 2.4;
const SAVE_VERSION = 2;
const journeys = new Map(JOURNEYS.map(journey => [journey.id, journey]));
const points = new Map(JOURNEYS.flatMap(journey => journey.points.map(point => [point.id, {point, sceneId: journey.id}])));

/** A small, engine-independent save state. Storage is injected for private-mode handling and tests. */
export function createJourneyState(storage) {
  let activeId = JOURNEYS[0].id;
  const completed = new Set();
  // A future save must not be overwritten by an older client, even after playing a new session.
  let writable = true;
  let saved = false;

  try {
    const raw = storage?.getItem(JOURNEY_SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (Number.isInteger(data.version) && data.version > SAVE_VERSION) writable = false;
        if (data.version === 1 || data.version === SAVE_VERSION) {
          if (journeys.has(data.activeId)) activeId = data.activeId;
          if (Array.isArray(data.completed)) {
            for (let id of data.completed) {
              if (typeof id !== 'string') continue;
              // Version 1's original Kaiyuan stop 1 was removed. The gate stop
              // formerly numbered 4 now owns id 1; never award it for old stop 1.
              if (data.version === 1 && id === 'kaiyuan-1') continue;
              if (data.version === 1 && id === 'kaiyuan-4') id = 'kaiyuan-1';
              if (points.has(id)) completed.add(id);
            }
          }
          saved = data.version === SAVE_VERSION;
        }
      }
    }
  } catch {
    // Denied storage and malformed JSON must never prevent the game from starting.
  }

  function persist() {
    saved = false;
    if (!writable || typeof storage?.setItem !== 'function') return saved;
    try {
      // localStorage.setItem replaces one complete string atomically; a failed write keeps the old value.
      storage.setItem(JOURNEY_SAVE_KEY, JSON.stringify({version: SAVE_VERSION, activeId, completed: [...completed]}));
      saved = true;
    } catch {
      // The in-memory collection remains usable even when quota/privacy settings reject persistence.
    }
    return saved;
  }

  const reject = reason => ({ok: false, reason, already: false, saved});
  return {
    get activeId() { return activeId; },
    get completed() { return [...completed]; },
    has(id) { return completed.has(id); },
    travel(sceneId) {
      if (!journeys.has(sceneId)) return false;
      activeId = sceneId;
      persist();
      return true;
    },
    submit(pointId, answerIndex, player, pointPosition) {
      const entry = points.get(pointId);
      if (!entry) return reject('unknown-point');
      if (entry.sceneId !== activeId) return reject('inactive-scene');
      if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)
        || !Array.isArray(pointPosition) || pointPosition.length !== 3
        || ![...pointPosition].every(Number.isFinite)) return reject('invalid-position');
      // Legacy callers omit y and remain ground-based; flying players must also
      // be physically near the observation, not merely directly above it.
      if (player.y !== undefined && !Number.isFinite(player.y)) return reject('invalid-position');
      if (Math.hypot(player.x - pointPosition[0], (player.y ?? 0) - pointPosition[1], player.z - pointPosition[2]) > OBSERVATION_RADIUS) return reject('out-of-range');
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= entry.point.options.length) return reject('invalid-answer');
      if (answerIndex !== entry.point.answer) return reject('wrong-answer');
      if (completed.has(pointId)) return {ok: true, reason: 'already-complete', already: true, saved: saved || persist()};
      completed.add(pointId);
      return {ok: true, reason: 'collected', already: false, saved: persist()};
    },
    progress(sceneId) {
      const candidates = sceneId === undefined ? [...points.keys()] : journeys.get(sceneId)?.points.map(point => point.id) || [];
      return {done: candidates.filter(id => completed.has(id)).length, total: candidates.length};
    },
    nextPoint(sceneId = activeId) {
      return journeys.get(sceneId)?.points.find(point => !completed.has(point.id)) || null;
    },
  };
}
