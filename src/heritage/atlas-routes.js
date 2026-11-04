import {JOURNEYS} from './journey-data.js';

// Pixel coordinates belong to the supplied illustration, not geographic positions.
export const ART_MAP = {url: '/heritage-map-v2.png', width: 1448, height: 1086};
export const ART_PINS = [
  ['yungang',541,149,164,100,598,295],
  ['yingxian',730,115,192,104,891,284], ['dule',1163,115,198,103,1142,269],
  ['foguang',1150,338,210,99,1087,397], ['xiaoxitian',1032,446,224,101,981,498],
  ['xuankong',440,380,200,90,714,421], ['shuilu',410,541,197,100,663,608],
  ['shisi',1203,590,210,99,1148,651], ['kaiyuan',1160,755,211,100,1103,827],
];

// Every illustrated destination has its own observation journey. The wider
// research directory and legacy demonstrations remain separate from progress.
export const ROUTE_SITES = Object.fromEntries(JOURNEYS.map(route => [route.id, route.id]));
export function routeForSite(siteId) {
  return JOURNEYS.find(route => ROUTE_SITES[route.id] === siteId) || null;
}
export function atlasRoutes(state, activeJourneyId = null) {
  return JOURNEYS.map((route, index) => {
    const progress = state?.progress(route.id) || {done:0, total:route.points.length};
    return {
      ...route, siteId:ROUTE_SITES[route.id], number:index + 1, ...progress,
      onArtwork:ART_PINS.some(pin => pin[0] === ROUTE_SITES[route.id]),
      current:activeJourneyId === route.id,
      complete:progress.done === progress.total,
    };
  });
}
