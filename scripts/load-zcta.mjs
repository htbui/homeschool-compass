// Builds supabase/zcta.sql from the U.S. Census Gazetteer ZIP Code Tabulation
// Area file (public domain), for accurate "within N miles" distance bands.
// Without it, the community falls back to matching ZIP prefixes.
//
//   node scripts/load-zcta.mjs path/to/2024_Gaz_zcta_national.txt
//   docker exec -i supabase_db_freerange psql -U postgres < supabase/zcta.sql   # local
//   psql "$DATABASE_URL" -f supabase/zcta.sql                                   # hosted
//
// Download: https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html
// (ZIP Code Tabulation Areas → national file, unzip to get the .txt).
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/load-zcta.mjs <Gaz_zcta_national.txt>');
  process.exit(1);
}
const [header, ...rows] = readFileSync(file, 'utf8').trim().split(/\r?\n/);
const cols = header.split('\t').map((c) => c.trim());
const iZip = cols.indexOf('GEOID');
const iLat = cols.indexOf('INTPTLAT');
const iLng = cols.indexOf('INTPTLONG');
if (iZip < 0 || iLat < 0 || iLng < 0) throw new Error(`Unexpected columns: ${cols.join(', ')}`);

const values = rows
  .map((r) => r.split('\t').map((c) => c.trim()))
  .filter((c) => /^\d{5}$/.test(c[iZip]) && Number.isFinite(Number(c[iLat])) && Number.isFinite(Number(c[iLng])))
  .map((c) => `('${c[iZip]}',${Number(c[iLat])},${Number(c[iLng])})`);

const chunks = [];
for (let i = 0; i < values.length; i += 1000) {
  chunks.push(`insert into public.zcta (zip5, lat, lng) values\n${values.slice(i, i + 1000).join(',\n')}\non conflict (zip5) do update set lat = excluded.lat, lng = excluded.lng;`);
}
writeFileSync(new URL('../supabase/zcta.sql', import.meta.url), `begin;\n${chunks.join('\n')}\ncommit;\n`);
console.log(`supabase/zcta.sql: ${values.length} ZIP centroids`);
