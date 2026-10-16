"""Install ANENJI write recovery and owner frequency lock in EyeBond 0.1.53.

Requires the existing Energetika telemetry guard. Never writes inverter registers.
"""
import argparse
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import shutil

EXPECTED = {
    'drivers/smg.py': 'd4abe493f04948ae0ac6e43362e074adbbb9d8cead2e4e9585f7ff991303ccc7',
    'runtime/hub.py': '3e912583c27cfb33a8b76d9b50adb72d2a35468446f923132e82fc7911d073b2',
    'runtime/coordinator.py': 'db0d2e181a39ec72929b21af24fe97bcc5d7db8d3eb505295485b725de539427',
}


def replace_once(source, anchor, replacement):
    if source.count(anchor) != 1:
        raise SystemExit('Source anchor differs; no files modified')
    return source.replace(anchor, replacement, 1)


def patched(name, source):
    if name == 'drivers/smg.py':
        source = replace_once(source, 'from .base import InverterDriver', 'from .base import InverterDriver\nfrom .control_guard import async_write_with_readback  # Energetika write guard')
        return replace_once(source, '        await session.write_holding(capability.register, raw_words)', '        await async_write_with_readback(session, inverter, capability, raw_words)')
    if name == 'runtime/hub.py':
        source = replace_once(source, 'from ..drivers.base import InverterDriver', 'from ..drivers.base import InverterDriver\nfrom ..drivers.control_guard import VARIANT, enforce_write_policy, annotate_write_policy  # Energetika write guard')
        source = replace_once(source, '        capability = self._inverter.get_capability(capability_key)\n        runtime_state', '        capability = self._inverter.get_capability(capability_key)\n        enforce_write_policy(self._inverter, capability_key, value, snapshot.values)\n        runtime_state')
        source = replace_once(source, '                if attempt == 0 and _is_retryable_collector_error(exc):', '                if attempt == 0 and self._inverter.variant_key != VARIANT and _is_retryable_collector_error(exc):')
        return replace_once(source, '        if last_error:\n            values["last_error"] = last_error', '        annotate_write_policy(self._inverter, values)\n        if last_error:\n            values["last_error"] = last_error')
    source = replace_once(source, 'from homeassistant.config_entries import ConfigEntry', 'from homeassistant.config_entries import ConfigEntry\nfrom homeassistant.exceptions import HomeAssistantError\nfrom ..drivers.control_guard import VARIANT, friendly_write_error  # Energetika write guard')
    return replace_once(source, '        except Exception:\n            await self.async_request_refresh()\n            raise\n        await self.async_request_refresh()\n        return written_value', '        except Exception as exc:\n            await self.async_request_refresh()\n            if inverter.variant_key == VARIANT:\n                logger.warning("Inverter write %s failed: %s", capability_key, exc)\n                raise HomeAssistantError(friendly_write_error(exc)) from exc\n            raise\n        await self.async_request_refresh()\n        return written_value')


def install(config):
    root = Path(config).resolve(strict=True)
    if not (root / 'configuration.yaml').is_file():
        raise SystemExit('Not a Home Assistant configuration directory')
    base = root / 'custom_components/eybond_local'
    helper = base / 'drivers/control_guard.py'
    helper_source = Path(__file__).with_name('control_guard.py').read_text(encoding='utf-8-sig')
    compile(helper_source, str(helper), 'exec')
    changes = {}
    for name, expected in EXPECTED.items():
        path = base / name
        if path.is_symlink():
            raise SystemExit('Refusing symlink: ' + str(path))
        source = path.read_text(encoding='utf-8')
        if 'Energetika write guard' in source:
            # Reconstruct and verify the exact prior source, preserving other guards.
            original = unpatched(name, source)
            if hashlib.sha256(original.encode()).hexdigest() != expected or patched(name, original) != source:
                raise SystemExit('Existing write patch differs: ' + name)
            continue
        if hashlib.sha256(source.encode()).hexdigest() != expected:
            raise SystemExit('Unexpected source version; no files modified: ' + name)
        updated = patched(name, source)
        compile(updated, str(path), 'exec')
        changes[path] = updated
    if helper.is_symlink():
        raise SystemExit('Refusing symlink: ' + str(helper))
    if helper.exists() and helper.read_text(encoding='utf-8') != helper_source:
        raise SystemExit('Existing control helper differs; no files modified')
    if not helper.exists():
        changes[helper] = helper_source
    if not changes:
        print('Write controls already installed; no changes')
        return
    backup = root / ('energetika-controls-backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir()
    for path in changes:
        if path.exists():
            target = backup / path.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
    # Helper first, then imports; all sources were checked before any mutation.
    ordered = sorted(changes, key=lambda p: p != helper)
    for path in ordered:
        tmp = path.with_suffix(path.suffix + '.energetika-tmp')
        tmp.write_text(changes[path], encoding='utf-8')
        tmp.replace(path)
    print('Write controls installed; backup:', backup)
    print('Restart Home Assistant. No inverter settings were changed.')


def unpatched(name, source):
    if name == 'drivers/smg.py':
        return source.replace('\nfrom .control_guard import async_write_with_readback  # Energetika write guard','',1).replace('        await async_write_with_readback(session, inverter, capability, raw_words)','        await session.write_holding(capability.register, raw_words)',1)
    if name == 'runtime/hub.py':
        return source.replace('\nfrom ..drivers.control_guard import VARIANT, enforce_write_policy, annotate_write_policy  # Energetika write guard','',1).replace('        enforce_write_policy(self._inverter, capability_key, value, snapshot.values)\n','',1).replace('if attempt == 0 and self._inverter.variant_key != VARIANT and _is_retryable_collector_error(exc):','if attempt == 0 and _is_retryable_collector_error(exc):',1).replace('        annotate_write_policy(self._inverter, values)\n','',1)
    return source.replace('\nfrom homeassistant.exceptions import HomeAssistantError\nfrom ..drivers.control_guard import VARIANT, friendly_write_error  # Energetika write guard','',1).replace('        except Exception as exc:\n            await self.async_request_refresh()\n            if inverter.variant_key == VARIANT:\n                logger.warning("Inverter write %s failed: %s", capability_key, exc)\n                raise HomeAssistantError(friendly_write_error(exc)) from exc\n            raise\n        await self.async_request_refresh()\n        return written_value','        except Exception:\n            await self.async_request_refresh()\n            raise\n        await self.async_request_refresh()\n        return written_value',1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    install(parser.parse_args().config)
