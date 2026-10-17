"""Bounded local archive of received weather, schedules and observed grid state."""
from __future__ import annotations

from datetime import date, datetime, timedelta
import hashlib
import time
from zoneinfo import ZoneInfo

import aiohttp

from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store

KYIV = ZoneInfo("Europe/Kyiv")
WEATHER = "sensor.energetika_solar_weather"
GRID = "binary_sensor.energetika_grid_present"
FIELDS = ("temperature_2m", "cloud_cover", "weather_code", "is_day", "shortwave_radiation")
# Public city-centre coordinates, identical to the existing weather configuration.
RECENT_WEATHER = "https://api.open-meteo.com/v1/forecast?latitude=46.4825&longitude=30.7233&hourly=temperature_2m,cloud_cover,weather_code,is_day,shortwave_radiation&timezone=Europe%2FKyiv&timeformat=unixtime&forecast_days=1&past_days=7"


def key_at(timestamp):
    return datetime.fromtimestamp(timestamp, KYIV).date().isoformat()


def address_key(address):
    return hashlib.sha256("\n".join(str(address.get(k, "")) for k in ("city", "street", "house")).encode()).hexdigest()


class Archive:
    def __init__(self, hass, manager):
        self.hass, self.manager = hass, manager
        self.store = Store(hass, 1, "energetika_history")
        self.data = {"weather": {}, "plans": {}, "grid": [], "last_seen": 0}
        self.cancel_listener = None
        self._recent_attempt = 0

    async def start(self):
        saved = await self.store.async_load()
        if isinstance(saved, dict):
            self.data.update({k: v for k, v in saved.items() if k in self.data})
        now, seen = time.time(), self.data.get("last_seen", 0)
        if seen and now - seen > 150:
            self._grid(seen + 90, "unknown")
        self.observe()
        self.capture_schedule(self.manager.address, self.manager.data.get("schedule", []), self.manager.last_success)
        self.cancel_listener = async_track_state_change_event(self.hass, [WEATHER, GRID], self.changed)
        self.persist()

    def _grid(self, timestamp, state):
        state = state if state in ("on", "off") else "unknown"
        rows = self.data["grid"]
        if not rows or rows[-1]["state"] != state:
            rows.append({"t": timestamp, "state": state})

    async def changed(self, event):
        state = event.data.get("new_state")
        if event.data["entity_id"] == GRID:
            self._grid(time.time(), state.state if state else "unknown")
        elif state:
            self.capture_weather(state.attributes.get("hourly", {}), "saved_forecast")
        self.data["last_seen"] = time.time()
        self.persist()

    def observe(self):
        grid = self.hass.states.get(GRID)
        self._grid(time.time(), grid.state if grid else "unknown")
        weather = self.hass.states.get(WEATHER)
        if weather:
            self.capture_weather(weather.attributes.get("hourly", {}), "saved_forecast")
        self.data["last_seen"] = time.time()
        self.prune()

    def capture_weather(self, hourly, source):
        times = hourly.get("time", []) if isinstance(hourly, dict) else []
        now, today = time.time(), key_at(time.time())
        grouped = {}
        for i, timestamp in enumerate(times):
            if not isinstance(timestamp, (int, float)):
                continue
            row = {"t": timestamp, "end": timestamp + 3600, "source": source}
            for field in FIELDS:
                values = hourly.get(field, [])
                row[field] = values[i] if i < len(values) else None
            # Radiation at the ending timestamp is the mean of the preceding hour.
            values = hourly.get("shortwave_radiation", [])
            row["radiation"] = values[i + 1] if i + 1 < len(values) and i + 1 < len(times) and times[i + 1] == timestamp + 3600 else None
            grouped.setdefault(key_at(timestamp), []).append(row)
        for day, rows in grouped.items():
            existing = self.data["weather"].get(day)
            if day < today and existing and source == "saved_forecast":
                continue
            self.data["weather"][day] = {"rows": rows, "saved_at": now, "source": source}

    def capture_schedule(self, address, rows, captured=None):
        if not address or not rows:
            return
        grouped = {}
        for row in rows:
            if isinstance(row, dict) and row.get("date"):
                grouped.setdefault(row["date"], []).append(dict(row))
        addr = address_key(address)
        for day, items in grouped.items():
            self.data["plans"][addr + ":" + day] = {"date": day, "rows": items, "saved_at": captured or time.time()}
        self.prune()
        self.persist()

    async def recent_weather(self):
        if time.time() - self._recent_attempt < 3600:
            return
        self._recent_attempt = time.time()
        try:
            async with self.manager.client.session.get(RECENT_WEATHER, timeout=aiohttp.ClientTimeout(total=25)) as response:
                response.raise_for_status()
                data = await response.json()
            self.capture_weather(data.get("hourly", {}), "recent_model")
            self.prune()
            self.persist()
        except (aiohttp.ClientError, TimeoutError, ValueError):
            # Existing archive remains usable when the network is down.
            pass

    def prune(self):
        cutoff = time.time() - 90 * 86400
        first = key_at(cutoff)
        self.data["weather"] = {k: v for k, v in self.data["weather"].items() if k >= first}
        self.data["plans"] = {k: v for k, v in self.data["plans"].items() if v.get("date", "") >= first}
        grid = self.data["grid"]
        previous = [r for r in grid if r["t"] < cutoff]
        self.data["grid"] = previous[-1:] + [r for r in grid if r["t"] >= cutoff]

    def persist(self):
        self.store.async_delay_save(lambda: self.data, 15)

    def snapshot(self, day):
        start = datetime.combine(date.fromisoformat(day), datetime.min.time(), KYIV).timestamp()
        end = datetime.combine(date.fromisoformat(day) + timedelta(days=1), datetime.min.time(), KYIV).timestamp()
        rows = self.data["grid"]
        previous = [r for r in rows if r["t"] <= start]
        grid = previous[-1:] + [r for r in rows if start < r["t"] < min(end, time.time())]
        addr = address_key(self.manager.address)
        plan = self.data["plans"].get(addr + ":" + day, {})
        return {"date": day, "start": start, "end": end, "weather": self.data["weather"].get(day),
                "schedule": plan.get("rows", []), "schedule_saved_at": plan.get("saved_at"),
                "grid": grid, "grid_until": min(time.time(), self.data["last_seen"]),
                "weather_days": sorted(self.data["weather"]),
                "schedule_days": sorted(v["date"] for k, v in self.data["plans"].items() if k.startswith(addr + ":")),
                "retention_days": 90}

    async def stop(self):
        if self.cancel_listener:
            self.cancel_listener()
        self.data["last_seen"] = time.time()
        await self.store.async_save(self.data)
