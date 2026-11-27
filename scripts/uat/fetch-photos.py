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
WANTED = [
    ('bed', 'bedroom interior', 8),
    ('room', 'kitchen interior home', 3),
    ('room', 'living room interior', 3),
    ('room', 'bathroom interior home', 2),
]
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
        if not FREE.match(licence.strip()):
            continue
        if info.get('width', 0) < 1200 or info.get('width', 0) < info.get('height', 1) * 1.2:
            continue
        author = re.sub('<[^>]+>', '', meta.get('Artist', {}).get('value', 'Unknown')).strip()
        yield {'title': page['title'], 'url': info.get('thumburl') or info['url'], 'page': info.get('descriptionurl', ''),
               'licence': licence, 'author': author}


def crop(raw):
    im = Image.open(io.BytesIO(raw)).convert('RGB')
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
    for role, text, n in WANTED:
        got = 0
        for item in search(text):
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
        print(role, text, got)
    open(f'{OUT}/CREDITS.md', 'w').write('\n'.join(credits) + '\n')
    if counts['bed'] < 3 or counts['room'] < 3:
        sys.exit(f'Not enough free photos: {counts}')


main()
