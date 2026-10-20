"""Compact, recorded decision and deadline for the automation screen."""
from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store
import voluptuous as vol
import time
from . import DOMAIN
from .solar import forecast


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    model = SolarModel(hass)
    await model.load_orientation()
    async_add_entities([ControlStatus(hass.data[DOMAIN]), model])
    hass.services.async_register(DOMAIN, "set_panel_orientation", model.set_orientation, schema=vol.Schema({
        vol.Required("tilt"): vol.All(vol.Coerce(float), vol.Range(min=0, max=90)),
        vol.Required("azimuth"): vol.All(vol.Coerce(float), vol.Range(min=0, max=359)),
    }))


class ControlStatus(SensorEntity):
    _attr_should_poll = False
    _attr_name = "Energetika Control Status"
    _attr_unique_id = "energetika_control_status"
    _attr_icon = "mdi:state-machine"

    def __init__(self, controller):
        self.controller = controller

    async def async_added_to_hass(self):
        self.controller.listeners.add(self.async_write_ha_state)
        self.async_on_remove(lambda: self.controller.listeners.discard(self.async_write_ha_state))

    @property
    def native_value(self):
        return self.controller.status.get("stage", "waiting")

    @property
    def extra_state_attributes(self):
        return self.controller.status


class SolarModel(SensorEntity):
    _attr_should_poll = False
    _attr_name = "Energetika Solar Model"
    _attr_unique_id = "energetika_solar_model"
    _attr_icon = "mdi:weather-sunset"

    def __init__(self, hass):
        self.hass = hass
        self.store = Store(hass, 1, DOMAIN + "_solar_orientation")
        self.tilt, self.azimuth = 0, 180

    async def load_orientation(self):
        saved = await self.store.async_load() or {}
        from .solar import finite
        if finite(saved.get("tilt")) and 0 <= saved["tilt"] <= 90:
            self.tilt = saved["tilt"]
        if finite(saved.get("azimuth")) and 0 <= saved["azimuth"] < 360:
            self.azimuth = saved["azimuth"]

    async def set_orientation(self, call):
        # One persisted pair; changes only a forecast, never inverter hardware.
        from .solar import finite
        tilt, azimuth = call.data["tilt"], call.data["azimuth"]
        if not finite(tilt) or not finite(azimuth):
            raise vol.Invalid("Angles must be finite")
        await self.store.async_save({"tilt": tilt, "azimuth": azimuth})
        self.tilt, self.azimuth = tilt, azimuth
        self.update_model()
        self.async_write_ha_state()

    async def async_added_to_hass(self):
        self.async_on_remove(async_track_state_change_event(
            self.hass, ["sensor.energetika_solar_weather", "input_number.energetika_solar_losses"], self.changed))
        self.update_model()

    async def changed(self, event):
        self.update_model()
        self.async_write_ha_state()

    def update_model(self):
        weather = self.hass.states.get("sensor.energetika_solar_weather")
        losses = self.hass.states.get("input_number.energetika_solar_losses")
        try:
            loss = float(losses.state) if losses else 20
        except ValueError:
            loss = 20
        self._attr_extra_state_attributes = forecast(weather.attributes if weather else {}, loss, time.time(), self.tilt, self.azimuth)
        rows = self._attr_extra_state_attributes["rows"]
        self._attr_native_value = "ready" if rows and all(r["pv"] is not None for r in rows) else "waiting"
