"""Verify a generated portable folder and every ZIP member without extracting it."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

package = Path(sys.argv[1]).resolve()
manifest = json.loads((package / 'package-manifest.json').read_text(encoding='utf-8'))
expected = {entry['path']: entry['sha256'] for entry in manifest['files']}
actual = {path.relative_to(package).as_posix() for path in package.rglob('*') if path.is_file()}
assert actual == set(expected) | {'package-manifest.json'}, 'Unexpected or missing package files'
assert {'Forma.exe', 'LICENSE', 'LICENSES.chromium.html'} <= actual
assert 'Administrar-Studio.cmd' not in actual
assert not any(part == '.data' or part.startswith('.env') for name in actual for part in Path(name).parts)
with zipfile.ZipFile(str(package) + '.zip') as archive:
    members = {name for name in archive.namelist() if not name.endswith('/')}
    assert members == {package.name + '/' + name for name in actual}, 'ZIP file list differs'
    for name in actual:
        digest = hashlib.sha256((package / name).read_bytes()).hexdigest()
        if name in expected:
            assert digest == expected[name], name
        assert hashlib.sha256(archive.read(package.name + '/' + name)).hexdigest() == digest, name
root = Path(__file__).resolve().parents[1]
for name in ['apps/desktop/main.cjs', 'apps/desktop/preload.cjs', 'apps/desktop/runtime.cjs', 'apps/desktop/admin.cjs', 'dist/index.html', 'dist-api/desktop.cjs', 'dist-api/operator.cjs']:
    source = root / ('dist-desktop/index.html' if name == 'dist/index.html' else name)
    assert (package / 'resources/app' / name).read_bytes() == source.read_bytes(), 'Source/build drift: ' + name
print(json.dumps({'pass': True, 'package': str(package), 'files': len(actual), 'zipBytes': Path(str(package) + '.zip').stat().st_size}))
