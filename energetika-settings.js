import {INVERTER_MANUAL} from './energetika-manual.js?v=2.15.0';
/* Native EyeBond settings; all writes use Home Assistant's existing controls. */
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const GROUPS = {output:'Питание',charging:'Заряд',battery:'Аккумулятор',protection:'Защита',display:'Экран и звук',system:'Система'};
// The supplied manual numbers apply only to this ANENJI model; extra integration controls stay unnumbered.
const SETTINGS = {
  output_source_priority: ['Приоритет питания дома','output','Выбирает порядок использования солнца, аккумулятора и сети для питания нагрузки. Это отдельная настройка от выбора источников заряда. Порог переключения на сеть и возврата к АКБ задаётся напряжениями аккумулятора.'],
  output_mode: ['Схема работы инверторов','output','Одиночный, параллельный или трёхфазный режим. Он должен соответствовать физическому соединению оборудования и поддержке вашей модели. Выбор фазы не создаёт трёхфазную сеть из одного инвертора.'],
  output_rating_voltage: ['Напряжение на выходе','output','Задаёт номинальное переменное напряжение для домашних потребителей. Изменение влияет на питание подключённой техники. Интеграция может требовать режим ожидания и перезапуск.'],
  output_rating_frequency: ['Частота на выходе','output','Номинальная частота переменного тока. Для обычной сети и техники в Украине используется 50 Гц. Настройка должна соответствовать подключённым потребителям.'],
  input_voltage_range: ['Допустимое напряжение сети','output','Определяет, насколько широкий диапазон входного напряжения сети инвертор принимает для работы от сети. Узкий диапазон строже относится к качеству сети; широкий допускает больше отклонений. Это не настройка напряжения АКБ.'],
  charge_source_priority: ['Откуда заряжать аккумулятор','charging','Разрешает заряд от солнца, сети или обоих источников и определяет их приоритет. Источник питания дома выбирается отдельно в «Приоритет питания дома».'],
  max_charge_current: ['Максимальный общий ток заряда','charging','Предельный ток, поступающий в аккумулятор суммарно от солнца и сети. Единица — амперы. Это не ёмкость в А·ч и не максимальный ток разряда. Выбирайте по паспорту АКБ и ограничениям BMS; подтверждённые 100 А разряда не означают допустимые 100 А заряда.'],
  max_ac_charge_current: ['Максимальный ток заряда от сети','charging','Ограничивает часть тока заряда АКБ, которую обеспечивает сеть. Это ток на стороне аккумулятора, а не ток розетки 230 В. Общий ток дополнительно ограничен параметром «Максимальный общий ток заряда».'],
  battery_bulk_voltage: ['Напряжение основного заряда','battery','Напряжение, до которого инвертор заряжает АКБ на основной стадии. Значение должно соответствовать химии и паспорту АКБ. Счётчик оставшихся Вт·ч не рассчитывается из этого напряжения; оно участвует только в определении полного заряда.'],
  battery_float_voltage: ['Напряжение поддерживающего заряда','battery','Напряжение поддержки после основной стадии заряда. Поддерживающий режим и его напряжение зависят от типа АКБ. Это не нижний предел разряда.'],
  battery_overvoltage_protection_voltage: ['Защита от высокого напряжения АКБ','battery','Порог защиты при избыточном напряжении аккумулятора. Это аварийный предел, а не целевое напряжение заряда. Он должен согласовываться с основной зарядкой и защитой BMS.'],
  battery_redischarge_voltage: ['Возврат к питанию от аккумулятора','battery','Порог восстановления питания от АКБ после перехода на сеть при низком заряде. Разница с нижним порогом создаёт гистерезис и предотвращает частые переключения туда и обратно. Точное поведение зависит от выбранного режима питания.'],
  battery_under_voltage: ['Нижний порог АКБ при наличии сети','battery','Порог низкого напряжения аккумулятора в настройках SMG. При доступной сети используется для перехода на сетевое питание в режимах с резервом АКБ. Отдельный параметр автономной защиты задаётся ниже.'],
  battery_under_voltage_off_grid: ['Нижний порог АКБ без сети','battery','Защита аккумулятора от глубокого разряда при автономной работе. При достижении порога инвертор может отключить выход. В энергетической панели этот порог также используется как нижняя граница отдельной оценки процентов по напряжению. Учёт Вт·ч продолжает работать по мощности и времени.'],
  battery_equalization_mode: ['Выравнивающий заряд','battery','Периодический специальный заряд для некоторых свинцовых аккумуляторов. Для литиевой АКБ не включайте его без прямого указания производителя батареи. Это не балансировка ячеек, выполняемая литиевой BMS.'],
  battery_equalization_voltage: ['Напряжение выравнивающего заряда','battery','Целевое напряжение цикла выравнивания. Используется только при разрешённом выравнивании; для некоторых свинцовых АКБ оно выше обычного заряда. Для литиевой батареи ориентируйтесь на её паспорт, а не на заводские значения свинцового режима.'],
  battery_equalization_time: ['Длительность выравнивания','battery','Время удержания выравнивающего заряда в минутах. Учитывается только при включённой функции выравнивания.'],
  battery_equalization_timeout: ['Предельное время выравнивания','battery','Максимальное время попытки выполнить цикл выравнивания, в минутах. Ограничивает затянувшийся цикл, если нужное напряжение не достигнуто.'],
  battery_equalization_interval: ['Интервал между выравниваниями','battery','Количество дней между автоматическими циклами выравнивающего заряда. Настройка работает только при включённом выравнивании.'],
  power_saving_mode: ['Энергосбережение при малой нагрузке','system','При малой нагрузке инвертор может переходить в ожидание и периодически искать потребителей. Это уменьшает собственный расход, но маленькие постоянно включённые устройства могут получать питание с перерывами.'],
  overload_restart_mode: ['Автозапуск после перегрузки','protection','Разрешает автоматическое восстановление работы после перегрузки, когда условия снова позволяют включение. Не увеличивает допустимую мощность инвертора.'],
  over_temperature_restart_mode: ['Автозапуск после перегрева','protection','Разрешает автоматический запуск после остывания инвертора. Причину перегрева и условия вентиляции эта настройка не устраняет.'],
  overload_bypass_mode: ['Байпас при перегрузке','protection','Разрешает перевод нагрузки на сеть при перегрузке инвертора, если сеть доступна и подходит по параметрам. Не увеличивает токовые пределы проводки и байпаса.'],
  turn_on_mode: ['Как разрешено включать инвертор','system','Выбирает локальное включение с панели, удалённое управление или оба способа. «Только локально» может отключить последующие удалённые команды запуска. Само изменение этого параметра не является командой включения или выключения.'],
  lcd_backlight_mode: ['Подсветка экрана инвертора','display','Постоянная подсветка либо автоматическое гашение подсветки после ожидания. Изменяет физический LCD инвертора.'],
  lcd_auto_return_mode: ['Возврат экрана на главную','display','При включении LCD инвертора автоматически возвращается на основную страницу примерно через минуту без действий.'],
  buzzer_mode: ['Звуковые сигналы','display','Выбирает, при каких событиях инвертор подаёт звуковой сигнал: смена источника, предупреждения, ошибки или полное отключение звука. Сами защиты продолжают действовать независимо от звука.'],
};
const OPTIONS = {
  'Utility First (UTI)':['UTI · Сеть в приоритете','При подходящей сети дом питается прежде всего от неё. При её отсутствии используются доступные солнце и АКБ.'],
  'Solar First (SOL)':['SOL · Солнце в приоритете','Сначала дом питается от солнца; недостаток мощности покрывает АКБ. Сеть подключается, когда солнце недоступно или АКБ достигла нижнего порога. В отличие от SBU, отсутствие солнца само по себе является условием перехода на сеть.'],
  'Solar-Battery-Utility (SBU)':['SBU · Солнце → АКБ → сеть','Солнце питает дом первым. Недостаток покрывает АКБ; сеть подключается при достижении порога разряда либо недоступности предыдущих источников.'],
  'Solar-Utility-Battery (SUB)':['SUB · Солнце → сеть → АКБ','Солнечная энергия сначала заряжает АКБ, затем питает нагрузку. Недостаток мощности дома покрывает сеть. АКБ остаётся резервом при отсутствии сети.'],
  'Solar-Utility-Feed (SUF)':['SUF · Солнце и сеть, с отдачей','Режим с поддержкой отдачи избытка солнечной энергии в сеть, если это поддерживает прошивка и условия подключения. Он отличается от режимов без экспорта.'],
  'Utility Priority':['Сначала заряд от сети','Сетевой заряд имеет приоритет перед солнечным.'],
  'PV Priority':['Сначала заряд от солнца','При наличии солнечной энергии приоритет у солнечного заряда.'],
  'PV and Utility':['Заряд от солнца и сети','Разрешены оба источника заряда, в пределах общего и сетевого ограничений тока.'],
  'PV Only':['Заряд только от солнца','Сетевой заряд исключён; аккумулятор заряжается от солнечных панелей.'],
  'Wide Range':['Широкий диапазон','Допускает более широкий диапазон входного напряжения сети.'],
  'Narrow Range':['Узкий диапазон','Более строгий диапазон принимаемого сетевого напряжения.'],
  'Mute':['Без звука','Звуковые сигналы отключены.'],
  'Source Change, Warning, Fault':['Смена источника, предупреждения и ошибки','Звук при смене источника питания, предупреждениях и ошибках.'],
  'Warning and Fault':['Предупреждения и ошибки','Звук при предупреждениях и ошибках.'],
  'Fault Only':['Только ошибки','Звук только при ошибках.'],
  'Single':['Один инвертор','Работа отдельного инвертора.'],
  'Parallel':['Параллельная работа','Несколько совместимых инверторов соединены для параллельной работы. Нужны соответствующие соединения и поддержка оборудования.'],
  '3 Phase-P1':['Трёхфазная система · фаза 1','Этот инвертор назначается первой фазой совместимой трёхфазной системы.'],
  '3 Phase-P2':['Трёхфазная система · фаза 2','Этот инвертор назначается второй фазой совместимой трёхфазной системы.'],
  '3 Phase-P3':['Трёхфазная система · фаза 3','Этот инвертор назначается третьей фазой совместимой трёхфазной системы.'],
  'Local and Remote':['С панели и удалённо','Разрешены локальные и удалённые команды включения.'],
  'Local Only':['Только с панели','Включение допускается только локально.'],
  'Remote Only':['Только удалённо','Включение допускается удалённой командой.'],
  'Timed Off':['Гасить автоматически','Подсветка экрана автоматически гаснет после ожидания.'],
  'Always On':['Всегда включена','Подсветка экрана остаётся включённой.'],
  'Off':['Выключено','Функция выключена.'], 'On':['Включено','Функция включена.'],
};
const WARNINGS = {
  'Stop active battery charging before changing this setting.':'Перед изменением необходимо остановить активный заряд АКБ.',
  "Changing this setting while inverter mode is 'Off-Grid' may be unsafe.":'Сейчас инвертор работает автономно. Изменение может повлиять на питание дома.',
  'This setting can only be changed while the inverter is in Power On, Standby, or Fault mode.':'Изменяйте только в режиме запуска, ожидания или ошибки, согласно требованиям интеграции.',
  'Battery is not connected.':'Аккумулятор не подключён.',
};
const unit = u => ({V:'В',A:'А',Hz:'Гц',min:'мин',d:'дн.'}[u] || u || '');
const finite = n => typeof n === 'number' && Number.isFinite(n);

