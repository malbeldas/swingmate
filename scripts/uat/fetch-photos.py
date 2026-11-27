"""Free test photos for the UAT listings from Wikimedia Commons (DEC-017, UAT only).

Two steps, both run in GitHub Actions because the session network can't reach Commons:
1. No picks file: saves small candidates (CC0 or public domain, modern colour photos) to
   scripts/uat/photos/candidates/ with candidates.json, for a person to look through.
2. With scripts/uat/photos/picks.json ({"bed": [titles], "room": [titles]}): downloads exactly
   those files, crops them to 1200x900 (the size load.sql declares), credits them in CREDITS.md
   and removes the candidates.
"""
import io
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request

from PIL import Image

OUT = 'scripts/uat/photos'
CANDIDATES = f'{OUT}/candidates'
PICKS = f'{OUT}/picks.json'
API = 'https://commons.wikimedia.org/w/api.php'
UA = 'SwingMate-UAT-photos/1.0 (test data script)'
QUERIES = [
    'bedroom interior unsplash', 'modern bedroom unsplash', 'bedroom pexels', 'hotel room interior unsplash',
    'apartment interior unsplash', 'kitchen interior unsplash', 'modern kitchen pexels',
    'living room interior unsplash', 'living room pexels', 'bathroom interior unsplash', 'bathroom pexels',
]
FREE = re.compile(r'^(cc0|public domain|pd)', re.I)


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def query(params):
    params = {'action': 'query', 'format': 'json', 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata', **params}
    data = json.loads(get(f'{API}?{urllib.parse.urlencode(params)}'))
    return sorted(data.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 0))


def describe(page):
    info = (page.get('imageinfo') or [{}])[0]
    meta = info.get('extmetadata', {})
    licence = meta.get('LicenseShortName', {}).get('value', '').strip()
    author = re.sub('<[^>]+>', '', meta.get('Artist', {}).get('value', 'Unknown')).strip()
    return {'title': page['title'], 'url': info.get('thumburl') or info.get('url'), 'page': info.get('descriptionurl', ''),
            'licence': licence, 'author': author, 'width': info.get('width', 0), 'height': info.get('height', 1)}


def colourful(im):
    sat = im.convert('HSV').getchannel('S').resize((64, 48))
    return sum(sat.getdata()) / (64 * 48) > 35


def candidates():
    os.makedirs(CANDIDATES, exist_ok=True)
    seen, found = set(), []
    for text in QUERIES:
        pages = query({'generator': 'search', 'gsrnamespace': '6', 'gsrsearch': f'{text} filetype:bitmap', 'gsrlimit': '40', 'iiurlwidth': '480'})
        for item in map(describe, pages):
            if item['title'] in seen or not FREE.match(item['licence']) or item['width'] < 1200 or item['width'] < item['height'] * 1.2:
                continue
            seen.add(item['title'])
            try:
                im = Image.open(io.BytesIO(get(item['url']))).convert('RGB')
            except Exception as e:
                print('skip', item['title'], e, file=sys.stderr)
                continue
            if not colourful(im):
                continue
            item['file'] = f'c-{len(found):03d}.jpg'
            im.thumbnail((400, 300))
            im.save(f"{CANDIDATES}/{item['file']}", quality=75)
            found.append(item)
    json.dump(found, open(f'{CANDIDATES}/candidates.json', 'w'), indent=1)
    print(len(found), 'candidates')


def crop(im):
    w, h = im.size
    if w / h > 4 / 3:
        nw = int(h * 4 / 3)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w * 3 / 4)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return im.resize((1200, 900), Image.LANCZOS)


def download(picks):
    for old in os.listdir(OUT):
        if re.match(r'(bed|room)-\d+\.jpg$', old):
            os.remove(f'{OUT}/{old}')
    credits = ['# UAT test photos', '', 'From Wikimedia Commons, CC0 or public domain only, picked by hand. UAT test data only (DEC-017).', '']
    for role in ('bed', 'room'):
        for n, title in enumerate(picks[role]):
            item = describe(query({'titles': title, 'iiurlwidth': '1600'})[0])
            if not FREE.match(item['licence']):
                sys.exit(f'Not CC0 or public domain: {title} ({item["licence"]})')
            crop(Image.open(io.BytesIO(get(item['url']))).convert('RGB')).save(f'{OUT}/{role}-{n}.jpg', quality=82, optimize=True, progressive=True)
            credits.append(f"- `{role}-{n}.jpg`: [{title}]({item['page']}) · {item['author']} · {item['licence']}")
    open(f'{OUT}/CREDITS.md', 'w').write('\n'.join(credits) + '\n')
    shutil.rmtree(CANDIDATES, ignore_errors=True)


if os.path.exists(PICKS):
    download(json.load(open(PICKS)))
else:
    candidates()
