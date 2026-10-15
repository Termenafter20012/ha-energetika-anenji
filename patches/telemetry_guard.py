"""Plausibility checks for ANENJI 4200 Protocol 1 live registers.

Reject the complete sample before canonical flows and energy are calculated.
Zero is valid. Genuine load steps and short overloads remain visible.
This module does not send commands to the inverter.
"""

from math import isfinite


VARIANT = "anenji_4200_protocol_1"


def priority_is_supported_for_monitoring(value, variant_key: str) -> bool:
    """A stable firmware value 3 must not disable an otherwise identified unit.

    Keep its label Unknown (3): its operating meaning is not established.
    This does not add a writable enum option or relax identity anchors.
    """
    if isinstance(value, str) and value.startswith("Unknown"):
        return variant_key == VARIANT and value == "Unknown (3)"
    return True


# Limits include overload headroom; they are validation bounds, not protections.
LIMITS = {
    "output_power": (0, 8400),
    "output_va": (0, 10000),
    "grid_power": (-11000, 11000),
    "inverter_power": (-8400, 8400),
    "inverter_charging_power": (-4000, 4000),
    "battery_average_power": (-8400, 8400),
    "pv_power": (0, 5400),
    "pv_charging_power": (0, 5400),
    "grid_voltage": (0, 300),
    "inverter_voltage": (0, 300),
    "output_voltage": (0, 300),
    "battery_voltage": (0, 40),
    "pv_voltage": (0, 500),
    "inverter_current": (0, 60),
    "output_current": (0, 60),
    "battery_current": (-350, 350),
    "battery_average_current": (-350, 350),
    "charge_average_current": (0, 120),
    "pv_current": (0, 40),
    "pv_charging_current": (0, 120),
    "grid_frequency": (0, 70),
    "inverter_frequency": (0, 70),
    "output_frequency": (0, 70),
    "load_percent": (0, 250),
}


def validate_live_sample(values: dict, variant_key: str) -> None:
    """Raise for corrupt/offline sentinel values, only on the verified model."""
    if variant_key != VARIANT:
        return
    for key, (minimum, maximum) in LIMITS.items():
        if key not in values:
            continue
        value = values[key]
        if (isinstance(value, bool) or not isinstance(value, (int, float))
                or not isfinite(value) or not minimum <= value <= maximum):
            raise ValueError(f"invalid_live_sample:{key}={value!r}")
