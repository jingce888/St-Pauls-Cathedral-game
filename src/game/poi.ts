import * as THREE from "three";
import { DOME, FLOOR } from "../world/dims";
import { HUNG, MONUMENTS } from "../world/cathedral/paintings";
import { PHOTO_PLACES } from "../world/cathedral/photoReliefs";

/**
 * Points of interest: standing near one (and, for things overhead, looking at it) offers an
 * information card — English with a Chinese translation.
 */
export interface Poi {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Radius (m) in plan, and the height band around y the feet must be in. */
  r: number;
  dy?: number;
  /** Look target: the view direction must point at it within `cone` (cosine). */
  look?: [number, number, number];
  cone?: number;
  title: string;
  cn: string;
  meta: string;
  en: string;
  zh: string;
}

const F = FLOOR;

const BASE: Poi[] = [
  {
    id: "westPediment", x: -100, y: 0, z: 0, r: 16, dy: 6, look: [-86, 33.5, 0], cone: 0.93,
    title: "The Conversion of St Paul", cn: "圣保罗归信", meta: "West pediment · Francis Bird · 1706",
    en: "Saul, struck blind by a light from heaven on the road to Damascus, lies fallen beneath his rearing horse while his companions recoil. The cathedral's patron saint crowns the pediment above.",
    zh: "扫罗在前往大马士革的路上被天上的光照射而失明，倒在扬蹄的战马之下，同伴惊惶退避。山花顶端立着大教堂的主保圣人圣保罗像。",
  },
  {
    id: "westDoor", x: -82, y: F, z: 0, r: 5, dy: 3, look: [-79, 13.5, 0], cone: 0.8,
    title: "St Paul Preaching to the Bereans", cn: "圣保罗在庇哩亚传道", meta: "Relief over the great west door · Francis Bird",
    en: "Over the great west door the apostle preaches from a step to the people of Berea, who 'received the word with all readiness of mind'.",
    zh: "西大门上方的浮雕：使徒站在台阶上向庇哩亚人传道——他们“甘心领受这道”。",
  },
  {
    id: "northPediment", x: 0, y: 0, z: -52, r: 16, dy: 6, look: [0, 33.5, -37.75], cone: 0.9,
    title: "The Royal Arms", cn: "王室纹章", meta: "North transept pediment · Grinling Gibbons",
    en: "The royal arms within the Garter, crowned and supported by kneeling angels with palm branches.",
    zh: "北翼山花：嘉德勋章环绕的王室纹章，冠冕在上，两侧跪着手持棕榈枝的天使。",
  },
  {
    id: "southPediment", x: 0, y: 0, z: 52, r: 16, dy: 6, look: [0, 33.5, 37.75], cone: 0.9,
    title: "Resurgam", cn: "我将重生", meta: "South transept pediment · Caius Gabriel Cibber · 1698",
    en: "A phoenix rises from the flames above the word RESURGAM, 'I shall rise again'. When Wren set out the dome, a workman brought him a fragment of a gravestone from the ruins of Old St Paul's — it bore that one word.",
    zh: "凤凰从烈焰中升起，下方刻着 RESURGAM——“我将重生”。雷恩测定穹顶中心时，工人从旧圣保罗教堂的废墟中拾来一块墓碑残片，上面恰好只有这一个词。",
  },
  {
    id: "epitaph", x: 0, y: F, z: 0, r: 5, dy: 2,
    title: "Lector, si monumentum requiris, circumspice", cn: "读者啊，若你寻找他的纪念碑，请环顾四周", meta: "Under the dome · Wren's epitaph",
    en: "Sir Christopher Wren is buried in the crypt below, under a plain slab. His son's inscription is set in the floor beneath the dome: 'Reader, if you seek his monument, look around you.'",
    zh: "克里斯托弗·雷恩爵士长眠于下方地穴的一块朴素石板之下。他儿子撰写的铭文镶在穹顶下的地面：“读者啊，若你寻找他的纪念碑，请环顾四周。”",
  },
  {
    id: "spandrels", x: 0, y: F, z: 0, r: 14, dy: 2, look: [0, 28, 0], cone: 0.55,
    title: "Evangelists and Prophets", cn: "福音书作者与先知", meta: "Mosaics over the crossing arches · after G. F. Watts and Alfred Stevens",
    en: "Victorian gold mosaics fill the eight spaces over the arches of the crossing: the four Evangelists writing their gospels, each with his symbol, and the prophets Isaiah, Jeremiah, Ezekiel and Daniel.",
    zh: "穹顶下八个拱券上方的维多利亚时代金色马赛克：四位福音书作者各执其象征书写福音，以及以赛亚、耶利米、以西结、但以理四位先知。",
  },
  {
    id: "organ", x: 29, y: F, z: 0, r: 4.5, dy: 2,
    title: "The Grand Organ", cn: "大管风琴", meta: "Bernard Smith, 1695–97 · case carved by Grinling Gibbons",
    en: "Father Smith's organ stands in two halves over the first arches of the quire, in oak cases carved by Grinling Gibbons with gilded pipes, cherubs and crowns. Enlarged over three centuries, it now has 7,189 pipes.",
    zh: "“史密斯神父”建造的管风琴分为南北两半，坐落在唱诗席最西的拱券之上；橡木琴箱由格林林·吉本斯雕刻，饰以镀金音管、小天使与王冠。历经三个世纪扩建，如今共有 7,189 根音管。",
  },
  {
    id: "stalls", x: 42, y: F, z: 0, r: 5, dy: 2,
    title: "The Quire Stalls", cn: "唱诗席座椅", meta: "Grinling Gibbons · 1696–98",
    en: "The canons' stalls with their coved canopies and cresting of fruit, flowers and foliage were carved by Grinling Gibbons and his workshop; the bishop's throne, the cathedra, rises at the east end of the south side.",
    zh: "咏礼司铎的座椅由吉本斯及其作坊雕刻，拱形华盖顶上是水果、花卉与枝叶的镂雕；南侧东端高耸的是主教宝座（cathedra）——“大教堂”一词即由此而来。",
  },
  {
    id: "quireVaults", x: 38, y: F, z: 0, r: 10, dy: 2, look: [38, 28, 0], cone: 0.8,
    title: "The Quire Mosaics", cn: "唱诗席穹顶马赛克", meta: "William Blake Richmond · 1891–1904",
    en: "The saucer domes of the quire glitter with Richmond's glass mosaics of the Creation — birds of the air, fishes of the sea, the beasts of the earth, and the Lamb — each ringed by angels on gold.",
    zh: "唱诗席的碟形穹顶上是里士满创作的玻璃马赛克《创世》：空中的飞鸟、海里的鱼、地上的走兽与羔羊，四周环绕着金地上的天使。",
  },
  {
    id: "altar", x: 54.5, y: F, z: 0, r: 4, dy: 2,
    title: "The High Altar", cn: "高坛与华盖", meta: "1958 · after sketches by Wren",
    en: "The baldacchino over the high altar stands on four twisted columns wound with gilded vines, carrying a canopy of scrolls with the risen Christ. It was built after the Second World War from Wren's own sketches.",
    zh: "高坛上方的华盖由四根缠绕镀金葡萄藤的螺旋柱支撑，顶部卷涡托起复活的基督像。它建于二战之后，依据雷恩本人的草图设计。",
  },
  {
    id: "apse", x: 50, y: F, z: 0, r: 7, dy: 2, look: [66, 24, 0], cone: 0.85,
    title: "Christ in Majesty", cn: "荣耀基督", meta: "Apse mosaic · W. B. Richmond",
    en: "In the half-dome of the apse Christ sits enthroned in a mandorla, blessing, among adoring angels, over the words EGO SUM LUX MUNDI — 'I am the light of the world'.",
    zh: "后殿半穹顶中，基督端坐于杏仁形光环内赐福，天使环绕敬拜，下方写着 EGO SUM LUX MUNDI——“我是世界的光”。",
  },
  {
    id: "pulpit", x: 18.6, y: F, z: -3.6, r: 2.8, dy: 2,
    title: "The Pulpit", cn: "讲道台", meta: "Carved oak with gilded cherubs",
    en: "Raised on a stem at the entrance to the quire, under a sounding board that throws the preacher's voice down into the vast space beneath the dome.",
    zh: "讲道台立于唱诗席入口，高高托起，上方的共鸣板把讲道者的声音投向穹顶下的广阔空间。",
  },
  {
    id: "lectern", x: 16.4, y: F, z: 3.2, r: 2.4, dy: 2,
    title: "The Eagle Lectern", cn: "鹰形读经台", meta: "Brass · 1720",
    en: "The Bible rests on the outspread wings of a brass eagle, the bird that flies nearest the sun — carrying the Word to the four corners of the earth.",
    zh: "圣经放在黄铜雄鹰展开的双翼上——鹰是飞得离太阳最近的鸟，象征把圣言带往世界四方。",
  },
  {
    id: "font", x: -3.6, y: F, z: -28.4, r: 3.5, dy: 2,
    title: "The Font", cn: "洗礼池", meta: "Francis Bird · 1727 · marble",
    en: "The great marble font stands in the north transept, where the baptistery has been since the eighteenth century.",
    zh: "北翼中的大理石洗礼池——自十八世纪以来，洗礼堂就设在这里。",
  },
  {
    id: "trumpets", x: -66, y: F, z: 0, r: 7, dy: 2, look: [-77, 15, 0], cone: 0.85,
    title: "The State Trumpets", cn: "国事号角管", meta: "West end · 1977",
    en: "A rank of horizontal trumpets over the great west door, added for the Queen's Silver Jubilee: at great services they sound a fanfare down the full length of the nave.",
    zh: "西大门上方一排水平伸出的号角管，为女王登基二十五周年而加装；盛大礼仪时，它们沿整个中殿吹响号角。",
  },
  {
    id: "whispering", x: 0, y: DOME.whisperingGallery, z: 0, r: 17.6, dy: 1.2,
    title: "The Whispering Gallery", cn: "回音廊", meta: "30 m above the floor · 257 steps",
    en: "Whisper facing the wall and someone on the far side, 34 metres away, will hear you clearly: the sound creeps round the smooth curve of the drum.",
    zh: "面对墙壁轻声低语，34 米外对面的人也能听得一清二楚——声音沿着鼓座光滑的弧面传了过去。",
  },
  {
    id: "thornhill", x: 0, y: DOME.whisperingGallery, z: 0, r: 17.6, dy: 1.2, look: [0, 60, 0], cone: 0.7,
    title: "Thornhill's Dome", cn: "桑希尔穹顶画", meta: "Sir James Thornhill · 1715–19",
    en: "Eight scenes from the life of St Paul painted in brown and gold monochrome, framed by feigned architecture, rise to the oculus — through which the brick cone and the lantern's light can be seen.",
    zh: "八幅以棕金单色绘制的圣保罗生平场景，被错觉透视的建筑框架环绕，一直延伸到圆顶天眼——透过它可以看到砖砌锥体与采光亭的光。",
  },
  {
    id: "stoneGallery", x: 0, y: DOME.stoneGallery, z: 0, r: 21.5, dy: 1.2,
    title: "The Stone Gallery", cn: "石廊", meta: "53 m · 376 steps",
    en: "The balustraded gallery round the base of the outer dome: the first view over the City, the Thames and the South Bank.",
    zh: "外穹顶底部环绕的栏杆回廊：在这里第一次俯瞰伦敦城、泰晤士河与南岸。",
  },
  {
    id: "goldenGallery", x: 0, y: DOME.goldenGallery, z: 0, r: 5.2, dy: 1.2,
    title: "The Golden Gallery", cn: "金廊", meta: "85 m · 528 steps",
    en: "The highest point open to visitors, round the foot of the lantern. Use the labels (L) and the binocular zoom (right mouse button) to find the Shard, Tower Bridge and Westminster.",
    zh: "游客能到达的最高处，环绕采光亭底部。按 L 显示地标标签，按住右键使用望远镜缩放，寻找碎片大厦、塔桥和威斯敏斯特。",
  },
];

