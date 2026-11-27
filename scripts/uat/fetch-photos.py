"""Fetch free test photos for the UAT listings from Wikimedia Commons (DEC-017, UAT only).

Only files whose licence is CC0 or public domain, landscape and at least 1200 px wide.
Each one is cropped to 1200x900 (the size scripts/uat/load.sql declares) and credited in
scripts/uat/photos/CREDITS.md. Runs in GitHub Actions: the session network can't reach Commons.
"""
import io
import json
import re
import sys
import urllib.parse
import urllib.request

from PIL import Image

OUT = 'scripts/uat/photos'
API = 'https://commons.wikimedia.org/w/api.php'
UA = 'SwingMate-UAT-photos/1.0 (test data script)'
# role, Commons search, how many
# Modern photos only: Commons keeps CC0 copies of Unsplash and Pexels photos, marked in the title.
WANTED = [
    ('bed', ['bedroom unsplash', 'bedroom pexels', 'bed room interior unsplash'], 8),
    ('room', ['kitchen unsplash', 'kitchen pexels'], 3),
    ('room', ['living room unsplash', 'living room pexels', 'lounge room unsplash'], 3),
    ('room', ['bathroom unsplash', 'bathroom pexels'], 2),
]
MODERN = re.compile(r'unsplash|pexels', re.I)
FREE = re.compile(r'^(cc0|public domain|pd)', re.I)


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def search(text):
    params = {
        'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': '6',
        'gsrsearch': f'{text} filetype:bitmap', 'gsrlimit': '50',
        'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata', 'iiurlwidth': '1600',
    }
    data = json.loads(get(f'{API}?{urllib.parse.urlencode(params)}'))
    pages = sorted(data.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 0))
    for page in pages:
        info = (page.get('imageinfo') or [{}])[0]
        meta = info.get('extmetadata', {})
        licence = meta.get('LicenseShortName', {}).get('value', '')
        if not FREE.match(licence.strip()) or not MODERN.search(page['title']):
            continue
        if info.get('width', 0) < 1200 or info.get('width', 0) < info.get('height', 1) * 1.2:
            continue
        author = re.sub('<[^>]+>', '', meta.get('Artist', {}).get('value', 'Unknown')).strip()
        yield {'title': page['title'], 'url': info.get('thumburl') or info['url'], 'page': info.get('descriptionurl', ''),
               'licence': licence, 'author': author}


def colourful(im):
    # Drops black-and-white and sepia scans: mean saturation must be clear of grey.
    sat = im.convert('HSV').getchannel('S').resize((64, 48))
    return sum(sat.getdata()) / (64 * 48) > 40


def crop(raw):
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    if not colourful(im):
        raise ValueError('not colour')
    w, h = im.size
    target = 4 / 3
    if w / h > target:
        nw = int(h * target)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return im.resize((1200, 900), Image.LANCZOS)


def main():
    counts = {'bed': 0, 'room': 0}
    credits = ['# UAT test photos', '', 'From Wikimedia Commons, CC0 or public domain only. UAT test data only (DEC-017).', '']
    seen = set()
    for role, texts, n in WANTED:
        got = 0
        items = (item for text in texts for item in search(text))
        for item in items:
            if got >= n or item['title'] in seen:
                continue
            try:
                image = crop(get(item['url']))
            except Exception as e:  # a broken file is skipped, not fatal
                print('skip', item['title'], e, file=sys.stderr)
                continue
            name = f'{role}-{counts[role]}.jpg'
            image.save(f'{OUT}/{name}', quality=82, optimize=True, progressive=True)
            counts[role] += 1
            got += 1
            seen.add(item['title'])
            credits.append(f"- `{name}`: [{item['title']}]({item['page']}) · {item['author']} · {item['licence']}")
        print(role, texts, got)
    open(f'{OUT}/CREDITS.md', 'w').write('\n'.join(credits) + '\n')
    if counts['bed'] < 4 or counts['room'] < 4:
        sys.exit(f'Not enough free photos: {counts}')


main()
