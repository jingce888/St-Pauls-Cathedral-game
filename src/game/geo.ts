import { AXIS_BEARING } from "../world/dims";

/**
 * Geographic helpers: the same transform as tools/osm/build.mjs, from WGS84 to the cathedral
 * frame (x along the nave, z south, metres, origin on the lantern's axis).
 */
const LAT0 = 51.51385, LON0 = -0.09835, R = 6378137.0;
const CX = 2.681952714039366, CZ = 7.085980902737184, AXIS = -6.201362100796389;
const ca = Math.cos((-AXIS * Math.PI) / 180), sa = Math.sin((-AXIS * Math.PI) / 180);
const cosLat0 = Math.cos((LAT0 * Math.PI) / 180);

export function local(lat: number, lon: number): [number, number] {
  const x = (((lon - LON0) * Math.PI) / 180) * R * cosLat0 - CX;
  const z = -(((lat - LAT0) * Math.PI) / 180) * R - CZ;
  return [x * ca - z * sa, x * sa + z * ca];
}

/** Compass bearing (degrees, clockwise from north) of a horizontal direction (dx, dz) in the frame. */
export function bearing(dx: number, dz: number): number {
  const b = AXIS_BEARING + (Math.atan2(dz, dx) * 180) / Math.PI;
  return ((b % 360) + 360) % 360;
}

export interface Landmark {
  name: string;
  sub: string;
  x: number;
  z: number;
  /** Height of the label anchor above the ground there. */
  h: number;
  /** 1 = major (always labelled), 2 = minor. */
  rank: number;
}

const L = (name: string, sub: string, lat: number, lon: number, h: number, rank = 1): Landmark => {
  const [x, z] = local(lat, lon);
  return { name, sub, x, z, h, rank };
};

/** What one sees from the galleries. Heights are to the top of the building. */
export const LANDMARKS: Landmark[] = [
  L("The Shard", "Renzo Piano · 2012 · 310 m", 51.50452, -0.0865, 306),
  L("Tower Bridge", "1894", 51.50546, -0.07536, 65),
  L("Tower of London", "The White Tower · 1078", 51.5081, -0.07593, 28),
  L("The Gherkin", "30 St Mary Axe · 2004", 51.51447, -0.0803, 180),
  L("Walkie-Talkie", "20 Fenchurch Street · Sky Garden", 51.51122, -0.08364, 160),
  L("The Cheesegrater", "122 Leadenhall Street", 51.51376, -0.08212, 225),
  L("22 Bishopsgate", "278 m", 51.51446, -0.08288, 278, 2),
  L("Tower 42", "1980", 51.51507, -0.08395, 183, 2),
  L("Canary Wharf", "One Canada Square", 51.50494, -0.01945, 235),
  L("Tate Modern", "Bankside Power Station", 51.5076, -0.09936, 99),
  L("Millennium Bridge", "Foster & Caro · 2000", 51.50954, -0.09846, 11),
  L("Shakespeare's Globe", "Reconstructed 1997", 51.50808, -0.09718, 15, 2),
  L("London Eye", "135 m", 51.5033, -0.11955, 135),
  L("Big Ben", "Palace of Westminster", 51.50073, -0.12463, 96),
  L("BT Tower", "1964", 51.52148, -0.13894, 189),
  L("The Barbican", "Cromwell Tower", 51.52053, -0.09409, 123, 2),
  L("The Monument", "Wren & Hooke · 1677", 51.51013, -0.08594, 62),
  L("St Bride's", "Wren · the wedding-cake spire", 51.51374, -0.10532, 69, 2),
  L("St Mary-le-Bow", "Wren · Bow Bells", 51.51391, -0.09366, 72, 2),
  L("Guildhall", "15th century", 51.51562, -0.09208, 30, 2),
  L("Old Bailey", "Central Criminal Court", 51.51544, -0.10204, 67, 2),
  L("Blackfriars Bridge", "1869", 51.50968, -0.10442, 12, 2),
  L("Southwark Bridge", "1921", 51.50871, -0.09461, 12, 2),
  L("Waterloo Bridge", "1945", 51.50855, -0.11697, 12, 2),
  L("Somerset House", "1776", 51.51107, -0.11718, 35, 2),
  L("Royal Courts of Justice", "1882", 51.51365, -0.11318, 50, 2),
  L("City Hall", "", 51.50478, -0.07859, 45, 2),
  L("St Pancras", "1868", 51.52997, -0.12569, 82, 2),
  L("Battersea Power Station", "1933", 51.48183, -0.14456, 103),
  L("The O2", "Greenwich Peninsula", 51.50302, 0.00319, 52),
  L("Crystal Palace Mast", "219 m", 51.42421, -0.07457, 219),
  L("Alexandra Palace", "Ally Pally · 1873", 51.5942, -0.13, 70),
  L("Hampstead Heath", "Parliament Hill", 51.5608, -0.163, 10, 2),
  L("ArcelorMittal Orbit", "Olympic Park", 51.53821, -0.01281, 114, 2),
];