const PAINTINGS: Record<string, Omit<Poi, "id" | "x" | "y" | "z" | "r">> = {
  lightOfTheWorld: {
    title: "The Light of the World", cn: "世界之光", meta: "William Holman Hunt · 1900–04",
    en: "Christ, crowned with thorns and carrying a lantern, knocks at an overgrown door that has no handle on the outside — it can only be opened from within. 'Behold, I stand at the door, and knock.'",
    zh: "头戴荆冠、手提灯笼的基督，叩响一扇爬满藤蔓的门——门外没有把手，只能从里面打开。“看哪，我站在门外叩门。”",
  },
  annunciation: {
    title: "The Annunciation", cn: "圣母领报", meta: "Oil on canvas",
    en: "The angel Gabriel, bearing a lily, greets the Virgin at her reading; the Holy Spirit descends as a dove in a beam of light.",
    zh: "手持百合的天使加百列向正在读书的圣母致意，圣灵化作鸽子，随一道光降临。",
  },
};

let all: Poi[] | null = null;

function list(): Poi[] {
  if (all) return all;
  all = [...BASE];
  for (const h of HUNG) all.push({ id: h.id, x: h.x, y: F, z: h.z, r: 3.2, dy: 2, ...PAINTINGS[h.id] });
  // the carvings made from photographs, from in front of their altars
  for (const p of PHOTO_PLACES) {
    const d = p.altar ? 3.2 : 6;
    all.push({ id: p.id, x: p.x + p.n[0] * d, y: FLOOR, z: p.z + p.n[1] * d, r: p.altar ? 2.6 : 5, dy: 2, look: [p.x, p.y + 1.2, p.z], cone: 0.6, title: p.title, cn: p.cn, meta: p.meta, en: p.en, zh: p.zh });
  }
  // one card for the memorials, near any of them
  MONUMENTS.forEach((s, i) => {
    all!.push({
      id: `memorial${i}`, x: s.x + s.n[0] * 1.6, y: F, z: s.z + s.n[1] * 1.6, r: 2.2, dy: 2,
      title: "Memorials", cn: "纪念碑", meta: "The aisles",
      en: "Marble memorials line the aisles: mourning figures leaning on urns, portraits held up by cherubs, effigies on sarcophagi. The cathedral holds more than three hundred, from Nelson and Wellington to Wren himself.",
      zh: "侧廊两旁排列着大理石纪念碑：倚着骨灰瓮哀悼的人像、小天使托起的肖像浮雕、石棺上的卧像。大教堂内有三百多座纪念碑，从纳尔逊、威灵顿到雷恩本人。",
    });
  });
  return all;
}

const _d = new THREE.Vector3();

/** The point of interest the walker at `feet`, looking along `dir`, is at (closest first). */
export function poiAt(feet: THREE.Vector3, eye: THREE.Vector3, dir: THREE.Vector3): Poi | null {
  let best: Poi | null = null, bd = Infinity;
  for (const p of list()) {
    const d = Math.hypot(feet.x - p.x, feet.z - p.z);
    if (d > p.r || Math.abs(feet.y - p.y) > (p.dy ?? 3)) continue;
    if (p.look) {
      _d.set(p.look[0] - eye.x, p.look[1] - eye.y, p.look[2] - eye.z).normalize();
      if (_d.dot(dir) < (p.cone ?? 0.8)) continue;
    }
    // looking at something wins over merely standing somewhere
    const score = d / p.r - (p.look ? 0.5 : 0);
    if (score < bd) {
      bd = score;
      best = p;
    }
  }
  return best;
}
