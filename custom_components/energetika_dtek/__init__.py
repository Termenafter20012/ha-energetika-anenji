"""Local HA storage, polling and authenticated UI commands for DTEK Odesa."""
from __future__ import annotations

from datetime import timedelta
import time

import aiohttp
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.const import EVENT_HOMEASSISTANT_STOP, Platform
from homeassistant.helpers import discovery
from homeassistant.helpers.aiohttp_client import async_create_clientsession
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store

from .client import DtekClient, DtekError

DOMAIN = "energetika_dtek"
CONFIG_SCHEMA = vol.Schema({vol.Optional(DOMAIN): {}}, extra=vol.ALLOW_EXTRA)


class Manager:
    def __init__(self, hass):
        self.hass = hass
        self.store = Store(hass, 1, DOMAIN)
        self.client = DtekClient(async_create_clientsession(hass, cookie_jar=aiohttp.CookieJar()))
        self.address = {}
        self.data = {}
        self.last_success = 0
        self.last_attempt = 0
        self.error = None
        self.listeners = set()

    @property
    def fresh(self):
        return bool(self.address and not self.error and 0 <= time.time() - self.last_success < 900)

    def snapshot(self):
        return {**self.data, "address": self.address, "last_success": self.last_success,
                "last_attempt": self.last_attempt, "fresh": self.fresh, "error": self.error,
                "configured": bool(self.address)}

    def changed(self):
        for listener in list(self.listeners):
            listener()

    async def save(self):
        await self.store.async_save({"address": self.address, "data": self.data, "last_success": self.last_success})

    async def refresh(self, address=None):
        selected = address or self.address
        if not selected:
            return self.snapshot()
        async with self.client.lock:
            if address is None and time.time() - self.last_attempt < 30:
                return self.snapshot()
            self.last_attempt = time.time()
            try:
                result = await self.client.status(selected)
                self.address, self.data = dict(selected), result
                self.last_success, self.error = time.time(), None
                await self.save()
            except DtekError as exc:
                if address is not None:
                    raise
                self.error = str(exc)
            finally:
                self.changed()
        return self.snapshot()

    async def tick(self, _now):
        if self.address and time.time() - self.last_attempt >= (60 if self.error else 300):
            await self.refresh()
        else:
            self.changed()

    async def stop(self, _event):
        self.cancel_timer()
        await self.client.session.close()


async def async_setup(hass, config):
    manager = Manager(hass)
    saved = await manager.store.async_load() or {}
    manager.address = saved.get("address", {})
    manager.data = saved.get("data", {})
    manager.last_success = saved.get("last_success", 0)
    hass.data[DOMAIN] = manager
    for command in (ws_catalog, ws_houses, ws_address, ws_status, ws_refresh):
        websocket_api.async_register_command(hass, command)
    manager.cancel_timer = async_track_time_interval(hass, manager.tick, timedelta(minutes=1))
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, manager.stop)
    await discovery.async_load_platform(hass, Platform.SENSOR, DOMAIN, {}, config)
    if manager.address:
        hass.async_create_task(manager.refresh())
    return True


@websocket_api.websocket_command({vol.Required("type"): DOMAIN + "/catalog", vol.Optional("city", default=""): str, vol.Optional("query", default=""): str})
@websocket_api.async_response
async def ws_catalog(hass, connection, msg):
    manager = hass.data[DOMAIN]
    try:
        async with manager.client.lock:
            catalog = await manager.client.get_catalog()
        if msg["city"]:
            values = catalog.get(msg["city"], [])
        else:
            values = sorted(catalog)
        query = msg["query"].casefold().strip()
        matches = [v for v in values if not query or query in v.casefold()]
        connection.send_result(msg["id"], {"values": matches[:150], "total": len(matches)})
    except DtekError as exc:
        connection.send_error(msg["id"], "dtek_unavailable", str(exc))


@websocket_api.websocket_command({vol.Required("type"): DOMAIN + "/houses", vol.Required("city"): str, vol.Required("street"): str})
@websocket_api.async_response
async def ws_houses(hass, connection, msg):
    manager = hass.data[DOMAIN]
    try:
        async with manager.client.lock:
            catalog = await manager.client.get_catalog()
            if msg["street"] not in catalog.get(msg["city"], []):
                raise DtekError("Выберите улицу из списка ДТЭК.")
            payload = await manager.client.homes(msg["city"], msg["street"])
        if not payload.get("result") or not isinstance(payload.get("data"), dict):
            raise DtekError("Список домов не получен. Повторите запрос позже.")
        connection.send_result(msg["id"], {"values": sorted(payload["data"], key=lambda v: (len(str(v)), str(v)))})
    except DtekError as exc:
        connection.send_error(msg["id"], "dtek_unavailable", str(exc))


@websocket_api.websocket_command({vol.Required("type"): DOMAIN + "/set_address", vol.Required("city"): vol.All(str, vol.Length(min=1, max=200)), vol.Required("street"): vol.All(str, vol.Length(min=1, max=200)), vol.Required("house"): vol.All(str, vol.Length(min=1, max=40))})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_address(hass, connection, msg):
    manager = hass.data[DOMAIN]
    try:
        async with manager.client.lock:
            catalog = await manager.client.get_catalog()
            if msg["street"] not in catalog.get(msg["city"], []):
                raise DtekError("Выберите населённый пункт и улицу из списка ДТЭК.")
        result = await manager.refresh({key: msg[key] for key in ("city", "street", "house")})
        connection.send_result(msg["id"], result)
    except DtekError as exc:
        connection.send_error(msg["id"], "invalid_address", str(exc))


@websocket_api.websocket_command({vol.Required("type"): DOMAIN + "/status"})
@websocket_api.async_response
async def ws_status(hass, connection, msg):
    connection.send_result(msg["id"], hass.data[DOMAIN].snapshot())


@websocket_api.websocket_command({vol.Required("type"): DOMAIN + "/refresh"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_refresh(hass, connection, msg):
    connection.send_result(msg["id"], await hass.data[DOMAIN].refresh())
