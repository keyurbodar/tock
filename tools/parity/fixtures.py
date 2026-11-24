import glob, json, os, re, sys
from bs4 import BeautifulSoup

DUMP = os.environ.get('PARITY_DUMP', os.path.expanduser('~/doop/dump-tnKVYw9CeC'))
ROOT = os.path.join(os.path.dirname(__file__), '../../packages/ui/parity')
SCRUB = [pair.split('=') for pair in os.environ.get('PARITY_SCRUB', '').split(',') if pair]
cache = {}

def clean(html):
    html = re.sub(r'\sdata-track-owner="[^"]*"', '', html)
    for old, new in SCRUB: html = html.replace(old, new)
    return html

def frame(fid):
    if fid not in cache:
        h = open(f'{DUMP}/frames/{fid}.html').read()
        cache[fid] = BeautifulSoup(h[h.index('<body'):], 'html.parser')
    return cache[fid]

def specimen(ref):
    if '#' in ref:
        fid, idx = ref.split('#')
        sp = frame(fid).select('.sec .sp-grid > .sp')[int(idx)]
        cap = sp.select_one('.sp-cap')
        return {'html': sp.select_one('.sp-box').decode_contents(), 'cap': ' | '.join(c.get_text(' ', strip=True) for c in cap.find_all('span')) if cap else '', 'box': sp.select_one('.sp-box').get('style', '')}
    fid, sel, idx = ref.split('|')
    return {'html': str(frame(fid).select(sel)[int(idx)]), 'cap': f'{fid} {sel}', 'box': ''}

refs = sorted({m for f in glob.glob(f'{ROOT}/cases/*.tsx') for m in re.findall(r'\[\s*"([\w-]+(?:#\d+|\|[^"]+\|\d+))"', open(f).read())})
out = {ref: specimen(ref) for ref in refs}
for item in out.values(): item['html'], item['cap'] = clean(item['html']), clean(item['cap'])
holes = [ref for ref, item in out.items() if 'bytes omitted' in item['html']]
if holes: sys.exit(f'truncated source specimens, pick clean ones: {holes}')
json.dump(out, open(f'{ROOT}/fixtures/specimens.json', 'w'), indent=1, ensure_ascii=False)
print('fixtures', len(out), 'bytes', os.path.getsize(f'{ROOT}/fixtures/specimens.json'))
