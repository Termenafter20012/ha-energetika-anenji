"""Install the narrowly scoped guard into EyeBond Local 0.1.53.

python3 install_guard.py --config /homeassistant
Creates timestamped backups, verifies exact source versions, then writes atomically.
An upstream integration update may replace this patch: rerun only after review.
"""
import argparse
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import shutil


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def install(config: Path):
    root = config.resolve(strict=True)
    if not (root / "configuration.yaml").is_file():
        raise SystemExit("Not a Home Assistant configuration directory")
    integration = root / "custom_components" / "eybond_local"
    smg = integration / "drivers" / "smg.py"
    hub = integration / "runtime" / "hub.py"
    guard = integration / "drivers" / "telemetry_guard.py"
    source_guard = Path(__file__).with_name("telemetry_guard.py").read_text(encoding="utf-8")
    changes = {}
    for path, expected in [(smg, "59dea048f6544d30ccc10288d3df8b9d3b720a1b0b091c7eead3280a5ae00d63"),
                           (hub, "cece16c86dd5fe9e9010b56000356100ba7d8850cf6ef98d490e941f186b6991")]:
        if path.is_symlink():
            raise SystemExit(f"Refusing symlink: {path}")
        source = path.read_text(encoding="utf-8")
        if "Energetika telemetry guard" in source:
            if guard.is_file() and guard.read_text(encoding="utf-8") == source_guard:
                continue
            raise SystemExit("Existing patch differs; review required")
        if digest(source) != expected:
            raise SystemExit(f"Unexpected source version: {path}; no files modified")
        if path == smg:
            source = source.replace("from .base import InverterDriver", "from .base import InverterDriver\nfrom .telemetry_guard import validate_live_sample, priority_is_supported_for_monitoring  # Energetika telemetry guard", 1)
            anchor = '        values.update(_derive_inverter_clock(values))'
            assert source.count(anchor) == 1
            source = source.replace(anchor, '        validate_live_sample(values, inverter.variant_key)\n' + anchor, 1)
            anchor = '    if isinstance(output_source_priority, str) and output_source_priority.startswith("Unknown"):'
            assert source.count(anchor) == 1
            source = source.replace(anchor, '    if not priority_is_supported_for_monitoring(output_source_priority, variant_key):', 1)
        else:
            anchor = '    return _error_code(exc) in {\n        "request_timeout",'
            assert source.count(anchor) == 2
            source = source.replace(anchor, '    # Energetika telemetry guard: invalid sample must not reuse stale live power.\n    return _error_code(exc).startswith("invalid_live_sample:") or _error_code(exc) in {\n        "request_timeout",', 1)
        compile(source, str(path), "exec")
        changes[path] = source
    if not changes:
        print("Guard already installed; no changes")
        return
    compile(source_guard, str(guard), "exec")
    backup = root / ("energetika-backup-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    backup.mkdir()
    for path in changes:
        destination = backup / path.relative_to(root)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)
    for path, source in {guard: source_guard, **changes}.items():
        temporary = path.with_suffix(path.suffix + ".energetika-tmp")
        temporary.write_text(source, encoding="utf-8")
        temporary.replace(path)
    print(f"Installed guard. Backups: {backup}. Restart Home Assistant to activate.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    install(parser.parse_args().config)
