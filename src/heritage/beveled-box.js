import {BufferGeometry, Float32BufferAttribute, Vector3} from 'three';

/**
 * A centred box with one planar chamfer on every edge, kept inside w × h × d.
 * Six face quads, twelve edge quads and eight corner triangles = 44 triangles.
 * Vertices are split at each planar patch for flat normals, with a regular index
 * and position/normal/uv attributes compatible with BoxGeometry batch merging.
 * Bevel must be positive; oversized requests are clamped to preserve every face.
 */
export function beveledBoxGeometry(w, h, d, bevel = .006) {
  if (![w, h, d, bevel].every(Number.isFinite) || Math.min(w, h, d, bevel) <= 0) {
    throw new RangeError('Beveled box dimensions and bevel must be finite and positive');
  }
  const half = [w / 2, h / 2, d / 2];
  const amount = Math.min(bevel, Math.min(w, h, d) * .499);
  const inner = half.map(value => value - amount);
  const positions = [], normals = [], uvs = [], indices = [];
  const ab = new Vector3(), ac = new Vector3(), outward = new Vector3();

  function patch(vertices, direction) {
    outward.fromArray(direction).normalize();
    ab.fromArray(vertices[1]).sub(new Vector3(...vertices[0]));
    ac.fromArray(vertices[2]).sub(new Vector3(...vertices[0]));
    if (ab.cross(ac).dot(outward) < 0) vertices.reverse();
    const first = positions.length / 3;
    const coordinates = vertices.length === 3
      ? [[0, 0], [1, 0], [.5, 1]]
      : [[0, 0], [1, 0], [1, 1], [0, 1]];
    vertices.forEach((vertex, index) => {
      positions.push(...vertex); normals.push(...outward); uvs.push(...coordinates[index]);
    });
    indices.push(first, first + 1, first + 2);
    if (vertices.length === 4) indices.push(first, first + 2, first + 3);
  }

  // Main faces: the original box plane, inset by the bevel along both edges.
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3;
    const vertices = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sa, sb]) => {
      const vertex = [0, 0, 0];
      vertex[axis] = sign * half[axis]; vertex[a] = sa * inner[a]; vertex[b] = sb * inner[b];
      return vertex;
    });
    const normal = [0, 0, 0]; normal[axis] = sign;
    patch(vertices, normal);
  }

  // Four chamfers parallel to each axis. The endpoints meet the corner triangles.
  for (let axis = 0; axis < 3; axis++) for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3;
    const vertices = [[-1, false], [1, false], [1, true], [-1, true]].map(([end, otherFace]) => {
      const vertex = [0, 0, 0];
      vertex[axis] = end * inner[axis];
      vertex[a] = sa * (otherFace ? inner[a] : half[a]);
      vertex[b] = sb * (otherFace ? half[b] : inner[b]);
      return vertex;
    });
    const normal = [0, 0, 0]; normal[a] = sa; normal[b] = sb;
    patch(vertices, normal);
  }

  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    patch([
      [sx * half[0], sy * inner[1], sz * inner[2]],
      [sx * inner[0], sy * half[1], sz * inner[2]],
      [sx * inner[0], sy * inner[1], sz * half[2]],
    ], [sx, sy, sz]);
  }

  const geometry = new BufferGeometry();
  geometry.type = 'BeveledBoxGeometry';
  geometry.parameters = {width: w, height: h, depth: d, bevel: amount};
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
