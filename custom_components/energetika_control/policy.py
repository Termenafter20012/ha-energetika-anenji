"""Deterministic decisions. No network, Home Assistant imports or hardware writes."""
from dataclasses import dataclass, field
import math


@dataclass
class Sample:
    now: float
    fresh: bool = False
    grid: bool | None = None
    mode: str = ""
    pv: float = 0
    pv_average: float = 0
    grid_watts: float | None = None
    baseline: float = 550
    soc: float = 0
    remaining: float = 0
    critical: bool = False
    day: bool = False
    entry_reserve: float = 35
    coverage_target: float = 50
    morning: bool = False
    morning_start: float = 0
    dtek_fresh: bool = False
    next_outage: float = 0
    outage_enabled: bool = True
    buffer_minutes: float = 30
    energy_uncertain: bool = False
    enabled: bool = False
    paused: bool = False
    fault: bool = False
    last_switch: float = 0


@dataclass
class Memory:
    outage_at: float = 0
    schedule_seen: float = 0
    preparing: bool = False
    entry_since: float | None = None
    weak_since: float | None = None
    missing_since: float | None = None
    last_sample: float | None = None

    def persistent(self):
        # Evidence timers restart after a gap/restart; a preparation session survives.
        return {k: getattr(self, k) for k in ("outage_at", "schedule_seen", "preparing")}


@dataclass
class Decision:
    target: str = "HOLD"
    stage: str = "waiting"
    reason: str = ""
    urgent: bool = False
    entry_seconds: float = 0
    weak_seconds: float = 0
    charge_minutes: int = 0
    prepare_at: float = 0
    outage_at: float = 0
    preparing: bool = False
    schedule_stale: bool = False
    late: bool = False
    deficit_wh: float = 0
    coverage: float = 0
    low_grid: bool = False
    entry_pending: bool = False
    weak_pending: bool = False
    switch_seconds: float = 0
    warnings: list[str] = field(default_factory=list)


