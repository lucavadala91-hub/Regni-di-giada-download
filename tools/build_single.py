"""Unisce index.html, style.css e src/*.js in un unico file HTML apribile con doppio clic."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORDER = ['data.js', 'models.js', 'world.js', 'main.js']


def bundle_js():
    parts = ["import * as THREE from 'three';",
             "import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';"]
    for name in ORDER:
        src = (ROOT / 'src' / name).read_text(encoding='utf-8')
        src = re.sub(r"^import[\s\S]*?from\s+'[^']+';\s*$", '', src, flags=re.M)
        src = re.sub(r'^export\s+', '', src, flags=re.M)
        parts.append(f'// ---- {name} ----\n{src}')
    return '\n'.join(parts)


def build(fragment):
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'style.css').read_text(encoding='utf-8')
    css = ':root { color-scheme: dark; }\nhtml, body { height: 100%; }\n' + css
    html = html.replace('<link rel="stylesheet" href="style.css" />', f'<style>\n{css}</style>')
    html = html.replace('<script type="module" src="src/main.js"></script>',
                        f'<script type="module">\n{bundle_js()}\n</script>')
    if fragment:
        # versione per la pubblicazione: lo scheletro html/head/body viene aggiunto dall'host
        head = re.search(r'<head>([\s\S]*?)</head>', html).group(1)
        body = re.search(r'<body>([\s\S]*?)</body>', html).group(1)
        head = re.sub(r'<meta charset[^>]*>|<meta name="viewport"[^>]*>', '', head)
        html = head.strip() + '\n' + body.strip() + '\n'
    return html


if __name__ == '__main__':
    out = Path(sys.argv[1])
    out.write_text(build('--fragment' in sys.argv), encoding='utf-8')
    print('scritto', out, out.stat().st_size, 'byte')
