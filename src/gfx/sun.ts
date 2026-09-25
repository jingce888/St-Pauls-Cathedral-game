import * as THREE from "three";
import { AXIS_BEARING, ORIGIN_LATLON } from "../world/dims";
import { DEG } from "../core/math";

/**
 * Solar position (NOAA / Meeus low-precision algorithm). Returns azimuth as a compass bearing
 * (degrees clockwise from true north) and elevation in degrees, refraction corrected.
 */
export function solarPosition(date: Date, lat = ORIGIN_LATLON.lat, lon = ORIGIN_LATLON.lon) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const C =
    Math.sin(M * DEG) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * M * DEG) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * M * DEG) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * DEG);
  const decl = Math.asin(Math.sin(eps * DEG) * Math.sin(lambda * DEG));
  const y = Math.tan((eps / 2) * DEG) ** 2;
  const eqTime =
    (4 / DEG) *
    (y * Math.sin(2 * L0 * DEG) -
      2 * e * Math.sin(M * DEG) +
      4 * e * y * Math.sin(M * DEG) * Math.cos(2 * L0 * DEG) -
      0.5 * y * y * Math.sin(4 * L0 * DEG) -
      1.25 * e * e * Math.sin(2 * M * DEG)) / 4;
  const minutesUTC = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolarTime = (((minutesUTC + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;
  const latR = lat * DEG;
  const cosZen = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(hourAngle * DEG);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZen)));
  let elevation = 90 - zenith / DEG;
  // atmospheric refraction (NOAA), arc seconds
  if (elevation > -0.575 && elevation < 85) {
    const te = Math.tan(elevation * DEG);
    const refr = elevation > 5
      ? 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5
      : 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)));
    elevation += refr / 3600;
  }
  const H = hourAngle * DEG;
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(latR) - Math.tan(decl) * Math.cos(latR));
  const azimuth = (az / DEG + 180 + 360) % 360;
  return { azimuth, elevation };
}

/** Horizontal world direction for a compass bearing (degrees). */
export function bearingToWorld(bearing: number, out = new THREE.Vector3()) {
  const th = (AXIS_BEARING - bearing) * DEG;
  return out.set(Math.cos(th), 0, -Math.sin(th));
}

/** Compass bearing (degrees) of a world-space horizontal direction. */
export function worldToBearing(x: number, z: number): number {
  const th = Math.atan2(-z, x) / DEG;
  return (((AXIS_BEARING - th) % 360) + 360) % 360;
}

/** Unit vector towards the sun in the world frame. */
export function sunDirection(azimuth: number, elevation: number, out = new THREE.Vector3()) {
  bearingToWorld(azimuth, out);
  const ce = Math.cos(elevation * DEG);
  out.multiplyScalar(ce);
  out.y = Math.sin(elevation * DEG);
  return out.normalize();
}

/** London is UTC+1 in summer (BST) and UTC in winter; derived from the date for display. */
export function londonOffsetHours(d: Date): number {
  const y = d.getUTCFullYear();
  const lastSunday = (month: number) => {
    const last = new Date(Date.UTC(y, month + 1, 0));
    return new Date(Date.UTC(y, month, last.getUTCDate() - last.getUTCDay(), 1));
  };
  return d >= lastSunday(2) && d < lastSunday(9) ? 1 : 0;
}

/** Builds a Date for a given day of the year and London local clock time (hours). */
export function londonDate(month: number, day: number, localHours: number, year = 2026): Date {
  const probe = new Date(Date.UTC(year, month - 1, day, 12));
  const off = londonOffsetHours(probe);
  const ms = Date.UTC(year, month - 1, day) + (localHours - off) * 3600000;
  return new Date(ms);
}
