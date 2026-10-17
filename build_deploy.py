"""Build a self-contained, offline installer for the current HA instance."""
from pathlib import Path
import base64
import json
import zlib

files = {name:Path(name).read_text(encoding='utf-8-sig') for name in ['energetika.yaml','energetika-card.js','energetika-history.js','energetika-settings.js','energetika-automation.js','energetika-alerts.js','energetika-hourly.js','energetika-dtek.js','patches/install_guard.py','patches/telemetry_guard.py','patches/install_modes.py','patches/install_controls.py','patches/control_guard.py']}
files.update({p.as_posix():p.read_text(encoding='utf-8') for p in Path('custom_components/energetika_dtek').glob('*') if p.suffix in ['.py','.json']})
payload=base64.b64encode(zlib.compress(json.dumps(files,ensure_ascii=False).encode(),9)).decode()
source='''"""Offline Energetika v2 installer. Back up first; no inverter commands."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,base64,json,zlib,shutil,importlib.util

PAYLOAD = %r

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--config',type=Path,required=True)
    root=parser.parse_args().config.resolve(strict=True)
    if not (root/'configuration.yaml').is_file():
        raise SystemExit('Not a Home Assistant configuration directory')
    files=json.loads(zlib.decompress(base64.b64decode(PAYLOAD)))
    stage=root/'energetika-install-v2'
    stage.mkdir(exist_ok=True)
    for name in ['install_guard.py','telemetry_guard.py','install_modes.py','install_controls.py','control_guard.py']:
        (stage/name).write_text(files['patches/'+name],encoding='utf-8')
    spec=importlib.util.spec_from_file_location('install_guard',stage/'install_guard.py')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.install(root)
    mode_spec=importlib.util.spec_from_file_location('install_modes',stage/'install_modes.py')
    mode_module=importlib.util.module_from_spec(mode_spec)
    mode_spec.loader.exec_module(mode_module)
    mode_module.install(root)
    control_spec=importlib.util.spec_from_file_location('install_controls',stage/'install_controls.py')
    control_module=importlib.util.module_from_spec(control_spec)
    control_spec.loader.exec_module(control_module)
    control_module.install(root)
    backup=root/('energetika-ui-backup-'+datetime.now(timezone.utc).strftime('%%Y%%m%%dT%%H%%M%%SZ'))
    backup.mkdir()
    for name,destination in [('energetika.yaml','energetika.yaml'),('energetika-card.js','www/energetika-card.js'),('energetika-history.js','www/energetika-history.js'),('energetika-settings.js','www/energetika-settings.js'),('energetika-automation.js','www/energetika-automation.js'),('energetika-alerts.js','www/energetika-alerts.js'),('energetika-hourly.js','www/energetika-hourly.js'),('energetika-dtek.js','www/energetika-dtek.js')]+[(name,name) for name in files if name.startswith('custom_components/energetika_dtek/')]:
        path=root/destination
        if path.is_symlink():raise SystemExit('Refusing symlink: '+str(path))
        path.parent.mkdir(parents=True,exist_ok=True)
        if path.exists():
            saved=backup/destination
            saved.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(path,saved)
        temporary=path.with_suffix(path.suffix+'.energetika-tmp')
        temporary.write_text(files[name],encoding='utf-8')
        temporary.replace(path)
    print('UI and YAML installed; backup:',backup)
    print('Restart Home Assistant; update resource URL to /local/energetika-card.js?v=2.9.2')
if __name__=='__main__': main()
''' % payload
Path('.deploy').mkdir(exist_ok=True)
Path('.deploy/install_energetika_v2.py').write_text(source,encoding='utf-8')
print('Offline installer:',len(source),'characters')
