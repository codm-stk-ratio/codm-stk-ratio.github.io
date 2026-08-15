import os
from PIL import Image

image_dir = r"c:\Users\GIGABYTE\Desktop\calc\public\image\bodyparts"
parts = ["head.png", "chest.png", "stomach.png", "upper_arm.png", "lower_arm.png", "leg.png"]

print("Finding centers...")
for part in parts:
    path = os.path.join(image_dir, part)
    if not os.path.exists(path):
        print(f"Missing: {part}")
        continue
    
    img = Image.open(path).convert("RGBA")
    width, height = img.size
    
    sum_x = 0
    sum_y = 0
    count = 0
    
    # Simple center of mass calculation for alpha > 0
    for y in range(height):
        for x in range(width):
            _, _, _, a = img.getpixel((x, y))
            if a > 0:
                sum_x += x
                sum_y += y
                count += 1
                
    if count > 0:
        cx = sum_x / count
        cy = sum_y / count
        px = (cx / width) * 100
        py = (cy / height) * 100
        print(f"{part}: cx={cx:.1f}, cy={cy:.1f} ({px:.2f}%, {py:.2f}%)")
    else:
        print(f"{part}: empty")
