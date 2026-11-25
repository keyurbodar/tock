import os, re, sys
from bs4 import BeautifulSoup, NavigableString

DUMP = os.environ.get('PARITY_DUMP', os.path.expanduser('~/doop/dump-tnKVYw9CeC'))
RENAME = {'class': 'className', 'for': 'htmlFor', 'tabindex': 'tabIndex', 'viewbox': 'viewBox', 'crossorigin': 'crossOrigin', 'contenteditable': 'contentEditable', 'spellcheck': 'spellCheck', 'autocomplete': 'autoComplete', 'readonly': 'readOnly', 'maxlength': 'maxLength'}
DROP = {'data-track-owner', 'data-track-action', 'xmlns'}
VOID = {'input', 'img', 'br', 'hr', 'path', 'circle', 'rect', 'line', 'use'}

def camel(name):
    if name.startswith(('data-', 'aria-')): return name
    return RENAME.get(name, re.sub(r'[-:](\w)', lambda m: m.group(1).upper(), name))

def style(value):
    pairs = [d.split(':', 1) for d in value.split(';') if ':' in d]
    key = lambda k: repr(k) if k.startswith('--') else camel(k)
    body = ', '.join(f'{key(k.strip())}: {v.strip()!r}' for k, v in pairs)
    return '{{ ' + body + ' }}'

def attrs(node):
    out = []
    for name, value in node.attrs.items():
        if name in DROP: continue
        if isinstance(value, list): value = ' '.join(value)
        if name == 'style':
            if value.strip(): out.append(f'style={style(value)}')
        elif value == '' and not name.startswith(('data-', 'aria-', 'class', 'alt', 'value')): out.append(camel(name))
        else: out.append(f'{camel(name)}="{value}"' if '"' not in value else f"{camel(name)}={{{value!r}}}")
    return (' ' + ' '.join(out)) if out else ''

def emit(node, depth):
    pad = '  ' * depth
    if isinstance(node, NavigableString):
        text = str(node).strip()
        return [pad + (text if not re.search(r'[{}<>]', text) else '{' + repr(text) + '}')] if text else []
    kids = [line for child in node.children for line in emit(child, depth + 1)]
    if not kids: return [f'{pad}<{node.name}{attrs(node)} />']
    return [f'{pad}<{node.name}{attrs(node)}>', *kids, f'{pad}</{node.name}>']

if __name__ == '__main__':
    fid, sel, idx = sys.argv[1].split('|')
    html = open(f'{DUMP}/frames/{fid}.html').read()
    node = BeautifulSoup(html[html.index('<body'):], 'html.parser').select(sel)[int(idx)]
    if 'bytes omitted' in str(node): sys.exit('truncated specimen, pick a clean one')
    print('\n'.join(emit(node, 0)))
