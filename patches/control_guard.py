"""ANENJI 24 V write rules and recovery without repeating a write command."""
from __future__ import annotations

import asyncio
import math

from ..payload.modbus import ModbusError

VARIANT = "anenji_4200_protocol_1"
FREQUENCY_LOCK = "Изменение частоты запрещено владельцем. Параметр доступен только для просмотра."


def _number(values, key):
    value = values.get(key)
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def enforce_write_policy(inverter, key, value, values):
    """Validate documented coupled settings against a fresh runtime snapshot."""
    if inverter.variant_key != VARIANT:
        return
    if key == "output_rating_frequency":
        raise PermissionError(FREQUENCY_LOCK)
    relations = {
        "battery_under_voltage_off_grid": ("battery_under_voltage", "lt", "Нижний порог без сети должен быть минимум на 0,1 В ниже порога перехода на сеть."),
        "battery_under_voltage": ("battery_under_voltage_off_grid", "gt", "Порог перехода на сеть должен быть минимум на 0,1 В выше автономного отключения."),
        "battery_float_voltage": ("battery_bulk_voltage", "le", "Поддерживающее напряжение не должно превышать напряжение основного заряда."),
        "battery_bulk_voltage": ("battery_float_voltage", "ge", "Напряжение основного заряда не должно быть ниже поддерживающего."),
        "max_ac_charge_current": ("max_charge_current", "le", "Ток заряда от сети не должен превышать общий ток заряда."),
        "max_charge_current": ("max_ac_charge_current", "ge", "Общий ток заряда не должен быть ниже ограничения заряда от сети."),
    }
    if key not in relations:
        return
    other_key, comparison, message = relations[key]
    other = _number(values, other_key)
    requested = _number({key: value}, key)
    if other is None or requested is None:
        raise ValueError("Нет свежих данных для проверки связанных параметров. Дождитесь восстановления связи.")
    valid = {"lt": requested <= other - 0.1 + 0.00001,
             "gt": requested >= other + 0.1 - 0.00001,
             "le": requested <= other + 0.00001,
             "ge": requested >= other - 0.00001}[comparison]
    if not valid:
        raise ValueError(f"{message} Связанный параметр сейчас: {other:g}.")


def annotate_write_policy(inverter, values):
    """Expose the permanent frequency lock through native HA control metadata."""
    if inverter is not None and inverter.variant_key == VARIANT:
        values["capability_block_reason_output_rating_frequency"] = FREQUENCY_LOCK
        values["capability_block_code_output_rating_frequency"] = "owner_frequency_lock"


async def async_write_with_readback(session, inverter, capability, words):
    """Confirm saved raw words, including a lost ACK; never resend the write."""
    if inverter.variant_key == VARIANT and capability.key == "output_rating_frequency":
        raise PermissionError(FREQUENCY_LOCK)
    try:
        await session.write_holding(capability.register, words)
    except ModbusError as exc:
        code = str(exc)
        ambiguous = code in {"response_too_short", "crc_mismatch", "request_timeout"} or code.startswith("unexpected_length:")
        if inverter.variant_key != VARIANT or capability.value_kind == "action" or not ambiguous:
            raise
    if inverter.variant_key != VARIANT or capability.value_kind == "action":
        return
    await asyncio.sleep(0.25)
    try:
        actual = await session.read_holding(capability.register, len(words))
    except Exception as exc:
        raise ModbusError(f"write_not_confirmed:{capability.key}:readback_failed") from exc
    if actual != words:
        raise ModbusError(f"write_not_confirmed:{capability.key}:readback_mismatch")


def friendly_write_error(exc):
    """Keep expected failures readable in the native HA service toast as well."""
    text = str(exc)
    if "illegal_data_value:" in text or "exception_code:3" in text:
        return "Инвертор отклонил это значение. Проверьте связанные пороги и выбранный тип АКБ на его экране. Автоматического повтора нет."
    if any(code in text for code in ("response_too_short", "crc_mismatch", "request_timeout", "write_not_confirmed:", "collector_", "unexpected_length:")):
        return "Не удалось подтвердить запись по связи. Команда могла выполниться; проверьте поле «Сейчас» перед повтором."
    if text and any("А" <= char <= "я" for char in text):
        return text
    return "Инвертор не разрешил изменение. Проверьте его состояние, ограничения параметра и соединение."
