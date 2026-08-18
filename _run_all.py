from PIL import Image
import os, shutil, glob, subprocess, sys

blobs = r'C:\Users\hp\.verdent\storage\profiles\prod-s1\workspaces\mubis-erp-web--proj_209e8e1f03b0d447\shared\blobs'
public = r'C:\Users\hp\PROJELER\mubis-erp-web\public'
os.makedirs(public, exist_ok=True)

def find_blob(pattern):
    matches = glob.glob(pattern, recursive=True)
    return matches[0] if matches else None

# circular avatar candidates
circular = find_blob(blobs + r'\sha256\67\65\6765e7373874ac2a571082ca9448804e7c464e52fd79a7d5506e525b86e0ee4b') or \
           find_blob(blobs + r'\sha256\94\d9\94d90cd7a72aff425b4443824f5d853a11516d34de588ac5feb1d926f8e40c49')

# pencil logo
pencil = find_blob(blobs + r'\sha256\b5\a8\b5a8d1c5ea8d436bc02b1595a3bd332dc143bf2ee4ea1f99217c1324424bd6fe')

if not circular or not pencil:
    print('BLOB BULUNAMADI')
    sys.exit(1)

# Copy circular avatar as-is
shutil.copy2(circular, os.path.join(public, 'mascot-avatar.png'))

# Process pencil: transparent background + scale
img = Image.open(pencil).convert('RGBA')
width, height = img.size
mask = Image.new('L', (width, height), 255)
mask_pixels = mask.load()
pixels = img.load()

threshold = 25
visited = [[False]*height for _ in range(width)]
stack = []

def color_diff(a, b):
    return sum(abs(a[i]-b[i]) for i in range(3))

for x in [0, width-1]:
    for y in range(height):
        stack.append((x, y))
for y in [0, height-1]:
    for x in range(width):
        stack.append((x, y))

bg_color = None
while stack:
    x, y = stack.pop()
    if x < 0 or x >= width or y < 0 or y >= height:
        continue
    if visited[x][y]:
        continue
    visited[x][y] = True
    r, g, b, a = pixels[x, y]
    if bg_color is None:
        bg_color = (r, g, b)
    if color_diff((r, g, b), bg_color) < threshold:
        mask_pixels[x, y] = 0
        stack.extend([(x+1, y), (x-1, y), (x, y+1), (x, y-1)])

for x in range(width):
    for y in range(height):
        r, g, b, a = pixels[x, y]
        if r > 240 and g > 240 and b > 240:
            mask_pixels[x, y] = 0

img.putalpha(mask)
new_size = (int(width * 1.1), int(height * 1.1))
img = img.resize(new_size, Image.LANCZOS)
img.save(os.path.join(public, 'mascot-kalem.png'), 'PNG')

print('avatar size:', os.path.getsize(os.path.join(public, 'mascot-avatar.png')))
print('pencil size:', os.path.getsize(os.path.join(public, 'mascot-kalem.png')))

# clean temp scripts
for f in ['_make_transparent.py', '_fix_logos.py', '_set_logos.py', '_logo_use.py', '_deploy_logos.py', '_check_office.py']:
    p = os.path.join(r'C:\Users\hp\PROJELER\mubis-erp-web', f)
    if os.path.exists(p):
        os.remove(p)

os.chdir(r'C:\Users\hp\PROJELER\mubis-erp-web')
print('building...')
build = subprocess.run(['npm', 'run', 'build'], shell=True)
print('build exit:', build.returncode)
if build.returncode != 0:
    sys.exit(build.returncode)

print('deploying...')
deploy = subprocess.run(['vercel', '--prod', '--yes'], shell=True)
print('deploy exit:', deploy.returncode)
sys.exit(deploy.returncode)
