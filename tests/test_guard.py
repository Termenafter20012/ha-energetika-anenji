"""Regression cases taken from the shutdown spike, plus genuine overloads."""
from pathlib import Path
import importlib.util
import json
import shutil
import tempfile
import unittest
import ast

ROOT=Path(__file__).resolve().parents[1]
(ROOT/'.deploy').mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('guard',ROOT/'patches/telemetry_guard.py')
guard=importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

class GuardRegression(unittest.TestCase):
    def test_shutdown_and_restart_sentinels(self):
        for power in [65535,65000,65534,float('nan'),float('inf'),-1]:
            with self.subTest(power=power),self.assertRaisesRegex(ValueError,'invalid_live_sample:output_power'):
                guard.validate_live_sample({'output_power':power},guard.VARIANT)

    def test_real_steps_zero_and_overload(self):
        for power in [0,500,4200,7000,8400]:
            guard.validate_live_sample({'output_power':power,'output_voltage':230},guard.VARIANT)

    def test_invalid_electrical_values(self):
        for values in [{'output_voltage':6553.5},{'battery_current':3276.7},{'pv_voltage':6553.5},{'grid_power':32767}]:
            with self.subTest(values=values),self.assertRaises(ValueError):
                guard.validate_live_sample(values,guard.VARIANT)

    def test_other_models_untouched(self):
        guard.validate_live_sample({'output_power':12000},'anenji_anj_11kw_48v_wifi_p')

    def test_firmware_priority_three_monitoring_only(self):
        self.assertTrue(guard.priority_is_supported_for_monitoring('Unknown (3)',guard.VARIANT))
        self.assertFalse(guard.priority_is_supported_for_monitoring('Unknown (99)',guard.VARIANT))
        self.assertFalse(guard.priority_is_supported_for_monitoring('Unknown (3)','another_model'))

    @unittest.skipUnless((ROOT/'.upstream-eybond').is_dir(),'optional pinned upstream checkout is not present')
    def test_installer_and_disconnected_snapshot(self):
        install_spec=importlib.util.spec_from_file_location('installer',ROOT/'patches/install_guard.py')
        installer=importlib.util.module_from_spec(install_spec)
        install_spec.loader.exec_module(installer)
        with tempfile.TemporaryDirectory(dir=ROOT/'.deploy') as temporary:
            target=Path(temporary)
            (target/'configuration.yaml').write_text('default_config:\n')
            for rel in ['drivers/smg.py','runtime/hub.py']:
                out=target/'custom_components/eybond_local'/rel
                out.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(ROOT/'.upstream-eybond/custom_components/eybond_local'/rel,out)
            installer.install(target)
            installer.install(target)  # Idempotence: no backup/overwrite loop.
            hub=(target/'custom_components/eybond_local/runtime/hub.py').read_text()
            tree=ast.parse(hub)
            functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['_error_code','_should_mark_snapshot_disconnected','_should_force_reconnect']]
            namespace={}
            exec(compile(ast.Module(body=functions,type_ignores=[]),'<hub-guards>','exec'),namespace)
            error=ValueError('invalid_live_sample:output_power=65535')
            self.assertTrue(namespace['_should_mark_snapshot_disconnected'](error))
            self.assertFalse(namespace['_should_force_reconnect'](error))
            self.assertIn('validate_live_sample(values, inverter.variant_key)',(target/'custom_components/eybond_local/drivers/smg.py').read_text())
            smg_tree=ast.parse((target/'custom_components/eybond_local/drivers/smg.py').read_text())
            probes=[n for n in smg_tree.body if isinstance(n,ast.FunctionDef) and n.name in ['_is_valid_smg_probe','_is_known_enum_value']]
            ns={'Any':object,'_SMG_ANENJI_4200_PROTOCOL_1_VARIANT':guard.VARIANT,'_SMG_DEFAULT_RATED_POWERS':{6200},'priority_is_supported_for_monitoring':guard.priority_is_supported_for_monitoring}
            exec(compile(ast.Module(body=probes,type_ignores=[]),'<probe>','exec'),ns)
            schema=type('Schema',(),{'enum_map_for':lambda self,key:{0:'Mains'}})()
            config={'output_rating_voltage':230,'output_rating_frequency':50,'output_mode':'Single','output_source_priority':'Unknown (3)','protocol_number':1,'device_type':0x3501,'turn_on_mode':'Local and Remote','remote_switch':'Remote Turn-On'}
            self.assertTrue(ns['_is_valid_smg_probe'](schema,{'operating_mode':'Mains'},config,guard.VARIANT,rated_power=4200))
            self.assertFalse(ns['_is_valid_smg_probe'](schema,{'operating_mode':'Mains'},{**config,'device_type':999},guard.VARIANT,rated_power=4200))

    def test_installer_refuses_unknown_source(self):
        install_spec=importlib.util.spec_from_file_location('installer',ROOT/'patches/install_guard.py')
        installer=importlib.util.module_from_spec(install_spec)
        install_spec.loader.exec_module(installer)
        with tempfile.TemporaryDirectory(dir=ROOT/'.deploy') as temporary:
            target=Path(temporary)
            (target/'configuration.yaml').write_text('default_config:\n')
            smg=target/'custom_components/eybond_local/drivers/smg.py'
            smg.parent.mkdir(parents=True)
            smg.write_text('# different upstream version\n')
            with self.assertRaises(SystemExit):installer.install(target)
            self.assertEqual(smg.read_text(),'# different upstream version\n')
            self.assertEqual(list(target.glob('energetika-backup-*')),[])

if __name__=='__main__':
    unittest.main()
