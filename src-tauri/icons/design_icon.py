from PIL import Image, ImageDraw
import struct
import zlib
import os

def create_icon_image(size):
    """Create a polished app icon as PIL Image"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Colors
    indigo = (99, 102, 241)
    dark_indigo = (79, 70, 229)
    light_bg = (238, 242, 255)
    white = (255, 255, 255)

    cx = size // 2
    cy = size // 2
    r = size // 2

    # Draw indigo circle background
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=indigo)

    # Frame rectangle (with rounded corners visually)
    pad = int(size * 0.15)
    frame_r = int(size * 0.06)
    fx1, fy1 = pad, int(size * 0.13)
    fx2, fy2 = size - pad, size - pad

    # Frame fill (light)
    draw.rounded_rectangle([fx1, fy1, fx2, fy2], radius=frame_r, fill=light_bg)

    # Frame border
    draw.rounded_rectangle([fx1, fy1, fx2, fy2], radius=frame_r, outline=dark_indigo, width=max(1, size // 32))

    # Mountain 1 (back, lighter indigo)
    m1y = fy2 - int(size * 0.05)
    m1points = [fx1 + int(size*0.06), m1y, fx1 + int(size*0.36), fy1 + int(size*0.18), fx1 + int(size*0.42), m1y]
    draw.polygon(m1points, fill=indigo)

    # Mountain 2 (front, dark indigo)
    m2y = fy2 - int(size * 0.05)
    m2points = [fx1 + int(size*0.22), m2y, fx1 + int(size*0.50), fy1 + int(size*0.13), fx2 - int(size*0.06), m2y]
    draw.polygon(m2points, fill=dark_indigo)

    # Sun
    sun_r = max(2, int(size * 0.06))
    sun_cx = fx2 - int(size * 0.13)
    sun_cy = fy1 + int(size * 0.13)
    draw.ellipse([sun_cx - sun_r, sun_cy - sun_r, sun_cx + sun_r, sun_cy + sun_r], fill=white)

    # Two horizontal arrows pointing inward (compression symbol)
    arrow_y = cy + int(size * 0.03)
    arrow_len = int(size * 0.10)
    arrow_head_w = int(size * 0.05)
    arrow_body_h = max(1, int(size * 0.025))

    # Left arrow (pointing right)
    ax1 = fx1 + int(size * 0.06)
    ax2 = ax1 + arrow_len
    draw.line([ax1, arrow_y, ax2 - arrow_head_w, arrow_y], fill=white, width=arrow_body_h)
    draw.polygon([(ax2, arrow_y), (ax2 - arrow_head_w, arrow_y - arrow_head_w), (ax2 - arrow_head_w, arrow_y + arrow_head_w)], fill=white)

    # Right arrow (pointing left)
    bx2 = fx2 - int(size * 0.06)
    bx1 = bx2 - arrow_len
    draw.line([bx1 + arrow_head_w, arrow_y, bx2, arrow_y], fill=white, width=arrow_body_h)
    draw.polygon([(bx1, arrow_y), (bx1 + arrow_head_w, arrow_y - arrow_head_w), (bx1 + arrow_head_w, arrow_y + arrow_head_w)], fill=white)

    return img

def create_png_bytes(img):
    """Convert PIL Image to PNG bytes"""
    import io
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()

def create_ico(png_sizes):
    """Create ICO from list of PIL Images"""
    images = []
    for size in png_sizes:
        img = create_icon_image(size)
        images.append((size, create_png_bytes(img)))

    # ICO header: reserved(2) + type(2) + count(2)
    num = len(images)
    header = struct.pack('<HHH', 0, 1, num)

    # Directory entries: 16 bytes each
    offset = 6 + 16 * num
    entries = b''
    data_parts = []

    for size, png_bytes in images:
        w = 0 if size >= 256 else size
        h = 0 if size >= 256 else size
        entry = struct.pack('<BBBBHHII', w, h, 0, 0, 1, 32, len(png_bytes), offset)
        entries += entry
        offset += len(png_bytes)
        data_parts.append(png_bytes)

    return header + entries + b''.join(data_parts)

def create_icns(png_images):
    """Create ICNS from list of PIL Images"""
    contents = b''
    type_map = {
        16: b'icp4', 32: b'icp5', 48: b'icp6', 64: b'icp7',
        128: b'ic08', 256: b'ic09', 512: b'ic10', 1024: b'ic11'
    }
    for img in png_images:
        size = img.size[0]
        png_data = create_png_bytes(img)
        icon_type = type_map.get(size, b'ic08')
        chunk = icon_type + struct.pack('>I', 8 + len(png_data)) + png_data
        contents += chunk

    total = 8 + len(contents)
    return b'icns' + struct.pack('>I', total) + contents

os.chdir('/Users/fomoesc/projects/Photomini图片压缩工具/src-tauri/icons')

# Generate PNG icons at standard sizes
print("Creating PNG icons...")
for sz in [16, 32, 48, 64, 128, 256, 512, 1024]:
    img = create_icon_image(sz)
    if sz == 256:
        name = '128x128@2x.png'
    elif sz == 512:
        name = 'icon.512.png'
    elif sz == 1024:
        name = 'icon.1024.png'
    else:
        name = f'{sz}x{sz}.png'
    img.save(name, format='PNG')
    print(f"  {name}")

# Also save as 32x32 and 128x128 for the standard locations
create_icon_image(32).save('32x32.png', format='PNG')
create_icon_image(128).save('128x128.png', format='PNG')
create_icon_image(256).save('128x128@2x.png', format='PNG')

# Create ICO (Windows) - needs 16, 32, 48, 256
print("Creating icon.ico...")
ico_img_sizes = [16, 32, 48, 256]
ico_data = create_ico(ico_img_sizes)
with open('icon.ico', 'wb') as f:
    f.write(ico_data)
print("  icon.ico done")

# Create ICNS (macOS) - needs 128, 256, 512, 1024
print("Creating icon.icns...")
icns_imgs = [create_icon_image(sz) for sz in [128, 256, 512, 1024]]
icns_data = create_icns(icns_imgs)
with open('icon.icns', 'wb') as f:
    f.write(icns_data)
print("  icon.icns done")

print("\nAll icons generated successfully!")
print("Icon design: Indigo circle with landscape photo + compression arrows")
