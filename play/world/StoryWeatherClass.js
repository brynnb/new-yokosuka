import catalog from "../data/shenmue1-native-weather.json" with { type: "json" };
import { NativeWeatherSchedule } from "./NativeWeatherSchedule.js";
import { nativeClockRecordFromGameDate } from "../events/NativeClockRecordRuntime.js";

export const storyWeatherSchedule = new NativeWeatherSchedule(catalog);

// 1ST_READ 0x0c17296a through 0x0c17298a, operation 0x0176 mode 10.
// MFSY 0x74530 invokes this with the personal clock before reading room +0x275.
export function nativeForecastClass({cloud, rain, snow}) {
  if (snow > 0) return 3;
  if (rain > 0) return 2;
  return cloud > 0 ? 1 : 0;
}

let minute, result;
export function storyWeatherClassAt(date) {
  const key = Math.floor(date.getTime() / 60000);
  if (key !== minute) {
    result = nativeForecastClass(storyWeatherSchedule.sample(nativeClockRecordFromGameDate(date)));
    minute = key;
  }
  return result;
}
