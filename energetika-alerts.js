/* SMG alarm bits from EyeBond Local 0.1.53. Bit numbers are not LCD error codes. */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TRIANGLE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.8 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.5m0 3h.01"/></svg>';
const FAULTS={
  1:['Перегрев силового модуля инвертора','Температура силового модуля превысила допустимую. Проверьте вентиляцию, температуру помещения и нагрузку.'],
  2:['Перегрев преобразователя DC/DC','Перегрелся внутренний преобразователь постоянного напряжения. Проверьте охлаждение и нагрузку.'],
  3:['Слишком высокое напряжение АКБ','Напряжение батареи превысило предел инвертора. Проверьте настройки заряда и состояние BMS.'],
  4:['Перегрев солнечного модуля','Температура солнечного преобразователя превысила предел. Проверьте охлаждение.'],
  5:['Короткое замыкание на выходе','Инвертор обнаружил короткое замыкание в выходной цепи. Требуется проверка подключённых потребителей и проводки.'],
  6:['Повышенное напряжение инвертора','Напряжение силовой части инвертора выше допустимого.'],
  7:['Перегрузка выхода','Подключённая нагрузка превышает допустимую мощность инвертора.'],
  8:['Повышенное напряжение внутренней шины','Напряжение внутренней DC-шины выше допустимого.'],
  9:['Не завершён плавный запуск шины','Внутренняя DC-шина не вышла на рабочий режим за отведённое время.'],
  10:['Превышен ток солнечного входа','Ток солнечного преобразователя превысил допустимое значение.'],
  11:['Слишком высокое напряжение панелей','Напряжение PV выше допустимого для инвертора. Проверьте конфигурацию строк панелей.'],
  12:['Превышен ток аккумулятора','Ток батареи превысил допустимый предел инвертора.'],
  13:['Превышен ток инвертора','Силовой модуль обнаружил слишком большой ток.'],
  14:['Низкое напряжение внутренней шины','Напряжение внутренней DC-шины ниже рабочего диапазона.'],
  16:['Повышенная постоянная составляющая выхода','В выходном переменном напряжении обнаружена слишком большая постоянная составляющая.'],
  18:['Смещение датчика выходного тока','Слишком велико смещение нуля измерителя выходного тока.'],
  19:['Смещение датчика тока инвертора','Слишком велико смещение нуля измерителя тока инвертора.'],
  20:['Смещение датчика тока АКБ','Слишком велико смещение нуля измерителя тока батареи.'],
  21:['Смещение датчика тока панелей','Слишком велико смещение нуля измерителя тока PV.'],
  22:['Пониженное напряжение инвертора','Напряжение силовой части инвертора ниже допустимого.'],
  23:['Защита от обратной мощности','Сработала защита инвертора от отрицательной мощности.'],
  24:['Потерян ведущий параллельной системы','Нет связи с ведущим инвертором параллельной системы.'],
  25:['Ошибка параллельной синхронизации','Некорректный сигнал синхронизации параллельных инверторов.'],
  26:['Несовместимый тип аккумулятора','Инвертор сообщает о несовместимости типа батареи.'],
  27:['Несовместимые прошивки инверторов','Версии прошивок устройств параллельной системы несовместимы.'],
};
const WARNINGS={
  1:['Нестандартная форма напряжения сети','Инвертор обнаружил искажение формы сетевого напряжения.'],
  3:['Низкое напряжение сети','Напряжение внешней сети ниже допустимого диапазона.'],
  4:['Повышенная частота сети','Частота внешней сети выше допустимого диапазона.'],
  5:['Пониженная частота сети','Частота внешней сети ниже допустимого диапазона.'],
  6:['Низкое напряжение солнечных панелей','Напряжения PV недостаточно для работы солнечного преобразователя. Вечером и ночью это возможно при отсутствии солнца.'],
  7:['Высокая температура','Температура приближается к пределу. Проверьте охлаждение и нагрузку.'],
  8:['Низкое напряжение аккумулятора','Напряжение АКБ ниже предупредительного порога инвертора.'],
  9:['Аккумулятор не подключён','Инвертор не обнаруживает батарею. Возможны отключение BMS или разрыв цепи АКБ.'],
  10:['Перегрузка','Инвертор сообщает о превышении допустимой нагрузки.'],
  11:['Выравнивающий заряд АКБ','Включён режим выравнивающего заряда. Это сообщение о режиме работы; его допустимость зависит от типа батареи.'],
  12:['АКБ ниже порога восстановления','Батарея разряжена ниже заданного порога возврата к работе от АКБ.'],
  13:['Снижена выходная мощность','Инвертор ограничивает доступную выходную мощность.'],
  14:['Вентилятор заблокирован','Инвертор сообщает о блокировке вентилятора. Проверьте охлаждение.'],
  15:['Недостаточно солнечной энергии','Мощности панелей недостаточно для использования. Это возможно при слабом освещении.'],
  16:['Нет параллельной связи','Прервана связь между параллельными инверторами.'],
  17:['Разные режимы одиночной/параллельной работы','Настройки схемы работы инверторов не совпадают.'],
  18:['Разница напряжений АКБ в параллельной системе','Инверторы измеряют слишком разные напряжения батарей.'],
  19:['Ошибка связи с литиевой батареей','Нарушена связь инвертора с BMS литиевой батареи.'],
  20:['Ток разряда АКБ выше настройки','Измеренный ток разряда превысил заданное ограничение.'],
};
const description=entry=>(entry.kind==='fault'?FAULTS:WARNINGS)[entry.bit]||[
  `Неизвестный ${entry.kind==='fault'?'код ошибки':'код предупреждения'} · бит ${entry.bit}`,
  'Этот бит зарезервирован или зависит от прошивки. Его значение не расшифровано в протоколе вашей интеграции.'
];
const date=value=>value?new Date(value*1000).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';

