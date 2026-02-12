#!/usr/bin/env python3
"""
Dreamcast PVR texture decoder.

Decodes PVR/PVRT texture files to PIL Images. Handles:
  - RECTANGLE (0x09): Linear pixel data, no twiddling
  - TWIDDLED (0x01): Square textures, Morton-order twiddled
  - TWIDDLED_RECT (0x0D): Non-square textures split into square twiddled tiles

Supports color formats: ARGB1555, RGB565, ARGB4444.
"""

import struct
import os
from PIL import Image


# Data format constants
TWIDDLED = 0x01
TWIDDLED_MM = 0x02
RECTANGLE = 0x09
TWIDDLED_RECT = 0x0D

# Color format constants
ARGB1555 = 0x00
RGB565 = 0x01
ARGB4444 = 0x02

# Human-readable names
DATA_FORMAT_NAMES = {
    TWIDDLED: 'TWIDDLED',
    TWIDDLED_MM: 'TWIDDLED_MM',
    RECTANGLE: 'RECTANGLE',
    TWIDDLED_RECT: 'TWIDDLED_RECT',
}

COLOR_FORMAT_NAMES = {
    ARGB1555: 'ARGB1555',
    RGB565: 'RGB565',
    ARGB4444: 'ARGB4444',
}


def untwiddle_value(val):
    """Spread bits of val into even bit positions (Morton order component)."""
    result = 0
    for i in range(10):
        if val & (1 << i):
            result |= 1 << (2 * i)
    return result


def untwiddle(x, y):
    """Morton/Z-order index: Y in even bits, X in odd bits."""
    return untwiddle_value(y) | (untwiddle_value(x) << 1)


def decode_rgb565(v):
    """Decode a 16-bit RGB565 value to (R, G, B, A) with proper bit expansion."""
    r5 = (v >> 11) & 0x1F
    g6 = (v >> 5) & 0x3F
    b5 = v & 0x1F
    r = (r5 << 3) | (r5 >> 2)
    g = (g6 << 2) | (g6 >> 4)
    b = (b5 << 3) | (b5 >> 2)
    return (r, g, b, 255)


def decode_argb1555(v):
    """Decode a 16-bit ARGB1555 value to (R, G, B, A) with proper bit expansion."""
    a = 255 if (v & 0x8000) else 0
    r5 = (v >> 10) & 0x1F
    g5 = (v >> 5) & 0x1F
    b5 = v & 0x1F
    r = (r5 << 3) | (r5 >> 2)
    g = (g5 << 3) | (g5 >> 2)
    b = (b5 << 3) | (b5 >> 2)
    return (r, g, b, a)


def decode_argb4444(v):
    """Decode a 16-bit ARGB4444 value to (R, G, B, A) with proper bit expansion."""
    a4 = (v >> 12) & 0x0F
    r4 = (v >> 8) & 0x0F
    g4 = (v >> 4) & 0x0F
    b4 = v & 0x0F
    return ((r4 << 4) | r4, (g4 << 4) | g4, (b4 << 4) | b4, (a4 << 4) | a4)


def decode_color(v, color_format):
    """Decode a 16-bit color value based on format."""
    if color_format == RGB565:
        return decode_rgb565(v)
    elif color_format == ARGB1555:
        return decode_argb1555(v)
    elif color_format == ARGB4444:
        return decode_argb4444(v)
    else:
        return (255, 0, 255, 255)  # Magenta for unknown


def decode_rectangle(pixel_data, width, height, color_format):
    """Decode RECTANGLE format: linear pixel data, no twiddling."""
    img = Image.new('RGBA', (width, height))
    px = img.load()
    for y in range(height):
        for x in range(width):
            idx = y * width + x
            v = struct.unpack_from('<H', pixel_data, idx * 2)[0]
            px[x, y] = decode_color(v, color_format)
    return img


def decode_twiddled_square(pixel_data, width, height, color_format):
    """Decode a square twiddled texture."""
    img = Image.new('RGBA', (width, height))
    px = img.load()
    for y in range(height):
        for x in range(width):
            src_idx = untwiddle(x, y)
            v = struct.unpack_from('<H', pixel_data, src_idx * 2)[0]
            px[x, y] = decode_color(v, color_format)
    return img


