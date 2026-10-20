import importlib.util, sys, unittest
from pathlib import Path
from dataclasses import replace
from datetime import datetime, timezone

def load(name):
 p=Path('custom_components/energetika_control')/(name+'.py')
 spec=importlib.util.spec_from_file_location(name,p);module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module);return module
p=load('policy');solar=load('solar')
class PolicyChecks(unittest.TestCase):
 def sample(self,**kw):
  args=dict(now=100000,fresh=True,grid=True,mode='SUB',pv=150,pv_average=150,grid_watts=170,baseline=500,soc=85,remaining=2176,day=True,enabled=True);args.update(kw);return p.Sample(**args)
 def test_low_grid_waits_five_minutes(self):
  s=self.sample();m=p.Memory()
  for seconds in range(0,300,30):self.assertNotEqual(p.decide(replace(s,now=s.now+seconds),m).target,'SBU')
  self.assertEqual(p.decide(replace(s,now=s.now+300),m).target,'SBU')
 def test_full_battery_does_not_release_outage_preparation(self):
  s=self.sample(dtek_fresh=True,next_outage=103600,remaining=800,soc=31);m=p.Memory();d=p.decide(s,m)
  self.assertTrue(d.preparing);self.assertEqual(d.target,'SUB')
  d=p.decide(replace(s,now=100030,remaining=2560,soc=100),m);self.assertTrue(d.preparing);self.assertEqual(d.stage,'reserve')
 def test_cancelled_schedule_releases_preparation(self):
  s=self.sample(dtek_fresh=True,next_outage=103600,remaining=800,soc=31);m=p.Memory();p.decide(s,m)
  self.assertFalse(p.decide(replace(s,now=100030,next_outage=0),m).preparing)
 def test_short_cloud_does_not_leave_sbu(self):
  s=self.sample(mode='SBU',pv=50,pv_average=400);m=p.Memory()
  for seconds in range(0,1800,30):self.assertNotEqual(p.decide(replace(s,now=s.now+seconds),m).target,'SUB')
  self.assertEqual(p.decide(replace(s,now=s.now+1800),m).target,'SUB')
 def test_gap_resets_solar_evidence(self):
  s=self.sample();m=p.Memory()
  for seconds in range(0,300,30):p.decide(replace(s,now=s.now+seconds),m)
  self.assertEqual(p.decide(replace(s,now=s.now+500),m).entry_seconds,0)
 def test_critical_battery_overrides_morning(self):
  d=p.decide(self.sample(morning=True,critical=True,last_switch=99999),p.Memory());self.assertEqual(d.target,'SUB');self.assertEqual(d.switch_seconds,0)
class SolarChecks(unittest.TestCase):
 def weather(self):
  start=datetime(2026,10,20,tzinfo=timezone.utc).timestamp();times=[start+i*3600 for i in range(48)]
  return {'hourly':{'time':times,'shortwave_radiation':[500]*48,'direct_radiation':[350]*48,'diffuse_radiation':[150]*48,'direct_normal_irradiance':[700]*48},'daily':{'time':[]}}
 def test_flat_panel_independent_of_rotation(self):
  w=self.weather();a=solar.forecast(w,20,0,0,0);b=solar.forecast(w,20,0,0,220);self.assertEqual(a['rows'],b['rows'])
 def test_house_never_increases_pv(self):
  r=solar.forecast(self.weather(),20,0,45,180)['rows'];self.assertTrue(all(x['pv']<=x['unshaded'] for x in r))
 def test_tilt_and_direction_change_result(self):
  w=self.weather();a=solar.forecast(w,20,0,45,90)['rows'];b=solar.forecast(w,20,0,45,270)['rows'];self.assertNotEqual(a,b)
 def test_missing_dni_not_invented(self):
  w=self.weather();del w['hourly']['direct_normal_irradiance'];self.assertTrue(all(x['pv'] is None for x in solar.forecast(w,20,0,45,180)['rows']))
if __name__=='__main__':unittest.main()