class EnergetikaSettingsPanel extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode:'open'}); this._drafts = new Map(); this._feedback = new Map(); this._rows = new Map(); this._catalog = new Map();
    this._language='ru'; try { this._language=localStorage.getItem('energetika.settings-language')==='original'?'original':'ru'; } catch {}
    this._render();
  }
  configure(config={}) { this._prefix=config.prefix||'anenji_4200_protocol_1_'; this._control=config.control||'sensor.anenji_4200_protocol_1_control_mode'; this._signature=''; this._catalog.clear(); }
  set hass(value) { this._hass=value; this._settle(); if(this._main.open)this._refresh(); }
  set externalBusy(value) { this._externalBusy=!!value; if(this._main.open)this._sync(); }
  disconnectedCallback() { clearTimeout(this._timeout); this.shadowRoot.querySelectorAll('dialog[open]').forEach(d=>d.close()); }
  open() { this._refresh(); if(!this._main.open)this._main.showModal(); }
  _manualEnabled(){return (this._prefix||'anenji_4200_protocol_1_')==='anenji_4200_protocol_1_';}
  _manual(key){return this._manualEnabled()?INVERTER_MANUAL.find(item=>item.key===key):null;}
  _entities() {
    // Keep discovered descriptions during an outage; never manufacture a live value.
    Object.values(this._hass?.states||{}).filter(s=>/^(number|select|switch)\./.test(s.entity_id) && s.entity_id.split('.')[1].startsWith(this._prefix||'anenji_4200_protocol_1_') && s.attributes?.key && s.attributes.entity_kind)
      .forEach(s=>this._catalog.set(s.entity_id,s.attributes));
    const online=[...this._catalog.keys()].map(id=>this._state(id)),keys=new Set(online.map(s=>s.attributes.key));
    this._manualStates=new Map();
    if(this._manualEnabled())for(const item of INVERTER_MANUAL){
      if(keys.has(item.key))continue;
      const prefix=this._prefix||'anenji_4200_protocol_1_',readKeys=item.readKeys||[item.key];
      const reading=Object.values(this._hass?.states||{}).find(s=>s.entity_id.split('.')[1]?.startsWith(prefix)&&! /^(number|select|switch)\./.test(s.entity_id)&&readKeys.some(key=>s.attributes?.key===key||s.entity_id===`sensor.${prefix}${key}`||s.entity_id===`binary_sensor.${prefix}${key}`));
      const entity={entity_id:'manual.energetika_lcd_'+item.number,state:reading?.state||'unavailable',attributes:{key:item.key,title:item.original,manual_only:true,read_source:reading?.entity_id,unit:reading?.attributes?.unit_of_measurement}};
      this._manualStates.set(entity.entity_id,entity);online.push(entity);
    }
    return online.sort((a,b)=>{const na=this._manual(a.attributes.key)?.number,nb=this._manual(b.attributes.key)?.number;return (na?Number(na):1000+(a.attributes.order??999))-(nb?Number(nb):1000+(b.attributes.order??999))||a.entity_id.localeCompare(b.entity_id);});
  }
  _state(id) {const s=this._hass?.states[id]||this._manualStates?.get(id);return {entity_id:id,state:s?.state||'unavailable',attributes:{...this._catalog.get(id),...s?.attributes}};}
  _meta(s) {const m=this._manual(s.attributes.key);return m?[m.title,m.group,m.description]:SETTINGS[s.attributes.key]||[s.attributes.title||s.attributes.friendly_name,'system','Описание этого параметра отсутствует в комплектной инструкции.'];}
  _name(s) {const m=this._manual(s.attributes.key),name=this._language==='ru'?this._meta(s)[0]:(m?.original||s.attributes.title||this._meta(s)[0]);return m?m.number+' · '+name:name;}
  _option(v) { return this._language==='ru'?(OPTIONS[v]?.[0]||v):v; }
  _choices(s) { return s.entity_id.startsWith('switch.')?['off','on']:(s.attributes.options||[]); }
  _display(s,value=s.state) {
    if(['unknown','unavailable',''].includes(String(value)))return s.attributes.manual_only?'Не передаётся в Home Assistant':'Нет данных';
    if(s.attributes.manual_only){if(['on','off'].includes(value))return value==='on'?'Включено':'Выключено';return this._option(value)+(s.attributes.unit?' '+unit(s.attributes.unit):'');}
    if(s.entity_id.startsWith('number.'))return Number(value).toLocaleString('ru-RU',{maximumFractionDigits:2})+' '+unit(s.attributes.unit||s.attributes.unit_of_measurement);
    if(s.entity_id.startsWith('switch.')) { const c=s.attributes.choices?.find(c=>Number(c.value)===(value==='on'?1:0)); return c?this._option(c.label):(value==='on'?'Включено':'Выключено'); }
    return this._option(value);
  }
  _reason(s) {
    if(s?.attributes.manual_only)return 'Настройка на экране инвертора. Удалённый элемент управления не предоставлен интеграцией.';
    if(s?.attributes.key==='output_rating_frequency')return 'Изменение частоты запрещено владельцем. Только просмотр.';
    if(!this._hass || this._hass.connected===false)return 'Нет соединения с Home Assistant.';
    if(this._externalBusy)return 'Дождитесь подтверждения переключения режима питания.';
    if(!s || ['unknown','unavailable',''].includes(s.state)||!this._hass.states[s.entity_id]?.attributes?.key)return 'Нет свежего значения от инвертора.';
    const control=this._hass.states[this._control]?.state;
    if(control!=='full')return 'Для изменения нужен режим «Полный контроль» в EyeBond Local.';
    const a=s.attributes;
    if(a.blocked_by_inverter)return this._errorText(a.blocked_reason||'Инвертор заблокировал изменение этого параметра.');
    if(a.visible===false||a.editable===false||a.policy_editable===false)return 'Изменение сейчас запрещено интеграцией.';
    return '';
  }
  _value(s,input) {
    if(!s.entity_id.startsWith('number.'))return this._choices(s).includes(input)?input:null;
    if(String(input).trim()==='')return null;
    const n=Number(String(input).replace(',','.')),a=s.attributes;
    if(!Number.isFinite(n))return null;
    if(n<0)return null;
    if(finite(a.minimum)&&n<a.minimum || finite(a.maximum)&&n>a.maximum)return null;
    const step=Number(a.step||0.1),base=finite(a.minimum)?a.minimum:0;
    if(step>0&&Math.abs((n-base)/step-Math.round((n-base)/step))>0.00001)return null;
    return n;
  }
  _parameterNumber(key) {
    const id=[...this._catalog.keys()].find(id=>this._catalog.get(id).key===key);
    const s=id&&this._hass?.states[id];
    if(!s||['unknown','unavailable',''].includes(s.state))return null;
    const n=Number(s.state);return Number.isFinite(n)?n:null;
  }
  _validation(s,value) {
    if(value===null)return 'Введите значение в допустимом диапазоне и с указанным шагом.';
    const rules={
      battery_under_voltage_off_grid:['battery_under_voltage','lt','Нижний порог без сети должен быть минимум на 0,1 В ниже порога перехода на сеть.'],
      battery_under_voltage:['battery_under_voltage_off_grid','gt','Порог перехода на сеть должен быть минимум на 0,1 В выше автономного отключения.'],
      battery_float_voltage:['battery_bulk_voltage','le','Поддерживающее напряжение не должно превышать основное.'],
      battery_bulk_voltage:['battery_float_voltage','ge','Основное напряжение заряда не должно быть ниже поддерживающего.'],
      max_ac_charge_current:['max_charge_current','le','Ток заряда от сети не должен превышать общий ток заряда.'],
      max_charge_current:['max_ac_charge_current','ge','Общий ток заряда не должен быть ниже ограничения заряда от сети.'],
    };
    const rule=rules[s.attributes.key];if(!rule||this._prefix!=='anenji_4200_protocol_1_')return '';
    const other=this._parameterNumber(rule[0]);if(other===null)return 'Нет свежего значения связанного параметра. Дождитесь восстановления данных.';
    const n=Number(value),ok={lt:n<=other-0.1+0.00001,gt:n>=other+0.1-0.00001,le:n<=other+0.00001,ge:n>=other-0.00001}[rule[1]];
    return ok?'':rule[2]+' Связанный параметр сейчас: '+other.toLocaleString('ru-RU')+'.';
  }
  _errorText(error) {
    const text=String(error?.message||error||'');
    if(/illegal_data_value|exception_code:3/.test(text))return 'Инвертор отклонил значение. Проверьте связанные пороги и тип АКБ в его меню.';
    if(/response_too_short|crc_mismatch|request_timeout|write_not_confirmed|collector_|unexpected_length/.test(text))return 'Не удалось подтвердить запись по связи. Проверьте поле «Сейчас» перед повтором.';
    return /[А-Яа-яЁё]/.test(text)?text:'Инвертор не подтвердил изменение. Проверьте связь и ограничения параметра.';
  }
  _same(s,v) { return s.entity_id.startsWith('number.')?Math.abs(Number(s.state)-Number(v))<0.00001:s.state===v; }
  _range(s) {
    const a=s.attributes;
    if(a.key==='output_rating_frequency')return 'Только просмотр · изменение частоты запрещено';
    if(!s.entity_id.startsWith('number.'))return '';
    const span=finite(a.minimum)&&finite(a.maximum)?`${a.minimum}–${a.maximum}`:finite(a.minimum)?`от ${a.minimum}`:finite(a.maximum)?`до ${a.maximum}`:'';
    return span?`Диапазон интеграции: ${span} ${unit(a.unit)} · шаг ${a.step||1}`:`Шаг ${a.step||0.1} ${unit(a.unit)} · точные пределы задаёт прошивка`;
  }
  _render() {
    this.shadowRoot.innerHTML=`<style>
      :host{font-family:Inter,system-ui,sans-serif;color:#e8f3ff}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer;color:inherit}button:disabled{cursor:default;opacity:.4}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #68d5ff;outline-offset:3px}dialog{color:#deebf6;background:radial-gradient(ellipse at 90% 0,#162e46,transparent 65%),#0a1624;border:1px solid #335269;border-radius:23px;box-shadow:0 25px 100px #0009;padding:0;max-width:calc(100vw - 24px);max-height:90dvh;width:790px}dialog::backdrop{background:#020813bd;backdrop-filter:blur(5px)}.frame{display:flex;flex-direction:column;max-height:89dvh}header{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:20px 22px 13px}h2{font-size:21px;letter-spacing:-.4px;margin:3px 0}.eyebrow{font-size:9px;letter-spacing:2px;color:#6f9bb3}.close{width:34px;height:34px;border-radius:10px;border:1px solid #344d61;background:#142638;font-size:23px;color:#91b1c5;flex-shrink:0}.tools{padding:0 22px 13px;display:grid;grid-template-columns:1fr auto;gap:10px}.language{display:flex;border:1px solid #2d5265;border-radius:10px;padding:3px;gap:3px}.language button{border:0;background:none;border-radius:7px;padding:7px 10px;color:#8eaebf;font-size:11px}.language button[aria-pressed=true]{background:#164c50;color:#8aeee0}input,select{background:#0a1a2b;color:#deeffa;border:1px solid #315066;border-radius:9px;padding:9px 10px;min-width:0}input[type=search]{width:100%;font-size:12px}select{font-size:12px}nav{display:flex;gap:6px;padding:0 22px 13px;overflow:auto;flex-shrink:0;scrollbar-width:thin}nav button{white-space:nowrap;padding:7px 11px;border:1px solid #2a4357;border-radius:9px;background:#101f30;color:#8faabd;font-size:11px}nav button[aria-pressed=true]{border-color:#2da5a6;color:#7ee7d7;background:#12373d}.list{overflow-y:auto;padding:0 22px 14px;overscroll-behavior:contain;min-height:80px}.row{border:1px solid #263f53;border-radius:13px;padding:13px 14px;margin-bottom:8px;background:linear-gradient(110deg,#102234,#0a1928)}.row[hidden]{display:none}.row-top{display:flex;align-items:center;justify-content:space-between;gap:9px}.label{font-size:13px;font-weight:600;line-height:1.45}.info{border:1px solid #3d687b;border-radius:50%;width:25px;height:25px;flex-shrink:0;background:#163244;color:#82cee0;font-family:Georgia,serif;font-size:15px;font-weight:700;padding:0}.current{margin:5px 0 10px;font-size:11px;color:#8aa9bf}.current strong{color:#66ddc1;font-weight:600}.edit{display:flex;gap:7px;align-items:center}.edit input,.edit select{flex:1;min-width:0;width:0;height:37px}.edit .unit{font-size:11px;color:#8cabbf}.save{font-size:11px;background:#14424e;border:1px solid #2d8492;color:#91e5e9;border-radius:9px;padding:9px 12px;min-height:37px}.range{font-size:9px;color:#7693a8;margin-top:7px;line-height:1.5}.status{font-size:10px;line-height:1.5;color:#a4bccd;margin-top:6px}.status:empty{display:none}.status.error{color:#ffad9e}.status.success{color:#70e5c6}.empty{font-size:12px;color:#99b2c5;padding:20px 0}footer{border-top:1px solid #243d50;padding:12px 22px;font-size:10px;line-height:1.5;color:#7695aa}.help{width:530px}.help-body{padding:0 22px 20px;overflow-y:auto;min-height:0;font-size:13px;line-height:1.7;color:#afc6d6}.help-body p{margin:0 0 12px}.help-body h3{font-size:12px;color:#67dcca;margin:16px 0 4px}.original{font-size:11px;color:#779bb2}.choice{padding:9px 11px;background:#10273a;border:1px solid #27475b;border-radius:10px;margin:8px 0}.choice strong{color:#dcf0ff;font-size:12px}.choice p{font-size:11px;line-height:1.6;margin:3px 0 0}.warning{color:#f2c58f;background:#49351e5c;border:1px solid #655033;border-radius:10px;padding:10px 12px;font-size:11px;line-height:1.6}.change{margin:15px 0;padding:14px;background:#112b3c;border:1px solid #31576a;border-radius:12px;color:#67ddc9;overflow-wrap:anywhere}.actions{display:flex;gap:9px;justify-content:flex-end;margin-top:15px}.cancel{background:none;border:1px solid #3b5769;border-radius:9px;padding:9px 14px;font-size:12px}.apply{background:#155357;border:1px solid #35989b;border-radius:9px;color:#99f5e5;padding:9px 16px;font-size:12px}
      .catalog-tools{padding:0 22px 11px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.catalog-tools button{font-size:11px;border:1px solid #315368;border-radius:9px;padding:6px 10px;background:#0b2232;color:#97b9cb}.catalog-tools button[aria-pressed=true]{background:#164640;color:#93efd7;border-color:#258c7a}.catalog-count{font-size:10px;color:#7f9fb4;line-height:1.6}.manual-tag{display:inline-block;font-size:10px;color:#e5c58c;border:1px solid #655334;border-radius:7px;padding:3px 7px;margin:3px 0 7px;background:#49371c44}.manual-note{font-size:11px;color:#92adbf;line-height:1.6;margin:0}.extra-tag{font-size:9px;color:#8eacc1;margin-bottom:5px}.manual-source{font-size:11px;color:#81c8d6}.manual-facts{padding:12px;background:#10283a;border:1px solid #2b4a5e;border-radius:11px;margin:12px 0}
      @media(max-width:520px){dialog{max-width:calc(100vw - 16px);border-radius:19px;max-height:93dvh}.frame{max-height:92dvh}header{padding:16px 14px 12px}h2{font-size:18px}.tools{padding:0 14px 12px;grid-template-columns:1fr;gap:8px}.language{width:max-content}.language button{padding:6px 10px}.list{padding:0 12px 12px}nav{padding:0 14px 12px}.row{padding:11px 12px}.label{font-size:12px}footer{padding:10px 14px;font-size:9px}.help-body{padding:0 16px 18px;font-size:12px}.edit select{font-size:11px}.range{font-size:9px}}
    </style><dialog class="settings" aria-labelledby="settings-title"><div class="frame"><header><div><div class="eyebrow">ЭНЕРГЕТИКА / УПРАВЛЕНИЕ</div><h2 id="settings-title">Настройки инвертора</h2></div><button class="close" data-close="settings" aria-label="Закрыть настройки">×</button></header><div class="tools"><input type="search" placeholder="Номер пункта или название…" aria-label="Найти параметр"><div class="language" role="group" aria-label="Названия параметров"><button data-lang="ru">Русский</button><button data-lang="original">Исходные названия</button></div></div><nav aria-label="Раздел настроек"><button data-group="all" aria-pressed="true">Все</button>${Object.entries(GROUPS).map(([key,name])=>`<button data-group="${key}" aria-pressed="false">${name}</button>`).join('')}</nav><div class="catalog-tools"><button data-scope="all" aria-pressed="true">Все пункты</button><button data-scope="online">Онлайн</button><button data-scope="lcd">На LCD</button><span class="catalog-count" data-catalog-count></span></div><div class="list"></div><footer>Номера соответствуют комплектной инструкции. «На LCD» — настройка на экране инвертора; кнопка i открывает описание и варианты. Изменения онлайн применяются по одному после подтверждения.</footer></div></dialog><dialog class="help" aria-labelledby="help-title"><div class="frame"><header><h2 id="help-title"></h2><button class="close" data-close="help" aria-label="Закрыть справку">×</button></header><div class="help-body" data-help-body></div></div></dialog><dialog class="review help" aria-labelledby="review-title"><div class="frame"><header><h2 id="review-title">Применить изменение?</h2><button class="close" data-close="review" aria-label="Закрыть подтверждение">×</button></header><div class="help-body" data-review-body></div></div></dialog>`;
    this._main=this.shadowRoot.querySelector('.settings');
    this.shadowRoot.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>this.shadowRoot.querySelector('.'+b.dataset.close).close());
    this.shadowRoot.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target!==d)return;const box=d.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)d.close();}));
    this.shadowRoot.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{this._language=b.dataset.lang;try{localStorage.setItem('energetika.settings-language',this._language);}catch{}this._signature='';this._refresh();});
    this.shadowRoot.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{this._group=b.dataset.group;this._filter();});
    this.shadowRoot.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{this._scope=b.dataset.scope;this._filter();});
    this.shadowRoot.querySelector('input[type=search]').oninput=()=>this._filter();
  }
  _refresh() {
    const states=this._entities(),signature=JSON.stringify([this._language,states.map(s=>[s.entity_id,s.attributes.options,s.attributes.minimum,s.attributes.maximum,s.attributes.step,s.attributes.manual_only])]);
    this.shadowRoot.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===this._language)));
    if(signature!==this._signature) {
      this._signature=signature;this._rows.clear();
      this.shadowRoot.querySelector('.list').innerHTML=states.map((s,i)=>`<section class="row" data-index="${i}" data-program="${this._manual(s.attributes.key)?.number||''}">${!this._manual(s.attributes.key)?'<div class="extra-tag">Дополнительный параметр интеграции · номера в этой инструкции нет</div>':''}<div class="row-top"><label class="label" ${s.attributes.manual_only?'':`for="param-${i}"`}>${esc(this._name(s))}</label><button class="info" aria-label="Справка: ${esc(this._name(s))}">i</button></div><div class="current">Сейчас: <strong></strong></div>${s.attributes.manual_only?'<span class="manual-tag">Настройка на LCD</span><p class="manual-note">'+esc(this._meta(s)[2])+'</p>':`<div class="edit">${s.entity_id.startsWith('number.')?`<input id="param-${i}" type="number" inputmode="decimal" step="${esc(s.attributes.step||0.1)}" ${finite(s.attributes.minimum)?`min="${s.attributes.minimum}"`:''} ${finite(s.attributes.maximum)?`max="${s.attributes.maximum}"`:''}><span class="unit">${esc(unit(s.attributes.unit))}</span>`:`<select id="param-${i}">${this._choices(s).map(v=>`<option value="${esc(v)}">${esc(this._display(s,v))}</option>`).join('')}</select>`}<button class="save">Сохранить</button></div><div class="range">${esc(this._range(s))}</div>`}<div class="status" role="status"></div></section>`).join('')||'<div class="empty">Параметры пока не доступны. Проверьте связь с инвертором.</div>';
      states.forEach((s,i)=>{
        const row=this.shadowRoot.querySelector(`[data-index="${i}"]`),input=row.querySelector('input,select');
        this._rows.set(s.entity_id,{row,input});
        row.querySelector('.info').onclick=()=>this.showInfo(s.attributes.key);
        if(!input)return;
        input.value=this._drafts.has(s.entity_id)?this._drafts.get(s.entity_id):s.state;
        input.addEventListener('input',()=>{this._drafts.set(s.entity_id,input.value);this._feedback.delete(s.entity_id);this._sync();});
        input.addEventListener('change',()=>{this._drafts.set(s.entity_id,input.value);this._feedback.delete(s.entity_id);this._sync();});
        row.querySelector('.save').onclick=()=>this._review(s.entity_id);
      });
    }
    const manualCount=states.filter(s=>this._manual(s.attributes.key)).length,onlineCount=states.filter(s=>this._manual(s.attributes.key)&&!s.attributes.manual_only).length;
    this.shadowRoot.querySelector('[data-catalog-count]').textContent=this._manualEnabled()?`LCD: ${manualCount} · онлайн: ${onlineCount}`:'';
    this._sync();this._filter();
  }
  _filter() {
    const query=this.shadowRoot.querySelector('input[type=search]').value.trim().toLocaleLowerCase('ru'),group=this._group||'all',scope=this._scope||'all';
    this.shadowRoot.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===group)));
    this.shadowRoot.querySelectorAll('[data-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scope===scope)));
    for(const [id,{row}] of this._rows){const s=this._state(id),m=this._manual(s.attributes.key),search=[this._meta(s)[0],s.attributes.title,s.attributes.key,m?.number,m?.original,m?.description,...(m?.options||[]).flat()].join(' ').toLocaleLowerCase('ru'),matches=/^\d{1,2}$/.test(query)?Number(m?.number)===Number(query):search.includes(query);row.hidden=(group!=='all'&&group!==this._meta(s)[1])||(scope==='online'&&s.attributes.manual_only)||(scope==='lcd'&&!s.attributes.manual_only)||!matches;}
  }
  _sync() {
    for(const [id,{row,input}] of this._rows) {
      const s=this._state(id);
      row.querySelector('.current strong').textContent=this._display(s);
      if(s.attributes.manual_only){row.querySelector('.status').textContent=s.attributes.read_source?'Значение читается из инвертора · изменение на LCD.':'Текущее значение не передаётся · нажмите i для справки и вариантов.';continue;}
      if(!this._drafts.has(id)&&this.shadowRoot.activeElement!==input)input.value=s.state;
      const reason=this._reason(s),v=this._value(s,input.value),validation=this._validation(s,v),changed=v!==null&&!this._same(s,v),pending=!!this._pending;
      input.disabled=!!reason||pending; row.querySelector('.save').disabled=!!reason||pending||!changed||!!validation;
      row.querySelector('.save').textContent=s.attributes.key==='output_rating_frequency'?'Запрещено':'Сохранить';
      if(s.attributes.key==='battery_under_voltage_off_grid'){
        const upper=this._parameterNumber('battery_under_voltage');
        if(upper!==null){input.max=(upper-0.1).toFixed(1);row.querySelector('.range').textContent=`Шаг 0,1 В · максимум сейчас ${Number(input.max).toLocaleString('ru-RU')} В (с учётом порога перехода на сеть)`;}
      }
      const feedback=this._feedback.get(id),status=row.querySelector('.status');
      status.className='status '+(feedback?.kind||'');
      status.textContent=this._pending?.id===id?(this._pending.recovering?'Проверяю фактическое значение после сбоя связи…':'Ожидание ответа инвертора…'):reason||feedback?.text||(this._drafts.has(id)?validation:'');
    }
  }
  showInfo(key,option) {
    const s=this._entities().find(s=>s.attributes.key===key),manual=this._manual(key),meta=manual?[manual.title,manual.group,manual.description]:SETTINGS[key]||[key,'system','Описание отсутствует в комплектной инструкции.'];
    const dialog=this.shadowRoot.querySelector('.help');this.shadowRoot.querySelector('#help-title').textContent=(manual?manual.number+' · ':'')+(option?(OPTIONS[option]?.[0]||option):meta[0]);
    const choices=option?[option]:(s?.entity_id.startsWith('switch.')?(s.attributes.choices||[]).map(c=>c.label):s?.attributes.options||[]);
    const manualBody=manual&&!option?`<p class="manual-source">Комплектная инструкция · пункт ${manual.number} · лист PDF ${manual.pages} из 7</p><p>${esc(manual.description)}</p>${(manual.details||[]).map(text=>`<p>${esc(text)}</p>`).join('')}${manual.range||manual.defaults?`<div class="manual-facts">${manual.range?`<p>${esc(manual.range)}</p>`:''}${manual.defaults?`<p>${esc(manual.defaults)}</p>`:''}</div>`:''}${manual.options?.length?'<h3>Варианты на экране инвертора</h3>':''}${(manual.options||[]).map(([code,title,description])=>`<div class="choice"><strong>${esc(code)} · ${esc(title)}</strong><p>${esc(description)}</p></div>`).join('')}<h3>Как изменить этот пункт</h3><p>${s?.attributes.manual_only?'Удалённый элемент управления этого пункта не предоставлен текущей интеграцией. На LCD удерживайте ENTER около 3 секунд, выберите пункт кнопками UP/DOWN, подтвердите ENTER; ESC — выход. Справка не отправляет команды инвертору.':'Используйте поле этого пункта в настройках панели. Доступные значения и ограничения записи берутся из текущих данных интеграции; после подтверждения отправляется одна команда.'}</p>`:`<p>${esc(meta[2])}</p>${choices.length?'<h3>Что означает каждый вариант</h3>':''}${choices.map(v=>`<div class="choice"><strong>${esc(OPTIONS[v]?.[0]||v)}</strong><p>${esc(OPTIONS[v]?.[1]||'Вариант из текущей интеграции.')}</p></div>`).join('')}`;
    this.shadowRoot.querySelector('[data-help-body]').innerHTML=`<p class="original">${esc(manual?.original||s?.attributes.title||key)}</p>${manualBody}${s&&this._range(s)?`<p class="original">${esc(this._range(s))}. Пределы инструкции не заменяют паспорт аккумулятора и ограничения прошивки.</p>`:''}`;
    if(!dialog.open)dialog.showModal();
  }
  _review(id) {
    const s=this._hass?.states[id],ref=this._rows.get(id);if(!s||!ref||this._pending||this._reason(s))return;
    const value=this._value(s,ref.input.value);if(value===null||this._same(s,value)||this._validation(s,value))return;
    const warnings=(s.attributes.warnings||[]).map(w=>WARNINGS[w]||'У интеграции есть дополнительное условие для изменения. '+w);
    if(s.attributes.reboot_required)warnings.push('Для вступления в силу может потребоваться перезапуск инвертора.');
    const review=this.shadowRoot.querySelector('.review');
    this.shadowRoot.querySelector('[data-review-body]').innerHTML=`<p>${esc(this._meta(s)[0])}</p><div class="change">${esc(this._display(s))} → <strong>${esc(this._display(s,value))}</strong></div>${warnings.length?`<div class="warning">${warnings.map(esc).join('<br>')}</div>`:''}<p class="original">Будет изменён один параметр. Текущее значение обновится после ответа инвертора.</p><div class="actions"><button class="cancel">Отмена</button><button class="apply">Применить</button></div>`;
    this.shadowRoot.querySelector('.cancel').onclick=()=>review.close();
    this.shadowRoot.querySelector('.apply').onclick=()=>{review.close();this._apply(id,value,s.state);};review.showModal();
  }
  async _apply(id,value,oldState) {
    const s=this._hass?.states[id];if(!s||this._pending)return;
    // Recheck the live state and policy after the review dialog, before any write.
    if(this._reason(s)||s.state!==oldState||this._value(s,value)===null||this._validation(s,value)){this._feedback.set(id,{kind:'error',text:'Параметр или доступ изменился. Проверьте значение и подтвердите заново.'});this._sync();return;}
    const operation={id,value,accepted:false,started:Date.now()};this._pending=operation;this._feedback.delete(id);this._sync();
    this.dispatchEvent(new CustomEvent('energetika-setting-pending',{detail:{pending:true},bubbles:true,composed:true}));
    const waitForReadback=()=>{if(this._pending===operation)this._timeout=setTimeout(()=>this._finish(operation,{kind:'error',text:'Подтверждение не получено. Проверьте фактическое значение перед повторной отправкой.'}),20000);};
    const domain=id.split('.')[0],service=domain==='number'?'set_value':domain==='select'?'select_option':value==='on'?'turn_on':'turn_off';
    const data={entity_id:id,...(domain==='number'?{value}:domain==='select'?{option:value}:{})};
    try {
      if(id.endsWith('_output_source_priority')&&this._hass.states['input_boolean.energetika_solar_auto']?.state==='on')
        await this._hass.callService('script','energetika_solar_pause',{});
      await this._hass.callService(domain,service,data);if(this._pending!==operation)return;operation.accepted=true;this._settle();waitForReadback();}
    catch(error){
      if(this._pending!==operation)return;
      const message=String(error?.message||error||'');
      if(/response_too_short|crc_mismatch|request_timeout|write_not_confirmed|collector_|unexpected_length|Не удалось подтвердить запись по связи/.test(message)){
        operation.accepted=true;operation.recovering=true;this._settle();this._sync();waitForReadback();
      }else this._finish(operation,{kind:'error',text:this._errorText(error)});
    }
  }
  _settle() {const p=this._pending,s=p&&this._hass?.states[p.id];if(p?.accepted&&s&&this._same(s,p.value)&&(!p.recovering||Date.parse(s.last_updated)>=p.started))this._finish(p,{kind:'success',text:p.recovering?'Фактическое значение подтверждено после сбоя связи.':'Инвертор подтвердил значение.'});}
  _finish(operation,feedback) {
    if(this._pending!==operation)return;clearTimeout(this._timeout);this._pending=null;this._feedback.set(operation.id,feedback);
    if(feedback.kind==='success')this._drafts.delete(operation.id);this._sync();
    this.dispatchEvent(new CustomEvent('energetika-setting-pending',{detail:{pending:false},bubbles:true,composed:true}));
  }
}
if(!customElements.get('energetika-settings-panel'))customElements.define('energetika-settings-panel',EnergetikaSettingsPanel);
