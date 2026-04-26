import struct
import zlib
import os
import shutil

def create_png(width, height, rgba_pixels):
    def png_chunk(chunk_type, data):
        chunk = chunk_type + data
        return struct.pack('>I', len(data)) + chunk + struct.pack('>I', zlib.crc32(chunk) & 0xffffffff)

    signature = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr = png_chunk(b'IHDR', ihdr_data)

    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'
        for x in range(width):
            idx = (y * width + x) * 4
            raw_data += bytes(rgba_pixels[idx:idx+4])

    compressed = zlib.compress(raw_data, 9)
    idat = png_chunk(b'IDAT', compressed)
    iend = png_chunk(b'IEND', b'')

    return signature + ihdr + idat + iend

def create_icon(size):
    pixels = []
    cx, cy = size // 2, size // 2
    radius = size // 2 - size // 8

    for y in range(size):
        for x in range(width := size):
            dx, dy = x - cx, y - cy
            dist = (dx*dx + dy*dy) ** 0.5

            if dist <= radius - 2:
                pixels.extend([0, 122, 255, 255])
            elif dist <= radius + 2:
                alpha = max(0, min(255, int(255 * (radius + 2 - dist) / 4)))
                pixels.extend([0, 122, 255, alpha])
            else:
                pixels.extend([0, 0, 0, 0])

    return create_png(size, size, pixels)

os.chdir('/Users/fomoesc/projects/Photomini图片压缩工具/src-tauri/icons')

sizes = [32, 128, 256]
for s in sizes:
    data = create_icon(s)
    name = f'{s}x{s}.png' if s != 256 else '128x128@2x.png'
    with open(name, 'wb') as f:
        f.write(data)
    print(f'Created {name}')

shutil.copy('128x128.png', 'icon.icns')
shutil.copy('128x128.png', 'icon.ico')
print('Created icon.icns and icon.ico placeholders')
print('Done!')