def decide(s: Sample, m: Memory) -> Decision:
    """Evaluate priority: outage reserve, battery safety, morning, measured solar."""
    d = Decision()
    if m.last_sample is None or not 0 <= s.now - m.last_sample <= 90:
        m.entry_since = m.weak_since = m.missing_since = None
    m.last_sample = s.now
    if s.dtek_fresh:
        next_at = s.next_outage if s.now < s.next_outage <= s.now + 72 * 3600 else 0
        grace = m.preparing and s.grid is True and m.outage_at <= s.now < m.outage_at + 1800
        # A later episode must not release the charge during the previous start grace.
        if not grace:
            if next_at != m.outage_at:
                m.preparing = False
            m.outage_at = next_at
        m.schedule_seen = s.now
    elif not m.preparing and s.now - m.schedule_seen > 86400:
        m.outage_at = 0
    if m.outage_at and s.now >= m.outage_at + 1800:
        m.outage_at, m.preparing = 0, False
    if s.grid is False:
        m.preparing = False
        if m.outage_at <= s.now:
            m.outage_at = 0
    if not s.outage_enabled:
        m.preparing = False

    d.coverage = s.pv_average / max(1, s.baseline) * 100
    # 30 A on the battery side, conservative useful power, plus absorption time.
    d.deficit_wh = max(0, min(2560, 2560 - s.remaining))
    uncertainty = 256 if s.energy_uncertain else 0
    budget_wh = min(2560, d.deficit_wh + uncertainty)
    d.charge_minutes = math.ceil(budget_wh / (30 * 25.6 * .8) * 60 + 30)
    d.outage_at = m.outage_at
    d.prepare_at = m.outage_at - (d.charge_minutes + s.buffer_minutes) * 60 if m.outage_at else 0
    d.schedule_stale = not s.dtek_fresh
    if (s.outage_enabled and s.grid is True and m.outage_at
            and s.now >= d.prepare_at and s.now < m.outage_at + 1800):
        m.preparing = True
    d.preparing = m.preparing and s.outage_enabled and s.grid is not False
    d.late = bool(d.preparing and (m.outage_at - s.now) / 60 < d.charge_minutes)
    if d.schedule_stale:
        d.warnings.append("ДТЭК не обновился: используем последний известный срок." if m.outage_at
                          else "Нет свежего графика ДТЭК. Время подготовки неизвестно.")
    elif not m.outage_at:
        d.warnings.append("В опубликованном графике нет следующего отключения.")
    if s.energy_uncertain:
        d.warnings.append("В учёте АКБ был перерыв: к расчёту добавлен запас 256 Вт·ч.")
    if d.late:
        d.warnings.append("Времени до отключения может не хватить для полного заряда.")

    d.low_grid = s.mode == "SUB" and s.grid_watts is not None and 0 <= s.grid_watts < 200
    candidate = (s.fresh and s.grid is True and s.day and not s.critical and not d.preparing
                 and s.soc >= s.entry_reserve and s.pv >= 100 and s.pv_average >= 100
                 and (d.low_grid or d.coverage >= s.coverage_target))
    weak = s.fresh and s.pv < 100
    d.entry_pending, d.weak_pending = bool(candidate), bool(weak)
    for condition, key in ((candidate, "entry_since"), (weak, "weak_since"), (not s.fresh, "missing_since")):
        if not condition:
            setattr(m, key, None)
        elif getattr(m, key) is None:
            setattr(m, key, s.now)
    d.entry_seconds = s.now - m.entry_since if m.entry_since is not None else 0
    d.weak_seconds = s.now - m.weak_since if m.weak_since is not None else 0

    if s.grid is False:
        d.stage, d.reason = "outage", "Сети нет. Дом питается от солнца и АКБ; режим по экономии не переключаем."
    elif d.preparing:
        d.target, d.urgent = "SUB", True
        d.stage = "reserve" if s.soc >= 99.5 else "charging"
        d.reason = "Сохраняем заряд до отключения." if d.stage == "reserve" else "Готовим АКБ к отключению: SUB, солнце + сеть, заряд до 30 А."
    elif s.critical:
        d.target, d.stage, d.urgent = "SUB", "protection", True
        d.reason = "Резерв 25% или нижнее напряжение АКБ — возвращаем питание от сети."
    elif not s.fresh:
        d.stage, d.reason = "no_data", "Нет свежей телеметрии. Ожидаем восстановление связи."
        if s.now - (m.missing_since if m.missing_since is not None else s.now) >= 600:
            d.target, d.urgent = "SUB", True
            d.reason = "Нет свежих данных 10 минут — запрошен безопасный SUB."
    elif s.morning:
        d.target, d.stage = "SBU", "morning"
        d.urgent = s.last_switch < s.morning_start
        d.reason = "Действует выбранное утреннее окно SBU. Подготовка к отключению и защита АКБ выше по приоритету."
    elif d.weak_seconds >= 1800:
        d.target, d.stage = "SUB", "low_solar"
        d.reason = "Солнце ниже 100 Вт непрерывно 30 минут — сохраняем АКБ в SUB."
    elif d.entry_seconds >= 300:
        d.target, d.stage = "SBU", "solar"
        d.reason = ("Сеть ниже 200 Вт и есть солнечная выработка 5 минут — переходим на SBU."
                    if d.low_grid else "Солнце покрывает нужную долю фоновой нагрузки 5 минут — SBU.")
    elif s.mode == "SBU":
        d.stage, d.reason = "solar", "Используем солнце; АКБ сглаживает пики. Короткие облака не вызывают переключение."
    else:
        d.stage, d.reason = "waiting", "Ждём 5 минут: сеть ниже 200 Вт или достаточное покрытие фона, солнце от 100 Вт."
        if s.soc < s.entry_reserve:
            d.reason = f"Для нового SBU нужен заряд от {s.entry_reserve:g}%. Сейчас {s.soc:g}%."
    d.switch_seconds = 0 if d.urgent else max(0, s.last_switch + 600 - s.now)
    if not s.enabled:
        d.stage, d.reason = "manual", "Автоматика выключена. Решения начнут выполняться после включения авто."
    elif s.paused:
        d.stage, d.reason = "paused", "Действует ручная пауза. Подготовка к отключению тоже приостановлена."
    elif s.fault:
        d.stage, d.reason = "fault", "Предыдущая команда не подтверждена. Проверьте инвертор и возобновите автоматику."
    return d
