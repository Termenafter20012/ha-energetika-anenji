"""One serialized executor for measured-solar decisions and outage preparation."""
from __future__ import annotations

import asyncio
from dataclasses import asdict
import math
import time

import voluptuous as vol
from homeassistant.const import Platform
from homeassistant.helpers import discovery
from homeassistant.helpers.storage import Store

from .policy import Memory, Sample, decide

DOMAIN = "energetika_control"
CONFIG_SCHEMA = vol.Schema({vol.Optional(DOMAIN): {}}, extra=vol.ALLOW_EXTRA)
P = "anenji_4200_protocol_1_"
AUTO = "input_boolean.energetika_solar_auto"
FAULT = "input_boolean.energetika_solar_fault"
MODE = "select." + P + "output_source_priority"
SOURCE = "select." + P + "charge_source_priority"
TOTAL = "number." + P + "max_charge_current"
AC = "number." + P + "max_ac_charge_current"
MODES = {"SBU": "Solar-Battery-Utility (SBU)", "SUB": "Solar-Utility-Battery (SUB)"}


class Controller:
    def __init__(self, hass):
        self.hass = hass
        self.store = Store(hass, 1, DOMAIN)
        self.memory = Memory()
        self.owned = {}
        self.result = ""
        self.status = {}
        self.listeners = set()
        self.lock = asyncio.Lock()
        self.saved = None

    def state(self, entity):
        obj = self.hass.states.get(entity)
        return obj.state if obj else "unknown"

    def attr(self, entity, key, default=None):
        obj = self.hass.states.get(entity)
        return obj.attributes.get(key, default) if obj else default

    def number(self, entity, default=None):
        try:
            value = float(self.state(entity))
            return value if math.isfinite(value) else default
        except (ValueError, TypeError):
            return default

    def recent(self, entity, seconds=120):
        obj = self.hass.states.get(entity)
        return bool(obj and obj.state not in ("unknown", "unavailable") and
                    0 <= time.time() - obj.last_reported.timestamp() < seconds)

    def stamp(self, entity):
        return float(self.attr(entity, "timestamp", 0) or 0)

    def active(self):
        return (self.state(AUTO) == "on" and self.state(FAULT) == "off"
                and self.stamp("input_datetime.energetika_solar_pause_until") <= time.time())

    def snapshot(self):
        now = time.time()
        ids = ["sensor." + P + key for key in
               ("pv_power", "load_power", "battery_voltage", "battery_power", "grid_power", "grid_voltage")]
        fresh = all(self.recent(e) for e in ids)
        pv, grid = self.number(ids[0]), self.number(ids[4])
        remaining = self.number("sensor.energetika_battery_remaining")
        soc = self.number("sensor.energetika_battery_percent_energy")
        voltage = self.number("sensor." + P + "battery_voltage")
        lower = self.number("sensor." + P + "battery_under_voltage_off_grid")
        average = self.number("sensor.energetika_pv_average")
        fresh = (fresh and self.state("binary_sensor." + P + "battery_connected") == "on"
                 and remaining is not None and soc is not None and average is not None
                 and pv is not None and 0 <= pv <= 5400 and grid is not None and abs(grid) <= 11000
                 and voltage is not None and 0 < voltage <= 40 and lower is not None
                 and self.attr("sensor.energetika_battery_remaining", "sample_valid") is True)
        dtek = "sensor.energetika_dtek_status"
        dtek_fresh = (self.attr(dtek, "fresh") is True
                      and 0 <= now - float(self.attr(dtek, "last_success", 0)) < 900
                      and not self.attr(dtek, "schedule_error")
                      and not self.attr(dtek, "multi_group") and not self.attr(dtek, "emergency"))
        grid_state = self.state("binary_sensor.energetika_grid_present")
        morning_start = self.stamp("input_datetime.energetika_morning_sbu_start")
        morning_end = self.stamp("input_datetime.energetika_morning_sbu_end")
        return Sample(
            now=now, fresh=bool(fresh), grid={"on": True, "off": False}.get(grid_state),
            mode=self.state(MODE).split("(")[-1].rstrip(")"),
            pv=pv or 0, pv_average=average or 0, grid_watts=grid,
            baseline=self.number("sensor.energetika_home_baseline", 550),
            soc=soc or 0, remaining=remaining or 0,
            critical=(soc is not None and soc <= 25) or
                     (voltage is not None and lower is not None and voltage <= lower + .2),
            day=self.state("sun.sun") == "above_horizon",
            entry_reserve=self.number("input_number.energetika_solar_entry_reserve", 35),
            coverage_target=self.number("input_number.energetika_solar_coverage_target", 50),
            morning=self.state("input_boolean.energetika_morning_sbu_active") == "on"
                    and 0 < morning_start <= now < morning_end,
            morning_start=morning_start,
            dtek_fresh=dtek_fresh, next_outage=float(self.attr(dtek, "next_outage_at", 0) or 0),
            energy_uncertain=self.attr("sensor.energetika_battery_remaining", "data_gap") is not False,
            enabled=self.state(AUTO) == "on",
            paused=self.stamp("input_datetime.energetika_solar_pause_until") > now,
            fault=self.state(FAULT) == "on",
            last_switch=self.stamp("input_datetime.energetika_solar_last_switch"),
        )

    async def save(self):
        data = {"policy": self.memory.persistent(), "owned": self.owned, "result": self.result}
        if data != self.saved:
            await self.store.async_save(data)
            # Store independent values; owned records are updated in place.
            import copy
            self.saved = copy.deepcopy(data)

    async def call(self, domain, service, data):
        await self.hass.services.async_call(domain, service, data, blocking=True)

    def writable(self, entity):
        return (self.state("sensor." + P + "control_mode") == "full"
                and self.state(entity) not in ("unknown", "unavailable")
                and self.attr(entity, "editable") is not False
                and self.attr(entity, "policy_editable") is not False
                and not self.attr(entity, "blocked_by_inverter"))

    def matches(self, entity, value):
        return abs(self.number(entity, -9999) - value) < .05 if isinstance(value, (int, float)) else self.state(entity) == value

    async def fault(self, message):
        self.result = message[:255]
        await self.call("input_boolean", "turn_on", {"entity_id": FAULT})
        await self.call("input_text", "set_value", {"entity_id": "input_text.energetika_solar_result", "value": self.result})
        await self.save()
        await self.notify("Энергетика · Автоматика остановлена", self.result)

    async def notify(self, title, message):
        if self.state("input_boolean.energetika_notify_modes") == "on":
            try:
                await self.call("script", "energetika_phone_notify", {"title": title, "message": message})
            except Exception:
                pass  # Notification failure never repeats an inverter write.

    async def write(self, entity, value):
        """One command, then read-back. An uncertain result latches the existing fault."""
        if self.matches(entity, value):
            return True
        if not self.writable(entity):
            self.result = "Ожидание разрешения инвертора: " + entity.split(P)[-1]
            return False
        if isinstance(value, (float, int)):
            minimum, maximum = self.attr(entity, "min"), self.attr(entity, "max")
            if minimum is None or maximum is None or not minimum <= value <= maximum:
                await self.fault("30 А не входят в разрешённый диапазон настройки инвертора.")
                return False
        elif value not in (self.attr(entity, "options") or []):
            await self.fault("Инвертор не предоставляет нужный вариант: " + value)
            return False
        domain = entity.split(".")[0]
        data = {"entity_id": entity, "value" if domain == "number" else "option": value}
        try:
            await asyncio.wait_for(self.call(domain, "set_value" if domain == "number" else "select_option", data), 45)
        except Exception:
            pass  # A lost ACK is not evidence of failure; only read-back decides.
        for _ in range(20):
            if self.matches(entity, value):
                return True
            await asyncio.sleep(1)
        await self.fault("Не подтверждено: " + entity.split(P)[-1] + ". Проверьте фактическое значение и возобновите авто.")
        return False

    async def acquire(self, entity, value):
        if self.matches(entity, value):
            return True
        sample = self.snapshot()
        if (not self.active() or not sample.fresh or sample.grid is not True
                or sample.mode != "SUB" or not decide(sample, self.memory).preparing):
            return False
        if entity not in self.owned:
            before = self.number(entity) if entity.startswith("number.") else self.state(entity)
            if before is None or before in ("unknown", "unavailable"):
                return False
            # Persist ownership before the external effect, including a possible lost ACK.
            self.owned[entity] = {"before": before, "value": value, "confirmed": False}
            await self.save()
        if await self.write(entity, value):
            self.owned[entity]["confirmed"] = True
            await self.save()
            return True
        return False

    async def reconcile(self):
        for entity, record in list(self.owned.items()):
            if self.state(entity) in ("unknown", "unavailable"):
                continue
            if self.matches(entity, record["value"]):
                record["confirmed"] = True
            elif self.matches(entity, record["before"]) and not record["confirmed"]:
                # An interrupted, unapplied command can be tried only after fault acknowledgement.
                del self.owned[entity]
            else:
                del self.owned[entity]
                if self.active():
                    await self.fault("Настройка заряда изменена вручную. Автоматика приостановлена; ручное значение сохранено.")
        await self.save()

    async def restore(self):
        if self.state(FAULT) != "off":
            return
        # Restore source first; restore currents in a valid AC <= total order.
        order = [SOURCE]
        current_total, current_ac = self.number(TOTAL), self.number(AC)
        if current_total is None or current_ac is None:
            self.result = "Ожидание связи для восстановления прежних пределов заряда."
            return
        total_target = self.owned.get(TOTAL, {}).get("before", current_total)
        ac_target = self.owned.get(AC, {}).get("before", current_ac)
        order += [AC, TOTAL] if current_ac > total_target else [TOTAL, AC]
        if ac_target > total_target:
            await self.fault("Нельзя восстановить токи: прежний ток сети выше общего. Проверьте настройки.")
            return
        for entity in order:
            record = self.owned.get(entity)
            if not record:
                continue
            if not self.matches(entity, record["value"]):
                continue  # Never overwrite a manual change.
            if not await self.write(entity, record["before"]):
                return
            del self.owned[entity]
            await self.save()
        if not self.owned:
            self.result = "Подготовка завершена. Прежние источник и пределы заряда восстановлены."

    async def apply_mode(self, d, s):
        if not self.active() or d.target not in MODES or d.switch_seconds > 0 or s.grid is False:
            return
        target = MODES[d.target]
        if self.state(MODE) == target or not self.writable(MODE):
            return
        # SBU needs current data; SUB may be the response to a data timeout.
        if d.target == "SBU" and not s.fresh:
            return
        await self.call("input_datetime", "set_datetime", {
            "entity_id": "input_datetime.energetika_solar_last_switch", "timestamp": time.time()})
        current = self.snapshot()
        latest = decide(current, self.memory)
        if not self.active() or current.grid is False or (d.target == "SBU" and
                                (not current.fresh or latest.preparing or current.critical)):
            return
        previous = current.mode
        if await self.write(MODE, target):
            self.result = f"Инвертор подтвердил {d.target}. {d.reason}"[:255]
            await self.call("input_text", "set_value", {
                "entity_id": "input_text.energetika_solar_result", "value": self.result})
            if d.target == "SUB" and current.morning:
                await self.call("input_boolean", "turn_off", {"entity_id": "input_boolean.energetika_morning_sbu_active"})
                await self.call("input_text", "set_value", {
                    "entity_id": "input_text.energetika_morning_sbu_result",
                    "value": ("Утреннее окно завершено: " + d.reason)[:255]})
            await self.notify(f"Энергетика · Автоматика включила {d.target}", f"{previous} → {d.target}. {d.reason}")

    async def evaluate(self, _call=None):
        if self.lock.locked():
            return
        async with self.lock:
            try:
                await self.reconcile()
                s = self.snapshot()
                d = decide(s, self.memory)
                await self.save()
                prepare = d.preparing and self.active() and s.grid is True
                if self.owned and not prepare:
                    await self.restore()
                await self.apply_mode(d, s)
                # Re-evaluate after mode confirmation: the user may have paused in the meantime.
                s = self.snapshot()
                d = decide(s, self.memory)
                if d.preparing and self.active() and s.fresh and s.grid is True and s.mode == "SUB":
                    targets = [(AC, 30)] if self.number(AC, 0) > 30 else []
                    targets += [(TOTAL, 30), (AC, 30), (SOURCE, "PV and Utility")]
                    for entity, value in targets:
                        if not await self.acquire(entity, value):
                            break
                    else:
                        self.result = "Подготовка активна: SUB · солнце + сеть · общий ток 30 А · от сети до 30 А."
                await self.save()
            except Exception as exc:
                await self.fault("Ошибка контроллера: " + type(exc).__name__ + ". Проверьте связь и возобновите авто.")
            finally:
                s = self.snapshot()
                d = decide(s, self.memory)
                self.status = {**asdict(d), "actual_mode": s.mode, "enabled": s.enabled,
                               "paused": s.paused, "fault": s.fault, "fresh": s.fresh,
                               "grid": s.grid, "pv": s.pv, "pv_average": s.pv_average,
                               "grid_watts": s.grid_watts, "soc": s.soc, "baseline": s.baseline,
                               "entry_reserve": s.entry_reserve, "coverage_target": s.coverage_target,
                               "pause_until": self.stamp("input_datetime.energetika_solar_pause_until"),
                               "charge_source": self.state(SOURCE), "ac_limit": self.number(AC),
                               "total_limit": self.number(TOTAL), "managed_settings": list(self.owned),
                               "result": self.result, "updated_at": time.time()}
                for listener in list(self.listeners):
                    listener()


async def async_setup(hass, config):
    controller = Controller(hass)
    saved = await controller.store.async_load() or {}
    controller.memory = Memory(**{k: v for k, v in saved.get("policy", {}).items()
                                 if k in ("outage_at", "schedule_seen", "preparing")})
    controller.owned = saved.get("owned", {})
    controller.result = saved.get("result", "")
    hass.data[DOMAIN] = controller
    hass.services.async_register(DOMAIN, "evaluate", controller.evaluate, schema=vol.Schema({}))
    await discovery.async_load_platform(hass, Platform.SENSOR, DOMAIN, {}, config)
    return True
