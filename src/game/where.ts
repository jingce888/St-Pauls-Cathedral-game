import { DOME, STEPS } from "../world/dims";
import { INT } from "../world/cathedral/interior";
import type { StairInfo } from "../world/cathedral/stairs";
import { PHOTO_PLACES } from "../world/cathedral/photoReliefs";

export type Gallery = "whispering" | "stone" | "golden";

export interface Where {
  name: string;
  sub: string;
  /** Exposure multiplier the eye adapts to here. */
  adapt: number;
  /** Steps climbed, when on the stairs. */
  steps: number | null;
  gallery: Gallery | null;
  inside: boolean;
}

const STAIR_NAMES = [
  ["The Dome Stair", "257 steps to the Whispering Gallery"],
  ["The Dome Stair", "Into the drum"],
  ["The Drum Stair", "119 steps to the Stone Gallery"],
  ["The Drum Stair", "Through the attic"],
  ["Between the Domes", "152 steps to the Golden Gallery"],
  ["The Lantern Stair", "Almost there"],
];

/** Where is someone standing at (x, y, z) (feet)? */
export function where(x: number, y: number, z: number, stairs: StairInfo): Where {
  const r = Math.hypot(x, z);
  for (let i = 0; i < stairs.zones.length; i++) {
    const zn = stairs.zones[i];
    if (!zn.test(x, y, z)) continue;
    const f = Math.max(0, Math.min(1, (y - zn.y0) / (zn.y1 - zn.y0)));
    const steps = zn.base + Math.round(f * zn.steps);
    const [name, sub] = STAIR_NAMES[i] ?? ["Stairs", ""];
    return { name, sub, adapt: 9, steps, gallery: null, inside: true };
  }
  const wg = DOME.whisperingGallery, sg = DOME.stoneGallery, gg = DOME.goldenGallery;
  if (Math.abs(y - wg) < 0.6 && r < INT.wgWall + 0.6) return { name: "The Whispering Gallery", sub: "30 m above the floor · 257 steps", adapt: 3.6, steps: STEPS.whispering, gallery: "whispering", inside: true };
  if (Math.abs(y - sg) < 0.6 && r > DOME.atticR - 0.3 && r < 21.5) return { name: "The Stone Gallery", sub: "53 m · 376 steps", adapt: 1, steps: STEPS.stone, gallery: "stone", inside: false };
  if (Math.abs(y - gg) < 0.8 && r > 3.0 && r < 5.2) return { name: "The Golden Gallery", sub: "85 m · 528 steps", adapt: 1, steps: STEPS.golden, gallery: "golden", inside: false };
  if (y > gg - 1 && y < gg + 6 && r <= 3.0) return { name: "The Lantern", sub: "Above the dome", adapt: 2.6, steps: STEPS.golden, gallery: null, inside: true };
  if (y > sg - 0.5 && y < gg - 0.5 && r < 16.4) return { name: "Between the Domes", sub: "Inside the outer dome", adapt: 9, steps: null, gallery: null, inside: true };
  if (y > wg - 1 && y < sg && r < 21) return { name: "The Drum", sub: "Inside the masonry", adapt: 9, steps: null, gallery: null, inside: true };
  // inside the cathedral at floor level
  const inNave = x > INT.xW - 0.2 && x < INT.xE + INT.apseR && Math.abs(z) < INT.zA + 0.2;
  const inTransept = Math.abs(x) < INT.zA + 0.2 && Math.abs(z) < INT.zT + 0.2;
  if ((inNave || inTransept) && y > 1.5 && y < 31) {
    let name = "The Nave";
    const chapel = PHOTO_PLACES.find((p) => p.chapel && Math.hypot(x - (p.x + p.n[0] * 2), z - (p.z + p.n[1] * 2)) < 3.5);
    if (chapel?.chapel) name = chapel.chapel;
    else if (r < INT.octR + 1) name = "Under the Dome";
    else if (inTransept && !inNave) name = z < 0 ? "The North Transept" : "The South Transept";
    else if (Math.abs(z) > INT.zP) name = x > INT.zA ? (z < 0 ? "The North Quire Aisle" : "The South Quire Aisle") : z < 0 ? "The North Aisle" : "The South Aisle";
    else if (x > INT.zA) name = x > 50 ? "The High Altar" : "The Quire";
    return { name, sub: "St Paul's Cathedral", adapt: 4.2, steps: null, gallery: null, inside: true };
  }
  if (x < -79 && x > -87.5 && Math.abs(z) < 18 && y > 2) return { name: "The West Portico", sub: "Under the great pediment", adapt: 1.5, steps: null, gallery: null, inside: false };
  // outside
  let name = "St Paul's Churchyard", sub = "City of London";
  if (x < -95 && Math.abs(z) < 45) { name = "The West Front"; sub = "Ludgate Hill"; }
  else if (x < -86 && x > -100 && Math.abs(z) < 24) { name = "The West Steps"; sub = "St Paul's Cathedral"; }
  else if (z < -30 && x > -110 && x < 90 && z > -75) { name = "The North Churchyard"; sub = "St Paul's Cathedral"; }
  else if (z > 30 && x > -110 && x < 90 && z < 90) { name = "The South Churchyard"; sub = "St Paul's Cathedral"; }
  else if (x > 60 && x < 130 && Math.abs(z) < 60) { name = "The East End"; sub = "St Paul's Churchyard"; }
  else if (x > -140 && x < 20 && z < -75 && z > -190) { name = "Paternoster Square"; sub = "City of London"; }
  else if (z > 250) { name = "Queen Victoria Street"; sub = "Towards the Thames"; }
  else if (r > 250) { name = "The City"; sub = "City of London"; }
  return { name, sub, adapt: 1, steps: null, gallery: null, inside: false };
}
