"""Public DTEK session and address lookups, adapted from the owner's Android app."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from html import unescape
from html.parser import HTMLParser
import json
import re
import time
from zoneinfo import ZoneInfo

import aiohttp

BASE = "https://www.dtek-oem.com.ua"
PAGE = BASE + "/ua/shutdowns"
KYIV = ZoneInfo("Europe/Kyiv")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


class DtekError(Exception):
    """A safe, non-sensitive message for the UI; no addresses or session tokens."""


class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.csrf = ""

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag.lower() == "meta" and values.get("name", "").lower() == "csrf-token":
            self.csrf = values.get("content", "")


def site_datetime(value):
    """Never guess tomorrow from an expired time, or invent a date for HH:MM."""
    value = str(value or "").strip()
    if not value:
        return None
    try:
        if value.isdigit() and len(value) >= 10:
            return datetime.fromtimestamp(int(value) / (1000 if len(value) > 10 else 1), KYIV).timestamp()
        result = datetime.fromisoformat(value)
        return result.replace(tzinfo=result.tzinfo or KYIV).timestamp()
    except ValueError:
        pass
    for fmt in ("%H:%M %d.%m.%Y", "%H:%M:%S %d.%m.%Y", "%d.%m.%Y %H:%M", "%d.%m.%Y %H:%M:%S", "%d.%m.%y %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=KYIV).timestamp()
        except ValueError:
            continue
    return None


def normalize(value):
    return re.sub(r"\s+", "", str(value)).casefold()


def schedule_rows(fact, preset, groups):
    """Expand documented hourly/half-hour cells into intervals, keeping unknowns."""
    result = []
    zones = preset.get("time_zone", {}) if isinstance(preset, dict) else {}
    if not isinstance(zones, dict):
        return result
    keys = list(zones)
    offsets = {}
    for index, key in enumerate(keys):
        label = zones[key][0] if isinstance(zones[key], list) and zones[key] else zones[key]
        match = re.match(r"\s*(\d{1,2})[:.](\d{2})", str(label))
        if match and int(match[1]) < 24 and int(match[2]) < 60:
            offsets[key] = int(match[1]) * 60 + int(match[2])
        elif len(keys) == 24 and all(str(k).isdigit() for k in keys):
            numbers = sorted(int(k) for k in keys)
            if numbers in [list(range(24)), list(range(1, 25))]:
                offsets[key] = (int(key) - min(numbers)) * 60
    data = fact.get("data", {}) if isinstance(fact, dict) else {}
    if not isinstance(data, dict):
        return result
    for date_key, day in data.items():
        try:
            midnight = datetime.fromtimestamp(float(date_key), KYIV).replace(hour=0, minute=0, second=0, microsecond=0)
        except (ValueError, TypeError, OverflowError, OSError):
            continue
        if not isinstance(day, dict):
            continue
        for group in groups:
            cells = day.get(group, {})
            if not isinstance(cells, dict):
                continue
            for key, minute in offsets.items():
                code = str(cells.get(key, "unknown"))
                for half in range(2):
                    kind = "unknown"
                    if code == "yes":
                        kind = "on"
                    elif code == "no":
                        kind = "off"
                    elif code == "maybe":
                        kind = "possible"
                    elif code in ("first", "second", "mfirst", "msecond"):
                        off_half = 0 if code.endswith("first") else 1
                        kind = ("possible" if code.startswith("m") else "off") if half == off_half else "on"
                    start = (midnight + timedelta(minutes=minute + 30 * half)).timestamp()
                    end = (midnight + timedelta(minutes=minute + 30 * (half + 1))).timestamp()
                    if end > start:
                        result.append({"group": group, "date": midnight.strftime("%Y-%m-%d"), "start": start, "end": end, "kind": kind})
    merged = []
    for row in sorted(result, key=lambda r: (r["group"], r["start"])):
        if merged and all(merged[-1][k] == row[k] for k in ("group", "kind", "date")) and merged[-1]["end"] == row["start"]:
            merged[-1]["end"] = row["end"]
        else:
            merged.append(dict(row))
    return merged


def parse_status(payload, address, fact, preset):
    houses = payload.get("data")
    if not payload.get("result") or not isinstance(houses, dict):
        raise DtekError("ДТЭК не вернул данные выбранного адреса.")
    home = next((v for k, v in houses.items() if normalize(k) == normalize(address["house"])), None)
    if not isinstance(home, dict):
        raise DtekError("Номер дома не найден в ответе ДТЭК. Выберите его из списка.")
    if not {"sub_type", "start_date", "end_date"}.issubset(home):
        raise DtekError("Формат статуса ДТЭК изменился. Наличие света по этому ответу не подтверждено.")
    status_visible = payload.get("showCurOutageParam", True) not in (False, 0, "0")
    reason = unescape(str(home.get("sub_type") or "")).strip()
    start_raw, end_raw = (str(home.get(k) or "").strip() for k in ("start_date", "end_date"))
    outage = status_visible and bool(reason or start_raw or end_raw)
    emergency = bool(re.search(r"екстр|аварійне без застосування", reason, re.I))
    groups = home.get("sub_type_reason") or []
    if isinstance(groups, str):
        groups = [groups]
    groups = [str(g) for g in groups][:8] if isinstance(groups, (list, tuple)) else []
    rows = schedule_rows(fact, preset, groups) if not emergency and payload.get("showCurSchedule", True) else []
    now = time.time()
    # A multi-feed house has no unambiguous schedule until its line is known.
    selected = rows if len(groups) == 1 else []
    current = next((r for r in selected if r["start"] <= now < r["end"] and r["kind"] == "off"), None)
    future = next((r for r in selected if r["start"] > now and r["kind"] == "off"), None)
    def confirmed_end(episode):
        if episode is None:
            return None
        cursor = episode["end"]
        for row in selected:
            if row["start"] < cursor:
                continue
            if row["start"] != cursor:
                return None
            if row["kind"] == "on":
                return cursor
            if row["kind"] != "off":
                return None
            cursor = row["end"]
        return None
    end = site_datetime(end_raw) if outage else None
    source = "site_status" if end else None
    if outage and not end and current and not emergency:
        end = confirmed_end(current)
        source = "daily_schedule" if end else None
    if not status_visible:
        original = "ДТЕК тимчасово не відображає поточний статус відключення. Наявність світла не підтверджено."
    elif outage:
        original = "За вашою адресою в даний момент відсутня електроенергія.\n"
        original += "Причина: " + ("планові ремонтні роботи" if str(home.get("type")) == "1" else reason or "аварійні роботи")
        original += "\nЧас початку – " + (start_raw or "не вказано")
        original += "\nОрієнтовний час відновлення електроенергії – " + ("до " + end_raw if end_raw else "не вказано")
    else:
        # The same fallback message used by the original Android app / DTEK UI.
        original = "Якщо в даний момент у вас відсутнє світло, імовірно виникла аварійна ситуація, або діють стабілізаційні або екстрені відключення. Просимо перевірити інформацію через 15 хвилин."
    return {"site_state": "unknown" if not status_visible else "outage" if outage else "supply_expected", "reason": reason,
            "start_raw": start_raw, "end_raw": end_raw, "start_at": site_datetime(start_raw),
            "restoration_at": end, "restoration_source": source,
            "next_outage_at": future["start"] if future else None,
            "next_restoration_at": confirmed_end(future),
            "groups": groups, "multi_group": len(groups) > 1, "emergency": emergency,
            "voluntarily": bool(home.get("voluntarily")), "original_message": original,
            "site_updated": str(payload.get("updateTimestamp") or ""),
            "schedule_updated": str(fact.get("update") or ""), "schedule": rows[:300]}


class DtekClient:
    def __init__(self, session):
        self.session = session
        self.csrf = ""
        self.bootstrapped = 0
        self.catalog = {}
        self.catalog_at = 0
        self.fact, self.preset = {}, {}
        self.lock = asyncio.Lock()

    async def bootstrap(self):
        try:
            async with self.session.get(PAGE, headers={"User-Agent": UA}, timeout=aiohttp.ClientTimeout(total=25)) as response:
                if response.status != 200:
                    raise DtekError(f"Сайт ДТЭК временно недоступен (HTTP {response.status}).")
                html = await response.text()
        except (aiohttp.ClientError, TimeoutError) as exc:
            raise DtekError("Нет соединения с ДТЭК. Повторная попытка выполняется автоматически.") from exc
        parser = MetaParser()
        parser.feed(html)
        if not parser.csrf:
            raise DtekError("ДТЭК не выдал обычную сессию сайта. Возможна защитная проверка; данные не считаются подтверждёнными.")
        self.csrf, self.bootstrapped = parser.csrf, time.time()
        for name in ("fact", "preset"):
            match = re.search(r"DisconSchedule\." + name + r"\s*=\s*", html)
            if match:
                try:
                    value, _ = json.JSONDecoder().raw_decode(html[match.end():])
                    if isinstance(value, dict):
                        setattr(self, name, value)
                except ValueError:
                    pass

    async def post(self, method, fields=None, retry=True):
        if not self.csrf or time.time() - self.bootstrapped > 900:
            await self.bootstrap()
        form = {"method": method, "_csrf-dtek-oem": self.csrf}
        if fields:
            for i, (key, value) in enumerate(fields.items()):
                form[f"data[{i}][name]"] = key
                form[f"data[{i}][value]"] = value
        if method == "checkDisconUpdate":
            form["update"] = "0"
        try:
            async with self.session.post(BASE + "/ua/ajax", data=form, headers={"User-Agent": UA, "Referer": PAGE, "X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": self.csrf}, timeout=aiohttp.ClientTimeout(total=25)) as response:
                if response.status in (400, 403) and retry:
                    self.csrf = ""
                    return await self.post(method, fields, retry=False)
                if response.status != 200:
                    raise DtekError(f"Сайт ДТЭК временно недоступен (HTTP {response.status}).")
                payload = await response.json(content_type=None)
        except (aiohttp.ClientError, TimeoutError, ValueError) as exc:
            raise DtekError("Не удалось получить ответ ДТЭК. Данные сохранены как устаревшие.") from exc
        if not isinstance(payload, dict):
            raise DtekError("Неподдерживаемый ответ ДТЭК.")
        for key in ("fact", "preset"):
            if isinstance(payload.get(key), dict):
                setattr(self, key, payload[key])
        return payload

    async def get_catalog(self):
        if not self.catalog or time.time() - self.catalog_at > 86400:
            payload = await self.post("getStreets")
            if not payload.get("result") or not isinstance(payload.get("streets"), dict):
                raise DtekError("Не удалось получить список населённых пунктов ДТЭК.")
            self.catalog = {str(k): [str(s) for s in v] for k, v in payload["streets"].items() if isinstance(v, list)}
            self.catalog_at = time.time()
        return self.catalog

    async def homes(self, city, street, house=""):
        return await self.post("getHomeNum", {"city": city, "street": street, "house_num": house})

    async def status(self, address):
        payload = await self.homes(address["city"], address["street"], address["house"])
        # Current status remains useful if the separate schedule request fails.
        schedule_error = None
        try:
            await self.post("checkDisconUpdate")
        except DtekError as exc:
            schedule_error = str(exc)
            self.fact, self.preset = {}, {}
        result = parse_status(payload, address, self.fact, self.preset)
        result["schedule_error"] = schedule_error
        return result
