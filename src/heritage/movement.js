// Metres per second; direction normalization belongs to the input controller.
export const WALK_SPEED = 4.8;
export const RUN_SPEED = 8;
const MAX_FRAME_SECONDS = .1;
const MAX_MOVE_STEP = .04;

// Preserve elapsed time down to 10 fps, while limiting a resume/loading hitch.
export function frameDelta(seconds) {
  return Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, MAX_FRAME_SECONDS)) : 0;
}

// Legacy flat scenes expose a point collision predicate rather than surfaces.
// Their obstacle boxes already include staff clearance, much wider than 4cm.
// This is bounded discrete movement, not CCD for arbitrarily thin geometry.
export function substepMove(position, deltaX, deltaZ, canMove) {
  if (!position || ![position.x, position.z, deltaX, deltaZ].every(Number.isFinite)) {
    return {moved: false, blocked: true};
  }
  const oldX = position.x, oldZ = position.z;
  const count = Math.max(1, Math.ceil(Math.hypot(deltaX, deltaZ) / MAX_MOVE_STEP));
  const dx = deltaX / count, dz = deltaZ / count;
  let blocked = false;
  for (let i = 0; i < count; i++) {
    if (dx !== 0) {
      const x = position.x + dx;
      if (canMove(x, position.z)) position.x = x; else blocked = true;
    }
    if (dz !== 0) {
      const z = position.z + dz;
      if (canMove(position.x, z)) position.z = z; else blocked = true;
    }
  }
  return {moved: position.x !== oldX || position.z !== oldZ, blocked};
}
