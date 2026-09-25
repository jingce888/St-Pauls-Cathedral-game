/**
 * St Paul's Cathedral — measured dimensions, in metres.
 *
 * Frame: x runs along the nave axis towards the (liturgical) east end, z runs south, y is up.
 * The origin is the vertical axis of the dome and lantern. The real axis points 6.2° north of
 * true east; `AXIS_BEARING` converts between this frame and compass bearings.
 * y = 0 is the level of the north and east churchyard; the cathedral floor is 2.5 m above it.
 *
 * Sources
 *  [OSM]  OpenStreetMap way 369161987 (footprint, 250 nodes) and its 3D building:parts, rotated
 *         into this frame (tools/osm): nave+aisles 37.4 m wide, transept 76 m between end walls,
 *         157.6 m long, 32 peristyle columns on a 19.7 m radius, dome 32 m wide at 66 m, ...
 *  [DIM]  A. Dimock, "The Cathedral Church of Saint Paul" (Bell's Cathedrals, 1900): length 513 ft,
 *         transepts 248 ft, stylobate 25 ft high, 32 peristyle columns 38 ft incl. pedestals,
 *         attic 108 ft and dome 102 ft in diameter, stone gallery 182 ft, golden gallery 281 ft,
 *         cross 363-365 ft, towers 222 ft, west pediment 74 x 18 ft, 12 + 8 portico columns, 4 ft.
 *  [WG]   S. Wale & J. Gwynn, section through the dome (1755), measured at 4.2 px/ft.
 *  [WIKI] Wikipedia: Whispering Gallery 99 ft above the floor and 112 ft across; 259 steps,
 *         balustrade ~108-110 ft, 365 ft to the cross; nave 91 ft high.
 *  [SPC]  St Paul's Cathedral: 257 steps to the Whispering Gallery, 376 to the Stone Gallery,
 *         528 to the Golden Gallery.
 */

export const FT = 0.3048;

/** Bearing (degrees clockwise from true north) of the +x axis of the world frame. */
export const AXIS_BEARING = 90 - 6.2;
/** Geographic position of the frame origin (the lantern axis). */
export const ORIGIN_LATLON = { lat: 51.513845, lon: -0.098351 };

/** Cathedral floor (and top of the portico steps) above the churchyard datum. [OSM portico 2.5 m] */
export const FLOOR = 2.5;

// ------------------------------------------------------------------------------------------ plan
export const PLAN = {
  /** West face of the portico columns (lower order). */
  porticoFront: -86.1,
  /** West faces of the tower blocks. */
  towerWest: -84.35,
  /** Tower blocks: 13.9 m square. [OSM] */
  towerHalf: 6.95,
  towerCx: -77.4,
  towerCz: 20.4,
  /** West block (towers + chapels) spans to here, north face at |z| = westBlockHalfW. */
  westBlockEast: -53.6,
  westBlockHalfW: 27.35,
  /** Aisle outer wall face / paired-pilaster face. [OSM] */
  aisleWall: 18.75,
  pilasterProj: 0.55,
  /** Clerestory wall of the nave/choir (stands back ~30 ft from the screen wall). [OSM, DIM] */
  clerestory: 8.2,
  /** Nave arcade: inner face of the piers. */
  arcadeInner: 6.25,
  /** Crossing bastions (outer faces). */
  bastionOuterX: 25.5,
  bastionOuterZ: 25.4,
  /** Transept side walls (|x|) and end walls (|z|). */
  transeptWallX: 18.75,
  transeptEnd: 36.9,
  transeptPilasterEnd: 37.7,
  /** Semicircular transept porticoes: centre on the end wall, column circle radius. [OSM] */
  porticoCz: 36.1,
  porticoColR: 6.4,
  porticoOuterR: 7.1,
  /** Choir aisle wall, east wall of the choir aisles and the apse. */
  choirEastWall: 63.3,
  apseCx: 61.1,
  apseR: 8.75,
  apseHalfAngle: 73.6,
  /** Bay divisions (centres of paired-pilaster groups) along the aisles. [OSM] */
  naveGroups: [-55.5, -44.8, -34.15, -23.5] as const,
  choirGroups: [23.5, 34.05, 44.3, 54.65, 60.95] as const,
  pilasterGroupW: 3.6,
} as const;

// ------------------------------------------------------------------------------------ elevation
/** Heights (world y) of the two-storey wall system. */
export const ELEV = {
  /** Top of the plain basement / crypt storey = base of the lower order. */
  basementTop: FLOOR + 0.4,
  /** Lower order: Corinthian pilasters/columns, 4 ft (1.22 m) wide, ~10 diameters high. [DIM] */
  lowerColBase: FLOOR + 0.4,
  lowerColTop: FLOOR + 12.6,
  lowerEntTop: FLOOR + 15.4,
  /** Upper order: pedestal band, Composite pilasters, entablature. */
  upperPedTop: FLOOR + 16.9,
  upperColTop: FLOOR + 26.6,
  upperEntTop: FLOOR + 29.0,
  /** Balustrade on top of the walls. 108 ft = 32.9 m above the churchyard. [DIM, WIKI] */
  balustradeTop: 33.0,
  /** Hidden roofs. [OSM] */
  aisleRoof: 22.0,
  mainRoofEaves: 31.0,
  mainRoofRidge: 35.0,
} as const;

