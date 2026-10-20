"""Approximate photo horizon and fixed-panel forecast.

Solar position: NOAA General Solar Position Calculations, solareqns.PDF.
Open-Meteo radiation values are means over the PRECEDING hour.
Beam incidence, isotropic sky and ground diffuse follow the standard POA model.
Only the direct component is masked; diffuse light remains (approximation).
"""
from datetime import datetime, timezone, timedelta
from math import sin, cos, acos, atan2, pi, degrees, radians
from zoneinfo import ZoneInfo

ZONE = ZoneInfo("Europe/Kyiv")
# Estimated from the user's Pixel 7 AR image, taken approximately at the panels.
# These are angular estimates, not a surveyed horizon or a camera calibration.
HORIZON = [
    [190, 0], [201, 0], [202, 10], [209, 10], [210, 14],
    [216, 14], [217, 17], [221, 17], [222, 20],
    [228, 20], [229, 21], [234, 21], [235, 20],
    [240, 20], [244, 16], [245, 0], [260, 0],
]


def position(timestamp, latitude=46.4825, longitude=30.7233):
    dt = datetime.fromtimestamp(timestamp, timezone.utc)
    hour = dt.hour + dt.minute / 60 + dt.second / 3600
    days = 366 if dt.year % 4 == 0 and (dt.year % 100 != 0 or dt.year % 400 == 0) else 365
    gamma = 2 * pi / days * (dt.timetuple().tm_yday - 1 + (hour - 12) / 24)
    equation = 229.18 * (.000075 + .001868*cos(gamma) - .032077*sin(gamma)
                         - .014615*cos(2*gamma) - .040849*sin(2*gamma))
    decl = (.006918 - .399912*cos(gamma) + .070257*sin(gamma)
            - .006758*cos(2*gamma) + .000907*sin(2*gamma)
            - .002697*cos(3*gamma) + .00148*sin(3*gamma))
    ha = radians(((hour * 60 + equation + 4 * longitude) % 1440) / 4 - 180)
    lat = radians(latitude)
    elevation = 90 - degrees(acos(max(-1, min(1, sin(lat)*sin(decl) + cos(lat)*cos(decl)*cos(ha)))))
    azimuth = (degrees(atan2(sin(ha), cos(ha)*sin(lat) - sin(decl)/cos(decl)*cos(lat))) + 180) % 360
    return azimuth, elevation


def height(azimuth):
    for (a, h), (b, k) in zip(HORIZON, HORIZON[1:]):
        if a <= azimuth <= b:
            return h + (k-h) * (azimuth-a) / (b-a)
    return 0


def finite(value):
    from math import isfinite
    return isinstance(value, (float, int)) and isfinite(value)


def forecast(weather, losses, now, tilt=0, azimuth=180):
    hourly, daily = weather.get("hourly") or {}, weather.get("daily") or {}
    times, rows, days = hourly.get("time", []), [], []
    factor = 2.52 * (1 - max(5, min(50, losses)) / 100)
    tilt = max(0, min(90, tilt))
    azimuth = azimuth % 360
    beta = radians(tilt)
    for i in range(1, len(times)):
        start, end = times[i-1], times[i]
        if end - start != 3600:
            continue
        def at(key):
            values = hourly.get(key) or []
            return values[i] if i < len(values) and finite(values[i]) else None
        global_rad, direct, diffuse = at("shortwave_radiation"), at("direct_radiation"), at("diffuse_radiation")
        dni = at("direct_normal_irradiance")
        if global_rad is None:
            continue
        # Five-minute samples average the fraction of this hour hidden by the house.
        positions = [position(start + 150 + j * 300) for j in range(12)]
        blocked = sum(1 for az, el in positions if 0 < el <= height(az)) / 12
        complete = direct is not None and diffuse is not None and (tilt == 0 or dni is not None)
        # Do not invent a direct/diffuse split when the provider hasn't sent it yet.
        corrected = unshaded = None
        if complete:
            sky = max(0, diffuse) * (1 + cos(beta)) / 2
            ground = max(0, global_rad) * .2 * (1 - cos(beta)) / 2
            if tilt == 0:
                # Preserve exact horizontal provider totals without numerical projection error.
                beam = max(0, direct)
                visible_beam = beam * (1-blocked)
            else:
                projections = [(max(0, sin(radians(el))*cos(beta) +
                                    cos(radians(el))*sin(beta)*cos(radians(az-azimuth)))
                                if el > 0 else 0, el > height(az)) for az, el in positions]
                beam = max(0, dni) * sum(p for p, _ in projections) / 12
                visible_beam = max(0, dni) * sum(p for p, visible in projections if visible) / 12
            unshaded, corrected = beam + sky + ground, visible_beam + sky + ground
        rows.append({"t": start, "end": end, "unshaded": round(min(2520, unshaded*factor)) if unshaded is not None else None,
                     "pv": round(min(2520, corrected*factor)) if corrected is not None else None,
                     "shade": round(blocked, 2)})
    daily_times = daily.get("time", [])
    first_date = datetime.fromtimestamp(daily_times[0], ZONE).date() if daily_times else None
    for i, stamp in enumerate(daily_times[:7]):
        # API daily Unix times can use one UTC offset for the whole forecast.
        # Calendar days, unlike hourly instants, must not duplicate at DST end.
        key = (first_date + timedelta(days=i)).isoformat()
        selected = [r for r in rows if datetime.fromtimestamp(r["t"], ZONE).strftime("%Y-%m-%d") == key]
        count = (datetime.fromisoformat(key).replace(tzinfo=ZONE).timestamp())
        expected = int(((datetime.fromisoformat(key) + timedelta(days=1)).replace(tzinfo=ZONE).timestamp() - count) / 3600)
        valid = len(selected) == expected and all(r["pv"] is not None for r in selected)
        def day_at(name):
            values = daily.get(name) or []
            return values[i] if i < len(values) else None
        days.append({"date": key, "kwh": round(sum(r["pv"] for r in selected)/1000, 2) if valid else None,
                     "unshaded_kwh": round(sum(r["unshaded"] for r in selected)/1000, 2) if valid else None,
                     "code": day_at("weather_code"), "min": day_at("temperature_2m_min"),
                     "max": day_at("temperature_2m_max")})
    today = datetime.fromtimestamp(now, ZONE).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    path = []
    for offset in range(0, 25*3600, 600):
        stamp = today + offset
        az, el = position(stamp)
        if 170 <= az <= 270 and el > 0:
            path.append({"t": stamp, "az": round(az, 2), "el": round(el, 2), "shaded": el <= height(az)})
    return {"rows": rows, "days": days, "horizon": HORIZON, "sun_path": path,
            "tilt_degrees": tilt, "azimuth_degrees": azimuth, "albedo": .2,
            "model": "Fixed plane: DNI incidence + isotropic sky + ground diffuse; photo horizon masks direct light",
            "calibration": "Pixel 7 photo at approximately panel position; angular estimate",
            "calculated_at": now}