def decode_twiddled_rect(pixel_data, width, height, color_format):
    """Decode TWIDDLED_RECTANGLE format: N square tiles merged.

    For wide textures (w > h): tiles of h×h placed left to right
    For tall textures (h > w): tiles of w×w placed top to bottom
    """
    img = Image.new('RGBA', (width, height))
    px = img.load()

    if width > height:
        tile_size = height
        num_tiles = width // tile_size
        tile_pixels = tile_size * tile_size

        for t in range(num_tiles):
            tile_offset = t * tile_pixels * 2
            x_base = t * tile_size
            for y in range(tile_size):
                for x in range(tile_size):
                    src_idx = untwiddle(x, y)
                    v = struct.unpack_from('<H', pixel_data, tile_offset + src_idx * 2)[0]
                    px[x_base + x, y] = decode_color(v, color_format)

    elif height > width:
        tile_size = width
        num_tiles = height // tile_size
        tile_pixels = tile_size * tile_size

        for t in range(num_tiles):
            tile_offset = t * tile_pixels * 2
            y_base = t * tile_size
            for y in range(tile_size):
                for x in range(tile_size):
                    src_idx = untwiddle(x, y)
                    v = struct.unpack_from('<H', pixel_data, tile_offset + src_idx * 2)[0]
                    px[x, y_base + y] = decode_color(v, color_format)

    else:
        return decode_twiddled_square(pixel_data, width, height, color_format)

    return img


def parse_pvr_header(data):
    """Parse a PVR file and return (color_format, data_format, width, height, pixel_data).

    Handles both raw PVRT and GBIX-wrapped files.
    """
    if data[:4] == b'GBIX':
        gbix_len = struct.unpack_from('<I', data, 4)[0]
        pvrt_offset = 8 + gbix_len
        pvrt = data[pvrt_offset:]
    elif data[:4] == b'PVRT':
        pvrt = data
    else:
        raise ValueError(f"Unknown PVR header: {data[:4]}")

    color_format = pvrt[8]
    data_format = pvrt[9]
    width = struct.unpack_from('<H', pvrt, 12)[0]
    height = struct.unpack_from('<H', pvrt, 14)[0]
    pixel_data = pvrt[16:]

    return color_format, data_format, width, height, pixel_data


def decode_pvr(data):
    """Decode PVR file data (bytes) into a PIL Image.

    Returns (image, metadata_dict) where metadata contains format info.
    """
    color_format, data_format, width, height, pixel_data = parse_pvr_header(data)

    fmt_name = DATA_FORMAT_NAMES.get(data_format, f'0x{data_format:02x}')
    color_name = COLOR_FORMAT_NAMES.get(color_format, f'0x{color_format:02x}')

    metadata = {
        'width': width,
        'height': height,
        'data_format': data_format,
        'data_format_name': fmt_name,
        'color_format': color_format,
        'color_format_name': color_name,
    }

    if data_format == RECTANGLE:
        img = decode_rectangle(pixel_data, width, height, color_format)
    elif data_format == TWIDDLED_RECT:
        img = decode_twiddled_rect(pixel_data, width, height, color_format)
    elif data_format in (TWIDDLED, TWIDDLED_MM):
        img = decode_twiddled_square(pixel_data, width, height, color_format)
    else:
        raise ValueError(f"Unsupported data format: 0x{data_format:02x}")

    return img, metadata


def convert_pvr_to_png(pvr_path, png_path):
    """Convert a PVR file to PNG. Returns True on success."""
    data = open(pvr_path, 'rb').read()

    try:
        img, meta = decode_pvr(data)
    except ValueError as e:
        print(f"  ERROR: {e} in {os.path.basename(pvr_path)}")
        return False

    print(f"  {os.path.basename(pvr_path)}: {meta['width']}x{meta['height']} {meta['data_format_name']}")
    img.save(png_path)
    print(f"  -> {os.path.basename(png_path)}")
    return True
