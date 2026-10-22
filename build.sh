#!/bin/sh
# Build the storefront: site/index.html + site/src/*.js → index.html at the repo root (what Netlify publishes).
# Product images stay as files under images/; Three.js r128 comes from the CDN.
cd "$(dirname "$0")"
python3 - <<'EOF'
import json
from PIL import Image
products = json.load(open('site/src/products.json'))

# each flavor's packaging colour, worked out here once instead of in every visitor's browser (it blocked the page
# for seconds on slow phones): the most saturated mid-tone pixels of a 32×32 copy of the photo, same formula as before
def flavor_color(path):
    try:
        im = Image.open(path).convert('RGBA').resize((32, 32), Image.BILINEAR)
    except Exception:
        return '#c9d96a'
    r = g = b = wsum = 0.0
    data = im.tobytes()
    for i in range(0, len(data), 4):
        R, G, B = data[i], data[i + 1], data[i + 2]
        R, G, B = R / 255, G / 255, B / 255
        mx, mn = max(R, G, B), min(R, G, B)
        l = (mx + mn) / 2
        s = 0 if mx == mn else (mx - mn) / (1 - abs(2 * l - 1))
        w = s * s * (1 - abs(l - 0.55) * 1.6)
        if w <= 0: continue
        r += R * w; g += G * w; b += B * w; wsum += w
    if wsum <= 0.5: return '#c9d96a'
    return '#' + ''.join(f'{round(v / wsum * 255):02x}' for v in (r, g, b))
colors = {}
for p in products:
    for path in [p['image']] + [f['image'] for f in p['flavors']]:
        if path not in colors: colors[path] = flavor_color(path)

js = '\n'.join(open(f'site/src/{f}').read() for f in ['util.js', 'dash-model.js', 'ice-model.js', 'device.js', 'tags.js', 'stamps.js', 'account.js', 'checkout.js', 'promo.js', 'clearance.js', 'app.js'])
scripts = ('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" crossorigin="anonymous"></script>\n'
           '<script>\nconst PRODUCTS = ' + json.dumps(products, ensure_ascii=False) + ';\nconst FLAVOR_COLORS = ' + json.dumps(colors) + ';\n' + js + '\n</script>')
# the page's own Content-Security-Policy: only this exact inline script (by its hash) and Three.js from cdnjs may run,
# so a script injected through some field can't. _headers adds the rest (framing, connect, …) for every page.
import hashlib, base64, re
inline = re.search(r'<script>(.*?)</script>', scripts, re.S).group(1)
sha = base64.b64encode(hashlib.sha256(inline.encode()).digest()).decode()
csp = ("default-src 'self'; script-src 'sha256-" + sha + "' https://cdnjs.cloudflare.com; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; "
       "img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")
src = open('site/index.html').read().replace('<!--SCRIPTS-->', scripts).replace('<!--CSP-->', '<meta http-equiv="Content-Security-Policy" content="' + csp + '">')
open('index.html', 'w').write(src.replace('\n', '\n<!-- built by build.sh from site/: edit site/index.html and site/src/, not this file -->\n', 1))
print(f'built index.html  {len(src)/1e3:.0f} KB')
EOF

# admin.html gets the same product / flavor list (between the /*PRODUCTS*/ … /*END*/ markers)
python3 - <<'EOF'
import json, re
products = json.load(open('site/src/products.json'))
slim = [{'id': p['id'], 'name': p['name'], 'price': p['price'], 'flavors': [{'name': f['name'], 'nameCn': f['nameCn']} for f in p['flavors']]} for p in products]
s = open('admin.html').read()
s = re.sub(r'/\*PRODUCTS\*/.*?/\*END\*/', lambda m: '/*PRODUCTS*/' + json.dumps(slim, ensure_ascii=False) + '/*END*/', s, count=1, flags=re.S)
open('admin.html', 'w').write(s)
print('admin.html: product list updated')
EOF
