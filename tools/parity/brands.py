import os, re
from bs4 import BeautifulSoup
from jsx import DUMP, emit

FRAME, SKIP = 'QxcNt6VxLM', {'particle'}
OUT = os.path.join(os.path.dirname(__file__), '../../packages/ui/src/brand-marks.tsx')

html = open(f'{DUMP}/frames/{FRAME}.html').read()
groups = BeautifulSoup(html[html.index('<body'):], 'html.parser').select('[role=listbox][aria-label=Models] > [data-anchor]')
marks, families = {}, {}
for group in groups:
    svg = group.select_one(':scope > div > svg')
    if svg is None or group['data-anchor'] in SKIP: continue
    title = svg.find('title').extract().get_text()
    for name in group.select('[role=option] span.truncate'):
        families[re.match(r'[a-z]+', name.get_text(strip=True).lower()).group()] = group['data-anchor']
    marks[group['data-anchor']] = (title, svg.get('viewbox', '0 0 24 24'), [line for child in svg.children for line in emit(child, 2)])

lines = ['import type { ReactNode } from "react"', '', 'export const BRAND_MARKS: Readonly<Record<string, { readonly title: string; readonly viewBox: string; readonly paths: ReactNode }>> = {']
for name, (title, box, body) in sorted(marks.items()):
    lines += [f'  {name}: {{', f'    title: "{title}",', f'    viewBox: "{box}",', '    paths: (', '      <>', *['    ' + line for line in body], '      </>', '    ),', '  },']
lines += ['}', '', 'export const BRAND_FAMILIES: Readonly<Record<string, string>> = {', *[f'  {family}: "{brand}",' for family, brand in sorted(families.items())], '}', '']
open(OUT, 'w').write('\n'.join(lines))
print('brand marks', sorted(marks))
