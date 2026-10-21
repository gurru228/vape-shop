#!/bin/sh
# Build the storefront: site/index.html + site/src/*.js → index.html at the repo root (what Netlify publishes).
# Product images stay as files under images/; Three.js r128 comes from the CDN.
cd "$(dirname "$0")"
python3 - <<'EOF'
import json
products = json.load(open('site/src/products.json'))
js = '\n'.join(open(f'site/src/{f}').read() for f in ['util.js', 'dash-model.js', 'ice-model.js', 'device.js', 'tags.js', 'stamps.js', 'account.js', 'checkout.js', 'promo.js', 'clearance.js', 'app.js'])
scripts = ('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n'
           '<script>\nconst PRODUCTS = ' + json.dumps(products, ensure_ascii=False) + ';\n' + js + '\n</script>')
src = open('site/index.html').read().replace('<!--SCRIPTS-->', scripts)
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
