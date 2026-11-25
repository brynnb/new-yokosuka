// Derive a compact server lookup from the same WDAT curve sampler as Story.
import fs from "node:fs";
import catalog from "../../play/data/shenmue1-native-weather.json" with {type:"json"};
import {nativeForecastClass, storyWeatherSchedule as schedule} from "../../play/world/StoryWeatherClass.js";

const channels = {CLUD:"cloud",RAIN:"rain",SNOW:"snow"};
const first = Math.max(...Object.values(schedule.curves).map(w => w[0] & 0xffffff));
const end = Math.min(...Object.values(schedule.curves).map(w => w.at(-1) & 0xffffff));
const boundaries = new Set([first]);
for (const [tag, key] of Object.entries(channels)) {
  const curve = schedule.curves[tag];
  const positive = t => schedule.samplePacked(t)[key] > 0;
  for (let i = 1; i < curve.length; i++) {
    let low = Math.max(first, curve[i-1] & 0xffffff);
    let high = Math.min(end-1, curve[i] & 0xffffff);
    if (low >= high) continue;
    const initial = positive(low);
    if (initial === positive(high)) continue;
    // Each native interpolation segment is monotonic, including its float32
    // zero cutoff. Find the first packed minute where its positive test flips.
    while (high-low > 1) {
      const mid = low + Math.floor((high-low)/2);
      if (positive(mid) === initial) low = mid;
      else high = mid;
    }
    boundaries.add(high);
  }
}
const transitions = [];
for (const start of [...boundaries].sort((a,b) => a-b)) {
  const weather = nativeForecastClass(schedule.samplePacked(start));
  if (transitions.at(-1)?.[1] !== weather) transitions.push([start,weather]);
}
const output = process.argv[2];
if (!output) throw Error("Supply the server story_weather_classes.json output path");
fs.writeFileSync(output, JSON.stringify({sourceSha256:catalog.source.sha256, end, transitions})+"\n");
console.log(`Built ${transitions.length} original weather class transitions`);
