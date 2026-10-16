"""Check the actual deployed Jinja calculation against energy-accounting cases."""
from pathlib import Path
from types import SimpleNamespace as NS
from datetime import datetime, timezone
import yaml
from jinja2 import Environment

config = yaml.safe_load(Path('energetika.yaml').read_text(encoding='utf-8'))
sensor = next(sensor for block in config['template'] for sensor in block.get('sensor', [])
              if sensor.get('unique_id') == 'energetika_battery_remaining')
env = Environment()
env.globals['as_timestamp'] = lambda value, default=0: value.timestamp() if hasattr(value, 'timestamp') else default
now = datetime.now(timezone.utc)
env.globals['now'] = lambda: now
env.globals['has_value'] = lambda entity: True
env.globals['is_state'] = lambda entity, state: True
source = NS(entity_id='sensor.anenji_4200_protocol_1_battery_power', last_reported=now)
class States:
    sensor = NS(anenji_4200_protocol_1_battery_power=source)
    power = 0
    def __call__(self, entity):
        return self.power
state_mock = States()
env.globals['states'] = state_mock
template = env.from_string(sensor['state'])

def calculate(previous, watts, seconds, trigger='tick', valid=True):
    state_mock.power = watts
    result = template.render(this=NS(state=str(previous), attributes={
        'sample_timestamp': now.timestamp()-seconds,
        'sample_power_w': watts, 'sample_valid': valid}),
        trigger=NS(id=trigger, from_state=None, to_state=None)).strip()
    return None if result == 'None' else float(result)

# Exactly one hour in 10 s steps, using the actual Jinja, not a duplicate formula.
remaining = 2560.
for _ in range(360):
    remaining = calculate(remaining, -500, 10)
assert abs(remaining-2060) < .02, remaining
assert calculate(2500, 1000, 120) == 2533.3333
assert calculate(2550, 1000, 120) == 2560
assert calculate(10, -1000, 120) == 0
assert calculate(1800, -500, 121) == 1800  # Do not invent consumption during outage.
assert calculate(1800, -500, 10, 'startup') == 1800
assert calculate(1800, -500, 10, valid=False) == 1800
assert calculate('unknown', -500, 10) is None  # Never assume initial charge.
assert calculate(100, -500, 10, 'auto_full') == 2560
assert calculate(1800, -65535, 10) == 1800
env.globals['has_value'] = lambda entity: False
assert calculate(1800, -500, 10) == 1800
print('Energy accounting: 11 checks passed; 500 W for 1 h leaves', remaining, 'Wh')
