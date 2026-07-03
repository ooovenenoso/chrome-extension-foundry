#!/usr/bin/env python3
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

EXCLUDE_SUFFIXES = {'.map'}
EXCLUDE_NAMES = {'screenshot.png'}


def main() -> int:
    if len(sys.argv) != 2:
        print('usage: scripts/package-extension.py <extension-id>', file=sys.stderr)
        return 2
    ext_id = sys.argv[1]
    src = ROOT / 'src' / ext_id
    manifest_path = src / 'manifest.json'
    if not manifest_path.exists():
        print(f'missing manifest: {manifest_path}', file=sys.stderr)
        return 1
    manifest = json.loads(manifest_path.read_text())
    version = manifest['version']
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    zip_path = dist / f'{ext_id}-v{version}.zip'
    included = []
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(src.rglob('*')):
            if not path.is_file():
                continue
            rel = path.relative_to(src)
            if rel.parts[0] == 'tests' or path.suffix in EXCLUDE_SUFFIXES or path.name in EXCLUDE_NAMES:
                continue
            zf.write(path, rel.as_posix())
            included.append(rel.as_posix())
    print(f'wrote {zip_path}')
    for item in included:
        print(f'  {item}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
