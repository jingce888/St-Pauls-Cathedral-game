#!/usr/bin/env node
/**
 * Downloads the OpenStreetMap layers the city is built from and stores the raw Overpass JSON in
 * tools/osm/raw/ (git-ignored). Run `node tools/osm/build.mjs` afterwards to turn them into the
 * compact binary the game loads (public/data/london.bin).
 *
 *   node tools/osm/fetch.mjs                  # all layers
 *   node tools/osm/fetch.mjs buildings water  # selected layers
 *   OVERPASS=https://overpass-api.de/api/interpreter node tools/osm/fetch.mjs
 *
 * Behind an HTTPS proxy run with NODE_USE_ENV_PROXY=1 (Node >= 22.21).
 * Data © OpenStreetMap contributors, ODbL 1.0.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, "raw");
const ENDPOINTS = (process.env.OVERPASS ?? "https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter").split(",");

// Lantern axis of the dome (WGS84); every radius below is measured from here.
const LAT = 51.513845, LON = -0.098351;
const around = (r) => `(around:${r},${LAT},${LON})`;
const bbox = (r) => {
  const dLat = r / 111320, dLon = r / (111320 * Math.cos((LAT * Math.PI) / 180));
  return `${LAT - dLat},${LON - dLon},${LAT + dLat},${LON + dLon}`;
};

// A layer is either a query string, or { tiles: n, radius: r, body: (bbox) => query } which is
// run once per tile of an n x n grid over the square of the given radius and merged by id
// (public Overpass mirrors time out on one large request).
const tileBox = (r, n, i, j) => {
  const dLat = r / 111320, dLon = r / (111320 * Math.cos((LAT * Math.PI) / 180));
  const s = LAT - dLat + ((2 * dLat) / n) * j, w = LON - dLon + ((2 * dLon) / n) * i;
  return `${s},${w},${s + (2 * dLat) / n},${w + (2 * dLon) / n}`;
};

const LAYERS = {
  // Every building and building part within 3 km: the city seen from the galleries.
  buildings: {
    tiles: 6, radius: 3000,
    body: (b) => `[out:json][timeout:300];
      (way["building"](${b}); way["building:part"](${b}); relation["building"](${b}););
      out tags geom;`,
  },
  // Tall buildings and landmarks further out, for the skyline (Canary Wharf, Battersea, BT Tower...).
  // Distant landmark clusters beyond the 3 km city, each fetched as a small box.
  skyline: {
    boxes: [
      ["canary-wharf", 51.5049, -0.0195, 750],
      ["battersea", 51.4819, -0.1446, 350],
      ["nine-elms", 51.4850, -0.1270, 650],
      ["bt-tower", 51.5215, -0.1389, 160],
      ["o2", 51.5030, 0.0032, 300],
      ["stratford", 51.5425, -0.0090, 600],
      ["crystal-palace-mast", 51.4243, -0.0747, 150],
      ["alexandra-palace", 51.5942, -0.1300, 250],
      ["paddington", 51.5160, -0.1760, 350],
      ["euston", 51.5270, -0.1340, 350],
      ["kings-cross", 51.5335, -0.1250, 450],
    ],
    body: (b) => `[out:json][timeout:120];
      (way["building"](${b}); way["building:part"](${b}); relation["building"](${b});
       way["man_made"~"^(tower|mast|chimney)$"](${b}); node["man_made"~"^(tower|mast)$"](${b}););
      out tags geom;`,
  },
  // The Thames and other water, clipped to a 7 km box so the river polygon stays small.
  water: `[out:json][timeout:300];
    (way["natural"="water"](${bbox(7000)}); relation["natural"="water"](${bbox(7000)});
     way["waterway"="riverbank"](${bbox(7000)}); relation["waterway"="riverbank"](${bbox(7000)}););
    out geom(${bbox(7000)});`,
  // Parks, lawns and gardens.
  green: `[out:json][timeout:300];
    (way["leisure"~"park|garden|common|pitch|playground"]${around(4000)};
     relation["leisure"~"park|garden|common"]${around(4000)};
     way["landuse"~"grass|recreation_ground|cemetery|meadow|village_green|forest"]${around(4000)};
     relation["landuse"~"grass|recreation_ground|cemetery|forest"]${around(4000)};
     way["natural"~"wood|scrub|grassland"]${around(4000)};);
    out tags geom;`,
  // Streets and paths (drawn on the ground; the churchyard paths come from here too).
  roads: {
    tiles: 2, radius: 2500,
    body: (b) => `[out:json][timeout:300];
      (way["highway"](${b}); way["railway"~"rail|light_rail|subway|narrow_gauge"](${b}); way["area:highway"](${b}););
      out tags geom;`,
  },
  // Bridges over the Thames (decks, piers).
  bridges: `[out:json][timeout:300];
    (way["man_made"="bridge"](${bbox(7000)}); relation["man_made"="bridge"](${bbox(7000)});
     way["bridge"]["highway"](${bbox(7000)}); way["bridge"]["railway"](${bbox(7000)}););
    out tags geom;`,
  // Small things around the churchyard: trees, statues, lamps, benches, railings, steps, lawns.
  detail: `[out:json][timeout:300];
    (node["natural"]${around(350)}; node["historic"]${around(350)}; node["amenity"]${around(350)};
     node["highway"]${around(350)}; node["barrier"]${around(350)}; node["man_made"]${around(350)};
     node["tourism"]${around(350)}; node["leisure"]${around(350)}; node["memorial"]${around(350)};
     way["barrier"]${around(350)}; way["natural"]${around(350)}; way["amenity"]${around(350)};
     way["historic"]${around(350)}; way["man_made"]${around(350)}; way["leisure"]${around(350)};
     way["landuse"]${around(350)}; way["area:highway"]${around(350)}; way["highway"]${around(350)};
     way["place"]${around(350)}; way["area"]${around(350)};);
    out tags geom;`,
};

async function query(name, q) {
  let lastErr;
  for (const url of ENDPOINTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const t0 = Date.now();
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "st-pauls-cathedral-game/1.0 (osm fetch tool)" },
          body: "data=" + encodeURIComponent(q),
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const text = await res.text();
        const json = JSON.parse(text);
        if (json.remark && /error|timed out/i.test(json.remark)) throw new Error(json.remark);
        console.log(`${name.padEnd(10)} ${String(json.elements.length).padStart(7)} elements  ${(text.length / 1e6).toFixed(1)} MB  ${((Date.now() - t0) / 1000).toFixed(0)} s  (${url})`);
        return text;
      } catch (e) {
        lastErr = e;
        console.warn(`${name}: ${url} attempt ${attempt + 1} failed: ${e.message}`);
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      }
    }
  }
  throw lastErr;
}

await fs.mkdir(RAW, { recursive: true });
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LAYERS);
for (const name of wanted) {
  const layer = LAYERS[name];
  if (!layer) throw new Error(`unknown layer ${name}`);
  if (typeof layer === "string") {
    await fs.writeFile(path.join(RAW, `${name}.json`), await query(name, layer));
    continue;
  }
  const seen = new Map();
  if (layer.boxes) {
    const dir = path.join(RAW, `${name}.tiles`);
    await fs.mkdir(dir, { recursive: true });
    for (const [id, lat, lon, r] of layer.boxes) {
      const file = path.join(dir, `${id}.json`);
      let text;
      try {
        text = await fs.readFile(file, "utf8");
      } catch {
        const dLat = r / 111320, dLon = r / (111320 * Math.cos((lat * Math.PI) / 180));
        text = await query(`${name}[${id}]`, layer.body(`${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon}`));
        await fs.writeFile(file, text);
      }
      for (const e of JSON.parse(text).elements) seen.set(`${e.type}/${e.id}`, e);
    }
    const out = { version: 0.6, generator: "tools/osm/fetch.mjs (boxes)", copyright: "© OpenStreetMap contributors, ODbL 1.0", elements: [...seen.values()] };
    await fs.writeFile(path.join(RAW, `${name}.json`), JSON.stringify(out));
    console.log(`${name.padEnd(10)} merged ${seen.size} elements`);
    continue;
  }
  const tileDir = path.join(RAW, `${name}.tiles`);
  await fs.mkdir(tileDir, { recursive: true });
  for (let j = 0; j < layer.tiles; j++) {
    for (let i = 0; i < layer.tiles; i++) {
      // each tile is cached, so an interrupted run resumes where it stopped
      const file = path.join(tileDir, `${i}_${j}.json`);
      let text;
      try {
        text = await fs.readFile(file, "utf8");
      } catch {
        text = await query(`${name}[${i},${j}]`, layer.body(tileBox(layer.radius, layer.tiles, i, j)));
        await fs.writeFile(file, text);
      }
      for (const e of JSON.parse(text).elements) seen.set(`${e.type}/${e.id}`, e);
    }
  }
  const out = { version: 0.6, generator: "tools/osm/fetch.mjs (tiled)", copyright: "© OpenStreetMap contributors, ODbL 1.0", elements: [...seen.values()] };
  await fs.writeFile(path.join(RAW, `${name}.json`), JSON.stringify(out));
  console.log(`${name.padEnd(10)} merged ${seen.size} elements`);
}