// ---------------------------------------------------------------------------------- west front
export const WEST = {
  /** Lower portico column pairs (z of each column). Paired columns 1.85 m apart. [OSM] */
  lowerCols: [-16.25, -14.45, -10.3, -8.45, -4.1, -2.25, 2.25, 4.1, 8.45, 10.3, 14.45, 16.25],
  /** Upper order: the inner four pairs; outer pairs replaced by pilasters. [DIM] */
  upperCols: [-10.3, -8.45, -4.1, -2.25, 2.25, 4.1, 8.45, 10.3],
  colD: 1.22,
  upperColD: 1.07,
  /** Recessed centre with the great west door, ~20 ft deep. [DIM] */
  porchDepth: 6.1,
  /** Pediment 74 ft wide x 18 ft high; apex 120 ft; St Paul's statue top at 135 ft. [DIM] */
  pedimentW: 22.6,
  pedimentH: 5.5,
  pedimentApex: 36.6,
  statueTop: 41.1,
  /** West steps: two flights with a landing, from the forecourt at y = -0.8. */
  stepsBase: -0.8,
} as const;

// -------------------------------------------------------------------------------------- towers
export const TOWER = {
  /** 222 ft = 67.7 m to the top of the gilded pineapple. [DIM, OSM 68] */
  top: 67.8,
  /** Stage 3: square plinth with the oculus (clock on the SW tower). */
  s3Base: 31.2,
  s3Top: 41.0,
  /** Stage 4: columns at the angles around the central drum. [OSM 41-52, 10.7 m] */
  s4Top: 52.0,
  s4Half: 5.35,
  /** Stage 5: octagon with open arches. [OSM 52-61, 7.1 m] */
  s5Top: 58.2,
  s5Half: 3.55,
  /** Ogee cap and pineapple. [OSM dome 58-65 4.2 m, finial 64-68] */
  capTop: 64.6,
  clockR: 2.35,
} as const;

// ---------------------------------------------------------------------------------------- dome
export const DOME = {
  /** Stylobate: plain drum rising from the crossing roofs. 25 ft high, 140-145 ft across. [DIM, OSM r 20.45, 31-41] */
  stylobateR: 20.45,
  stylobateBase: 31.0,
  stylobateTop: 41.0,
  /** Peristyle: 32 columns, every fourth intercolumniation filled (8 buttresses). [DIM, OSM r 19.68] */
  peristyleColR: 19.68,
  peristyleColD: 1.12,
  peristylePedTop: 42.3,
  peristyleColTop: 52.6,
  peristyleEntTop: 54.9,
  /** Drum wall behind the colonnade. */
  drumWallR: 17.9,
  /** Stone Gallery floor: 173 ft above the cathedral floor. [WIKI, SPC 53 m] */
  stoneGallery: FLOOR + 52.6,
  stoneBalR: 20.35,
  stoneBalH: 1.25,
  /** Attic (tholobate): 108 ft across. [DIM, OSM 33.4 m] */
  atticR: 16.6,
  atticTop: 66.0,
  /** Outer lead dome: 102-105 ft across at its springing, rising to the lantern. [DIM, OSM] */
  outerR: 16.0,
  outerBase: 66.0,
  outerTopR: 4.25,
  outerTop: 84.4,
  /** Golden Gallery: 280 ft. [SPC 85 m, DIM 281 ft] */
  goldenGallery: 85.1,
  goldenR: 4.3,
  /** Inner dome (brick, painted by Thornhill), 101-102 ft across; oculus at its crown. [WG, WIKI] */
  innerR: 15.45,
  innerSpring: FLOOR + 46.3,
  innerCrown: FLOOR + 65.2,
  oculusR: 3.2,
  /** Whispering Gallery: 99 ft above the floor, 112 ft across. [WIKI] */
  whisperingGallery: FLOOR + 30.2,
  whisperR: 17.07,
  whisperWalkW: 2.0,
  /** Brick cone carrying the lantern (from the Stone Gallery level to the lantern). [WG, DIM] */
  coneBaseR: 16.2,
  coneTopR: 3.6,
  /** Lantern stages and the ball and cross. [OSM, DIM, photos] */
  lanternHalf: 3.0,
  lanternMainTop: 93.1,
  lanternAtticTop: 95.6,
  lanternDomeTop: 99.6,
  ballY: 103.2,
  ballR: 0.95,
  crossTop: 111.3,
} as const;

/** Stair counts (from the cathedral floor). [SPC] */
export const STEPS = { whispering: 257, stone: 376, golden: 528 } as const;
