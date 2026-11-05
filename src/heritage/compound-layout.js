// Original, playable interpretation of the supplied mountain-temple map.
// +Z is the southern approach. These are metre-scale placements, not survey data.
export const COMPOUND_LAYOUT = {
  id: 'snow-mountain-courts-v1',
  displayName: '小雷音寺 · 雪山院落',
  description: '循中轴穿过两重山门，登三层石台，走进后山大殿与左右偏院。依据参考地图创作的原创雪山寺院，非游戏场景或文物测绘复原。',
  bounds: {minX: -48, maxX: 48, minZ: -68, maxZ: 76},
  spawn: [0, 0, 71],
  overview: {target: [0, 4, 3], position: [90, 112, 138], mobilePosition: [24, 150, 166]},
  terraces: [
    {id: 'lower-court', name: '南山前院', minZ: 24, maxZ: 76, height: 0},
    {id: 'middle-court', name: '回廊中院', minZ: -20, maxZ: 24, height: 1.44},
    {id: 'upper-court', name: '后山上院', minZ: -68, maxZ: -20, height: 2.88},
  ],
  stairways: [
    {id: 'middle-axis', x: 0, z: 24, width: 12, from: 0, to: 1.44},
    {id: 'middle-west', x: -32, z: 24, width: 7, from: 0, to: 1.44},
    {id: 'middle-east', x: 32, z: 24, width: 7, from: 0, to: 1.44},
    {id: 'upper-axis', x: 0, z: -20, width: 12, from: 1.44, to: 2.88},
    {id: 'upper-west', x: -32, z: -20, width: 7, from: 1.44, to: 2.88},
    {id: 'upper-east', x: 32, z: -20, width: 7, from: 1.44, to: 2.88},
  ],
  buildings: [
    {id: 'gate', name: '雪岭山门', type: 'gate', x: 0, z: 58, base: 0},
    {id: 'west-front-pavilion', name: '听雪亭', type: 'pavilion', x: -28, z: 44, base: 0, w: 11, d: 8},
    {id: 'east-front-pavilion', name: '候月亭', type: 'pavilion', x: 28, z: 44, base: 0, w: 11, d: 8},
    {id: 'terrace-gate', name: '入云门', type: 'gate', x: 0, z: 14, base: 1.44},
    {id: 'west-gallery', name: '西侧经廊', type: 'gallery', side: -1, x: -18, z: 4, base: 1.44, length: 24, width: 7},
    {id: 'east-gallery', name: '东侧经廊', type: 'gallery', side: 1, x: 18, z: 4, base: 1.44, length: 24, width: 7},
    {id: 'west-hall', name: '西静堂', type: 'hall', x: -33, z: 2, base: 1.44, w: 16, d: 10, height: 5},
    {id: 'east-hall', name: '东禅堂', type: 'hall', x: 33, z: 2, base: 1.44, w: 16, d: 10, height: 5},
    {id: 'main-hall', name: '雷音大殿', type: 'hall', x: 0, z: -37, base: 2.88, w: 26, d: 18, height: 8, major: true},
    {id: 'west-upper-pavilion', name: '西钟亭', type: 'pavilion', x: -30, z: -35, base: 2.88, w: 11, d: 9},
    {id: 'east-upper-pavilion', name: '东鼓亭', type: 'pavilion', x: 30, z: -35, base: 2.88, w: 11, d: 9},
    {id: 'east-pagoda', name: '照雪塔', type: 'pagoda', x: 33, z: -56, base: 2.88},
    {id: 'rear-pavilion', name: '后山净亭', type: 'pavilion', x: 0, z: -60, base: 2.88, w: 12, d: 6},
  ],
};
