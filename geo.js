/* ---------------------------------------------------------------
   GEO — Distance utilities for European airports

   Depends on: airports.js (AIRPORTS global),
               airport_coords.js (AIRPORT_COORDS global)

   European-only: airports whose country is not in
   EUROPEAN_COUNTRIES are ignored silently.

   Public API (all globals):
     haversineKm(lat1, lon1, lat2, lon2) → number
     getAirportDistance(iata1, iata2)    → number | null
     getNearbyAirports(iataCode, radiusKm, options) → NearbyResult[]

   NearbyResult: { iata, name, city, country, importance, distanceKm }
--------------------------------------------------------------- */

const EUROPEAN_COUNTRIES = new Set([
  'AD','AL','AT','BA','BE','BG','BY','CH','CY','CZ',
  'DE','DK','EE','ES','FI','FO','FR','GB','GE','GG',
  'GI','GR','HR','HU','IE','IM','IS','IT','JE','LI',
  'LT','LU','LV','MC','MD','ME','MK','MT','NL','NO',
  'PL','PT','RO','RS','RU','SE','SI','SK','SJ','SM',
  'TR','UA','VA','XK',
]);

/**
 * Great-circle distance between two geographic points (Haversine formula).
 * @param {number} lat1 - Latitude of first point in decimal degrees
 * @param {number} lon1 - Longitude of first point in decimal degrees
 * @param {number} lat2 - Latitude of second point in decimal degrees
 * @param {number} lon2 - Longitude of second point in decimal degrees
 * @returns {number} Distance in kilometres
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Distance in kilometres between two airports by IATA code.
 * Returns null if either airport is not a known European airport.
 * @param {string} iata1
 * @param {string} iata2
 * @returns {number | null}
 */
function getAirportDistance(iata1, iata2) {
  const c1 = AIRPORT_COORDS[iata1];
  const c2 = AIRPORT_COORDS[iata2];
  if (!c1 || !c2) return null;
  return haversineKm(c1.lat, c1.lon, c2.lat, c2.lon);
}

/**
 * Returns all European airports within radiusKm of the given airport,
 * sorted by ascending distance.
 *
 * @param {string} iataCode - Origin airport IATA code
 * @param {number} radiusKm - Search radius in kilometres
 * @param {object} [options]
 * @param {number} [options.minImportance=1] - Minimum airport importance (1–5)
 * @returns {Array<{iata:string, name:string, city:string, country:string,
 *                  importance:number, distanceKm:number}>}
 */
function getNearbyAirports(iataCode, radiusKm, options = {}) {
  const { minImportance = 1 } = options;
  const origin = AIRPORT_COORDS[iataCode];
  if (!origin) return [];

  const results = [];

  for (const airport of AIRPORTS) {
    if (airport.iata === iataCode) continue;
    if (!EUROPEAN_COUNTRIES.has(airport.country)) continue;
    if (airport.importance < minImportance) continue;

    const coords = AIRPORT_COORDS[airport.iata];
    if (!coords) continue;

    const dist = haversineKm(origin.lat, origin.lon, coords.lat, coords.lon);
    if (dist <= radiusKm) {
      results.push({
        iata:        airport.iata,
        name:        airport.name,
        city:        airport.city,
        country:     airport.country,
        importance:  airport.importance,
        distanceKm:  Math.round(dist),
      });
    }
  }

  return results.sort((a, b) => a.distanceKm - b.distanceKm);
}
