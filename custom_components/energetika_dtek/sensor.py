"""Stable entities for future local automations; status is separate from grid voltage."""
from datetime import datetime, timezone

from homeassistant.components.sensor import SensorEntity, SensorDeviceClass
from . import DOMAIN


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    manager = hass.data[DOMAIN]
    async_add_entities([DtekSensor(manager, key, name) for key, name in (
        ("status", "Energetika DTEK Status"),
        ("restoration_at", "Energetika DTEK Restoration"),
        ("next_outage_at", "Energetika DTEK Next Outage"),
        ("next_restoration_at", "Energetika DTEK Next Restoration"),
    )])


class DtekSensor(SensorEntity):
    _attr_should_poll = False
    _attr_icon = "mdi:transmission-tower-off"

    def __init__(self, manager, key, name):
        self.manager, self.key = manager, key
        self._attr_name = name
        self._attr_unique_id = "energetika_dtek_" + key
        if key != "status":
            self._attr_device_class = SensorDeviceClass.TIMESTAMP

    async def async_added_to_hass(self):
        self.manager.listeners.add(self.async_write_ha_state)
        self.async_on_remove(lambda: self.manager.listeners.discard(self.async_write_ha_state))

    @property
    def available(self):
        return self.key == "status" or bool(self.manager.fresh and self.manager.data.get(self.key))

    @property
    def native_value(self):
        if self.key == "status":
            if not self.manager.address:
                return "not_configured"
            return self.manager.data.get("site_state", "unknown") if self.manager.fresh else "stale"
        value = self.manager.data.get(self.key)
        return datetime.fromtimestamp(value, timezone.utc) if value else None

    @property
    def extra_state_attributes(self):
        if self.key != "status":
            return {"source": "DTEK Odesa", "estimated": True}
        # Large timelines are available through the authenticated websocket command.
        return {k: v for k, v in self.manager.snapshot().items() if k != "schedule"}