class EnergetikaAlertsPanel extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._tab='active';this._deleted=false;}
  configure(config={}){this._entity=config.entity||'sensor.energetika_inverter_alerts';this._script=config.script||'energetika_alarm_journal';}
  connectedCallback(){if(!this.shadowRoot.firstChild)this._render();this._timer=setInterval(()=>this._sync(),30000);}
  disconnectedCallback(){clearInterval(this._timer);}
  set hass(value){this._hass=value;this._sync();}
  open(){this._sync();this.shadowRoot.querySelector('dialog').showModal();}
  _render(){
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;font-family:inherit;color:#e8f2fc}*{box-sizing:border-box}button{font:inherit;cursor:pointer;color:inherit}button:focus-visible{outline:2px solid #b4eaff;outline-offset:3px}button:disabled{opacity:.45;cursor:default}[hidden]{display:none!important}
      .chip{display:flex;align-items:center;gap:6px;min-height:34px;padding:6px 9px;border:1px solid #345265;border-radius:10px;background:#102335eb;color:#8fa9be;box-shadow:0 3px 14px #0003;font-size:11px;white-space:nowrap}.chip svg{width:19px;height:19px}.chip.fault{background:#3a1725ed;border-color:#d35e69;color:#ff8190}.chip.warning{background:#33291aed;border-color:#a88339;color:#ffd578}.chip strong{font-variant-numeric:tabular-nums}.badge{border-radius:9px;padding:1px 5px;background:#ffffff14;font-size:9px}
      dialog{color:inherit;background:radial-gradient(ellipse at 90% 0,#193148,#091623 65%);border:1px solid #36556e;border-radius:23px;padding:0;width:min(690px,calc(100vw - 24px));max-height:88dvh;box-shadow:0 25px 80px #0009}dialog::backdrop{background:#020912b8;backdrop-filter:blur(5px)}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:22px 22px 14px}.eyebrow{color:#7395ab;font-size:9px;letter-spacing:2px;margin-bottom:7px}h2{margin:0;font-size:23px;letter-spacing:-.5px}.close{border:1px solid #34546a;background:#142d3e;border-radius:10px;width:36px;height:36px;color:#9dbacb;font-size:24px;flex-shrink:0}.tabs{display:flex;gap:6px;padding:0 22px 14px}.tabs button,.filter{border:1px solid #30495b;border-radius:9px;background:#0c1d2b;color:#93afc0;padding:8px 12px;font-size:12px}.tabs button[aria-selected=true]{background:#14413e;color:#83f0d7;border-color:#318e82}.body{overflow:auto;padding:0 22px 18px;max-height:calc(88dvh - 180px);overscroll-behavior:contain}.summary{display:flex;gap:10px;padding:13px;border:1px solid #315164;border-radius:13px;background:#0c1f2e;margin-bottom:13px;align-items:center;color:#a6c2d1;font-size:12px;line-height:1.5}.summary svg{width:24px;height:24px;flex-shrink:0}.summary.fault{border-color:#843d4b;color:#ff9ba5;background:#321b28}.summary.warning{border-color:#756139;color:#efd28c;background:#2a261c}.summary strong{display:block;font-size:14px;color:#eaf2f6}.meta{color:#7998ac;font-size:11px;line-height:1.5;margin:9px 0}.tools{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px}.filter{font-size:10px;padding:6px 9px}.filter[aria-pressed=true]{border-color:#62a1b4;color:#b3e5f4}.empty{padding:25px 12px;text-align:center;color:#84a4b6;font-size:12px;line-height:1.6}.entry{border:1px solid #2d485b;border-radius:14px;background:#0b1d2bdd;margin:0 0 10px;padding:13px}.entry.fault{border-left:3px solid #ff667c}.entry.warning{border-left:3px solid #ecc368}.entry.resolved{border-left-color:#526e81}.heading{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}.title{font-size:14px;font-weight:650;line-height:1.4}.state{font-size:10px;color:#f5ce7f;white-space:nowrap}.fault .state{color:#ff94a1}.resolved .state{color:#91b6bd}.entry p{color:#9eb8c9;font-size:12px;line-height:1.55;margin:9px 0}.times{font-size:10px;color:#7395aa;line-height:1.7}.actions{display:flex;gap:7px;margin-top:10px;flex-wrap:wrap}.actions button{background:#143542;border:1px solid #2e6975;border-radius:8px;padding:7px 10px;font-size:11px;color:#a8dedf}.actions .remove{background:#261e2a;border-color:#5d3b4b;color:#c8a1ac}.read{font-size:10px;color:#6fb6a1}.foot{padding:13px 22px;border-top:1px solid #263f52;color:#7593a6;font-size:10px;line-height:1.6}.feedback{font-size:12px;color:#f4bf98;margin-bottom:10px}.feedback:empty{display:none}.bits{font:10px ui-monospace,monospace;color:#7295a9;margin-top:7px}.archived{opacity:.65}
      @media(max-width:520px){.chip strong{display:none}.chip{min-height:28px;padding:4px 7px;font-size:9px;border-radius:8px;gap:4px}.chip svg{width:16px;height:16px}.badge{font-size:8px;padding:1px 4px}.top{padding:17px 15px 12px}h2{font-size:20px}.tabs{padding:0 15px 12px}.body{padding:0 15px 14px}.foot{padding:11px 15px}.title{font-size:13px}.entry{padding:11px}.state{font-size:9px}}
      @media(max-width:365px){.chip strong{display:none}.chip{gap:2px;padding:4px}.chip svg{width:18px;height:18px}}
    </style><button class="chip" data-open aria-label="Ошибки инвертора и журнал">${TRIANGLE}<strong data-label>Ошибки</strong><span class="badge" data-badge hidden></span></button>
    <dialog aria-labelledby="alerts-title"><div class="top"><div><div class="eyebrow">ЭНЕРГЕТИКА / ДИАГНОСТИКА</div><h2 id="alerts-title">Ошибки инвертора</h2></div><button class="close" aria-label="Закрыть ошибки">×</button></div><div class="tabs" role="tablist" aria-label="Ошибки и журнал"><button role="tab" data-tab="active" aria-selected="true">Текущие <span data-active-count></span></button><button role="tab" data-tab="history" aria-selected="false">Журнал <span data-history-count></span></button></div><div class="body"><div class="summary" data-summary></div><div class="feedback" role="status" data-feedback></div><div data-history-tools class="tools" hidden><span class="meta">До 100 событий · активные сохраняются</span><button class="filter" data-deleted aria-pressed="false">Удалённые</button></div><div data-entries></div><div class="meta" data-since></div></div><div class="foot">«Прочитано» отмечает событие. «Удалить из журнала» скрывает завершённую запись; её можно восстановить в «Удалённые». Активную ошибку снимает инвертор после устранения причины. Журнал ведётся в Home Assistant, в том числе при закрытой панели.</div></dialog>`;
    const r=this.shadowRoot,d=r.querySelector('dialog');
    r.querySelector('[data-open]').onclick=()=>this.open();
    r.querySelector('.close').onclick=()=>d.close();
    d.addEventListener('click',e=>{if(e.target===d){const b=d.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)d.close();}});
    r.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{this._tab=b.dataset.tab;this._sync();});
    r.querySelector('[data-deleted]').onclick=()=>{this._deleted=!this._deleted;this._sync();};
    r.querySelector('[data-entries]').onclick=e=>{const b=e.target.closest('[data-operation]');if(b)this._operate(b.dataset.operation,b.dataset.id);};
    this._sync();
  }
  _sync(){
    if(!this.shadowRoot.firstChild)return;
    const r=this.shadowRoot,s=this._hass?.states[this._entity||'sensor.energetika_inverter_alerts'],a=s?.attributes||{};
    const entries=Array.isArray(a.entries)?a.entries:[],active=entries.filter(e=>!e.ended),faults=active.filter(e=>e.kind==='fault');
    const fresh=!!a.fault_fresh&&!!a.warning_fresh&&Date.now()/1000-Number(a.checked_at)<100;
    const severity=faults.length?'fault':active.length?'warning':'';
    const chip=r.querySelector('.chip');chip.className=`chip ${severity}`;
    r.querySelector('[data-label]').textContent=faults.length?`Ошибка · ${faults.length}`:active.length?`Внимание · ${active.length}`:fresh?'Ошибок нет':'Нет данных';
    const unread=entries.filter(e=>!e.acknowledged&&!e.deleted).length,badge=r.querySelector('[data-badge]');
    badge.hidden=!unread;badge.textContent=unread;chip.title=`Ошибки и журнал${fresh?'':' · нет свежих данных'}${unread?` · непрочитано: ${unread}`:''}`;
    r.querySelector('[data-active-count]').textContent=active.length?`(${active.length})`:'';
    r.querySelector('[data-history-count]').textContent=entries.filter(e=>!e.deleted).length||'';
    r.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===this._tab)));
    const summary=r.querySelector('[data-summary]');summary.className=`summary ${severity}`;
    summary.innerHTML=`${TRIANGLE}<div><strong>${faults.length?`Ошибки: ${faults.length}`:active.length?`Предупреждения: ${active.length}`:fresh?'Активных ошибок и предупреждений нет':'Нет свежих данных инвертора'}</strong>${fresh?(active.length?'Инвертор передаёт следующие сообщения.':'Все полученные биты ошибок и предупреждений сброшены.'):'Последние события сохранены. Их завершение будет подтверждено после восстановления связи.'}</div>`;
    r.querySelector('[data-history-tools]').hidden=this._tab!=='history';
    const filter=r.querySelector('[data-deleted]');filter.setAttribute('aria-pressed',String(this._deleted));filter.textContent=`Удалённые${entries.some(e=>e.deleted)?` (${entries.filter(e=>e.deleted).length})`:''}`;
    const shown=this._tab==='active'?active:entries.filter(e=>this._deleted?e.deleted:!e.deleted);
    // Do not replace buttons on every telemetry packet: keep focus and scroll stable.
    const signature=JSON.stringify([this._tab,this._deleted,shown,this._pending,fresh]);
    if(signature!==this._signature){this._signature=signature;
      r.querySelector('[data-entries]').innerHTML=shown.length?[...shown].sort((x,y)=>y.started-x.started).map(e=>this._entry(e)).join(''):`<div class="empty">${this._tab==='active'?(fresh?'Сейчас сообщений нет.':'Ожидание свежей диагностики.'):(this._deleted?'Удалённых записей нет.':'Журнал пока пуст. Новые сообщения появятся здесь автоматически.')}</div>`;
    }
    r.querySelector('[data-feedback]').textContent=this._feedback||'';
    r.querySelector('[data-since]').textContent=a.monitoring_since?`Наблюдение с ${date(a.monitoring_since)}. Время — когда Home Assistant увидел событие. Биты протокола могут отличаться от номера ошибки на дисплее. Заводской журнал инвертора не импортируется.`:'';
  }
  _entry(e){
    const [title,help]=description(e),ended=!!e.ended;
    return `<article class="entry ${esc(e.kind)} ${ended?'resolved':''} ${e.deleted?'archived':''}"><div class="heading"><span class="title">${esc(title)}</span><span class="state">${ended?'Завершено':e.kind==='fault'?'Ошибка':'Предупреждение'}</span></div><p>${esc(help)}</p><div class="times">Обнаружено: ${date(e.started)}${ended?`<br>Завершено: ${date(e.ended)}`:''}</div><div class="bits">${e.kind==='fault'?'FAULT':'WARNING'} · бит ${Number(e.bit)} · маска 0x${(2**Number(e.bit)).toString(16).toUpperCase()}</div><div class="actions">${!e.acknowledged?`<button data-operation="ack" data-id="${esc(e.id)}" ${this._pending?'disabled':''}>Прочитано</button>`:'<span class="read">✓ Прочитано</span>'}${e.deleted?`<button data-operation="restore" data-id="${esc(e.id)}" ${this._pending?'disabled':''}>Восстановить</button>`:ended?`<button class="remove" data-operation="hide" data-id="${esc(e.id)}" ${this._pending?'disabled':''}>Удалить из журнала</button>`:''}</div></article>`;
  }
  async _operate(operation,id){
    if(this._pending||!this._hass)return;
    this._pending=true;this._feedback='';this._sync();
    try{await this._hass.callService('script',this._script||'energetika_alarm_journal',{operation,entry_id:id});}
    catch(error){this._feedback=`Не удалось изменить запись: ${error?.message||error}`;}
    finally{this._pending=false;this._sync();}
  }
}
if(!customElements.get('energetika-alerts-panel'))customElements.define('energetika-alerts-panel',EnergetikaAlertsPanel);
