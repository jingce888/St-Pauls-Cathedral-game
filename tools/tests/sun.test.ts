import { solarPosition, londonDate, sunDirection, worldToBearing } from "../../src/gfx/sun";

/** Prints the sun path for the default day and checks a few known values. */
export default function () {
  for (const h of [6, 9, 12, 13.1, 15, 17.25, 19, 20.5]) {
    const d = londonDate(5, 16, h);
    const p = solarPosition(d);
    const v = sunDirection(p.azimuth, p.elevation);
    console.log(String(h).padStart(5), d.toISOString(), "az", p.azimuth.toFixed(1).padStart(6), "el", p.elevation.toFixed(1).padStart(5),
      "dir", v.x.toFixed(2), v.y.toFixed(2), v.z.toFixed(2), "bearing(dir)", worldToBearing(v.x, v.z).toFixed(1));
  }
  // London solar noon mid-May is ~13:00 BST with elevation ~ 57-58 degrees
  const noon = solarPosition(londonDate(5, 16, 12.97));
  if (Math.abs(noon.azimuth - 180) > 3 || Math.abs(noon.elevation - 57.5) > 1.5) throw new Error("solar position off: " + JSON.stringify(noon));
  console.log("ok");
}
