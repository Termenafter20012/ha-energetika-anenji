"""Backport output-priority names to the installed EyeBond Local 0.1.53 model.

Only model metadata is changed. No control policy or inverter register is written.
Codes 0..3 follow current upstream SMG schema. Code 4 (SUF) is confirmed in
this owner's LCD menu and upstream SmartESS 0925 profile, plus ANENJI manual.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil

LABELS = ["Utility First (UTI)", "Solar First (SOL)", "Solar-Battery-Utility (SBU)", "Solar-Utility-Battery (SUB)", "Solar-Utility-Feed (SUF)"]
DESCRIPTIONS = ["Utility powers the load first.", "Solar powers the load first.", "Solar, then battery, then utility.", "Solar, then utility, then battery.", "Solar and utility; surplus solar may feed into the grid."]


def replacements(base):
    profile = "profiles/modbus_smg/models/anenji_4200_protocol_1.variant.json"
    schema = "register_schemas/modbus_smg/models/anenji_4200_protocol_1.json"
    result = {}
    for relative in [profile, schema]:
        original = (base / relative).read_text(encoding="utf-8")
        doc = json.loads(original)
        if relative == profile:
            doc["capabilities"] = [{"key": "output_source_priority", "choices": [
                {"value": code, "label": label, "order": code, "description": DESCRIPTIONS[code]}
                for code, label in enumerate(LABELS)
            ]}]
        else:
            doc["enum_tables"] = {"output_source_priority": {str(i): name for i, name in enumerate(LABELS)}}
        result[relative] = (original, json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    return result


# SHA-256 of the normalized UTF-8 source from tag v0.1.53.
EXPECTED = {'profiles/modbus_smg/models/anenji_4200_protocol_1.variant.json': '24ff0904a135544229d16e2b70dc3854c810cad691095f678da9b2e795364eee', 'register_schemas/modbus_smg/models/anenji_4200_protocol_1.json': 'fab083a95d1a0a8e2431df556e1a8f919641ecd2327bf9c69b816b4a40452164'}


def install(config):
    root = Path(config).resolve(strict=True)
    if not (root / "configuration.yaml").is_file():
        raise SystemExit("Not a Home Assistant configuration directory")
    base = root / "custom_components/eybond_local"
    changes = {}
    for relative, (original, updated) in replacements(base).items():
        path = base / relative
        if path.is_symlink():
            raise SystemExit("Refusing symlink: " + str(path))
        if original == updated:
            continue
        if hashlib.sha256(original.encode()).hexdigest() != EXPECTED[relative]:
            raise SystemExit("Unexpected source version; no files modified: " + relative)
        changes[path] = updated
    if not changes:
        print("Mode metadata already installed; no changes")
        return
    backup = root / ("energetika-mode-backup-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    backup.mkdir()
    for path in changes:
        destination = backup / path.relative_to(root)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)
    for path, updated in changes.items():
        temporary = path.with_suffix(path.suffix + ".energetika-tmp")
        temporary.write_text(updated, encoding="utf-8")
        temporary.replace(path)
    print("Mode metadata installed; backup:", backup)
    print("Restart Home Assistant to clear metadata caches. Control policy is unchanged.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    install(parser.parse_args().config)
