import json
import struct
import unittest

from tools.assets.gditools3 import GDIfile
from tools.worlds import extract_shenmue1_weather as weather
from tools.assets.pvr_decoder import decode_pvr
from PIL import Image


class NativeWeatherEvidenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.executable = (weather.ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes()
        with GDIfile(str(weather.ROOT / ".disc-work/disc1.gdi")) as disc:
            cls.data = disc.get_file("SPRITE/WEATHER.BIN")
            cls.sprites = {name: disc.get_file("SPRITE/" + name + ".SPR") for name in weather.SKY_HASHES}

    def test_exact_disc_and_executable_regenerate_catalog(self):
        result = weather.build_catalog(self.executable, self.data, self.sprites)
        self.assertEqual(result, json.loads((weather.ROOT / "play/data/shenmue1-native-weather.json").read_text()))
        self.assertEqual({k: len(v) for k, v in result["curves"].items()}, {"CLUD": 414, "RAIN": 298, "SNOW": 153})
        self.assertEqual(len(result["opaqueForecastWords"]), 143)
        self.assertEqual(result["auxiliaryCurve"], [0x010800, 0xfcfdfb])
        self.assertEqual([len(t["recordWords"]) for t in result["environment"]["tables"]], [12, 10, 9, 9])
        changed = bytearray(self.executable)
        changed[0x0C1BA8FA - weather.BASE] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            weather.build_catalog(changed, self.data, self.sprites)
        with self.assertRaisesRegex(ValueError, "unexpected WEATHER"):
            weather.build_catalog(self.executable, self.data[:-1], self.sprites)

    def test_sky_texture_names_and_existing_png_pixels_match_original_resources(self):
        result = weather.build_catalog(self.executable, self.data, self.sprites)
        for resource in result["environment"]["skyResourceRecords"]:
            data = self.sprites[resource["resource"].split("/")[-1][:-4]]
            position = 0
            for tile in resource["tiles"]:
                position = data.index(b"PVRT", position)
                size = struct.unpack_from("<I", data, position + 4)[0] + 8
                pixels, _ = decode_pvr(data[position:position + size])
                with Image.open(weather.ROOT / "public" / tile["imagePath"].lstrip("/")) as png:
                    self.assertEqual(png.convert("RGBA").tobytes(), pixels.convert("RGBA").tobytes(), tile["textureName"])
                position += size

    def test_malformed_chunks_and_unordered_curves_fail_closed(self):
        for damaged in (self.data[:-4], self.data + bytes(4), self.data[:-1]):
            with self.assertRaises(ValueError):
                weather.parse_weather(damaged)
        damaged = bytearray(self.data)
        struct.pack_into("<I", damaged, 12, 0xffffffff)
        with self.assertRaisesRegex(ValueError, "chunk size"):
            weather.parse_weather(damaged)
        damaged = bytearray(self.data)
        struct.pack_into("<I", damaged, 20, struct.unpack_from("<I", damaged, 16)[0])
        with self.assertRaisesRegex(ValueError, "strictly ordered"):
            weather.parse_weather(damaged)


if __name__ == "__main__":
    unittest.main()
