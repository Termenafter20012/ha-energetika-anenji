/* Home Assistant owns all timers and switching. This component is only a UI. */
const P='sensor.anenji_4200_protocol_1_';
const AUTO='input_boolean.energetika_solar_auto';
const WEATHER='sensor.energetika_solar_weather';
const PV_DAY=P+'estimated_pv_energy_today';
const MODE='select.anenji_4200_protocol_1_output_source_priority';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const fmt=(v,d=0)=>num(v)===null?'—':Number(v).toLocaleString('ru-RU',{maximumFractionDigits:d});
const dayKey=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const dayLabel=key=>new Date(key+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short'});
function weather(code,night=false){
  if(night)return ['☾','Ночь'];
  if(code===0)return ['☀','Ясно'];
  if(code===1)return ['🌤','Преимущественно ясно'];
  if(code===2)return ['⛅','Переменная облачность'];
  if(code===3)return ['☁','Пасмурно'];
  if([45,48].includes(code))return ['≋','Туман'];
  if(code>=95)return ['⛈','Гроза'];
  if(code>=71&&code<=77||code===85||code===86)return ['❄','Снег'];
  if(code>=51&&code<=82)return ['🌧','Осадки'];
  return ['◌','Нет данных'];
}
const FIELDS=[
  ['start_watts','Порог солнца','Вт',300,1500,50,'SBU разрешён при этой средней мощности либо при достаточном покрытии фоновой нагрузки.'],
  ['coverage_target','Покрытие фона','%',70,100,5,'Доля фоновой нагрузки 400–700 Вт, которую должно покрывать солнце. Обычно 85%.'],
  ['entry_reserve','Заряд для входа в SBU','%',30,80,5,'Минимальный остаток по энергии для входа в SBU. При 25% автоматика возвращает SUB.'],
  ['losses','Потери для прогноза','%',5,50,1,'Поправка на нагрев, загрязнение, проводку и преобразование. Влияет на прогноз, не меняет инвертор.'],
];

class EnergetikaAutomationPanel extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._tab='control';this._history=[];}
  connectedCallback(){if(!this.shadowRoot.firstChild)this._render();}
  disconnectedCallback(){clearInterval(this._timer);}
  set hass(value){this._hass=value;if(!this.shadowRoot.firstChild)this._render();this._sync();}
  _state(id){return this._hass?.states[id]?.state;}
  _attrs(id){return this._hass?.states[id]?.attributes||{};}
  _render(){
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;margin-top:10px;color:#dbe9f5;font-family:inherit}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible{outline:2px solid #5cd9e9;outline-offset:2px}[hidden]{display:none!important}
      .launcher{width:100%;display:flex;align-items:center;gap:11px;padding:12px 14px;border:1px solid #275467;border-radius:13px;background:linear-gradient(110deg,#0d2a32,#112236);color:#d7f3ed;text-align:left}.launcher svg{width:24px;height:24px;color:#3fe0b6;flex-shrink:0}.launcher strong{display:block;font-size:13px}.launcher small{display:block;color:#87a9b9;font-size:10px;margin-top:3px}.badge{margin-left:auto;font-size:10px;color:#67dec0;white-space:nowrap}.chevron{color:#77a4b8;font-size:22px}
      dialog{width:min(760px,calc(100vw - 24px));max-width:none;max-height:92dvh;padding:0;border:1px solid #35576e;border-radius:24px;color:#dbe9f5;background:radial-gradient(ellipse at top right,#182e45,#081722 70%);box-shadow:0 24px 80px #0009}dialog::backdrop{background:#030a12c9;backdrop-filter:blur(7px)}.head{padding:22px 22px 15px}.eyebrow{font-size:9px;letter-spacing:2px;color:#789bae;margin-bottom:7px}h2{font-size:23px;margin:0}.head-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.close{border:1px solid #335164;border-radius:12px;width:38px;height:38px;background:#102b3d;color:#9fc2ce;font-size:26px}.tabs{display:flex;gap:6px;margin-top:18px}.tabs button{padding:9px 13px;border:1px solid #304c60;border-radius:10px;background:#0b1c2b;color:#8eafc0;font-size:12px}.tabs button[aria-selected=true]{color:#8af1d7;background:#13433e;border-color:#299b8f}.body{padding:0 22px 22px;overflow:auto;max-height:calc(92dvh - 160px);overscroll-behavior:contain;scrollbar-width:thin}.weather{display:flex;gap:13px;align-items:center;padding:15px;border:1px solid #2c4e63;border-radius:15px;background:#0b1e2d;margin-bottom:12px}.weather-icon{font-size:35px;color:#ffd365}.weather h3{margin:0 0 5px;font-size:17px}.weather p{margin:0;font-size:11px;color:#8cafc0;line-height:1.6}.temperature{margin-left:auto;font-size:27px;white-space:nowrap}.temperature small{font-size:12px;color:#86a6ba}
      .box{padding:16px;border:1px solid #2b495d;border-radius:15px;background:#0b1c2acc;margin-bottom:12px}.box h3{font-size:14px;margin:0 0 10px}.switch-row{display:flex;align-items:center;gap:10px;justify-content:space-between}.switch-row p{font-size:11px;line-height:1.55;color:#8cadbd;margin:5px 0 0}.toggle{flex-shrink:0;border-radius:20px;border:1px solid #355567;background:#192b3a;color:#9db7c5;padding:8px 13px;font-size:12px}.toggle[aria-pressed=true]{background:#155346;color:#95f5d7;border-color:#26b297}.state-line{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:15px;font-size:12px;color:#88aabd}.state-line b{color:#e7f6ff;font-size:19px}.reason{color:#a4bdcb;font-size:12px;line-height:1.6;margin:10px 0 0}.status{color:#69dfbd;font-size:11px;line-height:1.6;min-height:16px;margin-top:9px}.status.error{color:#ffa19a}.actions{display:flex;gap:7px;margin-top:12px}.action{padding:9px 12px;border:1px solid #2f6c7d;border-radius:9px;background:#113b47;color:#a6e8e8;font-size:11px}.action.secondary{background:#102633;border-color:#345468;color:#94b3c4}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-bottom:12px}.metric{padding:12px 8px;border:1px solid #2c485b;border-radius:12px;background:#0c1d2b}.metric span{display:block;color:#7fa0b3;font-size:10px;margin-bottom:5px}.metric strong{font-size:20px;color:#d9f5f6}.metric small{font-size:10px;color:#8eacbb}.sun strong{color:#ffd869}.battery strong{color:#38e3b9}.footnote{font-size:10px;line-height:1.7;color:#799dad;margin:10px 0}.footnote a{color:#88c7df}.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field label{display:block;font-size:11px;color:#a9c2d0;margin-bottom:7px}.input-row{display:flex;align-items:center;gap:7px}.input-row input{width:100%;min-width:0;padding:9px 10px;border:1px solid #335468;border-radius:9px;background:#071a28;color:#d8edf6;font-size:14px}.input-row span{font-size:11px;color:#82a6b8}.hint{font-size:10px;color:#7899aa;line-height:1.6;margin:5px 0 0}.early{margin-top:15px;border-top:1px solid #213e50;padding-top:13px}.details{font-size:12px;line-height:1.7;color:#91b2c2}.details summary{cursor:pointer;color:#b1d4df}.details p{font-size:11px}.result{font-size:11px;color:#83abbb;line-height:1.6;margin:0}.chart-row{display:grid;grid-template-columns:90px 1fr 83px;gap:12px;align-items:center;margin:13px 0}.chart-row .date{font-size:11px;color:#a0bdce}.track{height:17px;background:#122a3b;border-radius:5px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,#bc811c,#ffda61);border-radius:5px;min-width:0}.actual .fill{background:linear-gradient(90deg,#157b6c,#45e9bf)}.amount{text-align:right;color:#ffe599;font-size:13px;white-space:nowrap}.actual .amount{color:#7ce7c9}.forecast-note{font-size:10px;color:#789cad;margin-top:4px}.day-card{padding:12px 14px;border:1px solid #294a5e;border-radius:12px;margin:8px 0;background:#0a1d2b}.day-card .chart-row{margin:7px 0 0}.day-weather{font-size:10px;color:#8baabb;display:flex;justify-content:space-between;gap:8px}.section-heading{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:14px 0}.section-heading h3{margin:0;font-size:14px}.live-actual{font-size:30px;color:#ffe27a;margin:7px 0}.live-actual small{font-size:13px;color:#91aab7}.message{font-size:11px;color:#e5c784;line-height:1.7}.notification{color:#8fdbc9;margin:8px 0 0;font-size:11px;line-height:1.6;min-height:16px}
      @media(max-width:520px){:host{margin-top:8px}.launcher{padding:9px 10px;gap:8px}.launcher strong{font-size:11px}.launcher small{font-size:9px}.badge{font-size:9px}.launcher svg{width:20px;height:20px}dialog{border-radius:19px;width:calc(100vw - 16px);max-height:94dvh}.head{padding:17px 15px 12px}h2{font-size:21px}.body{padding:0 13px 16px;max-height:calc(94dvh - 150px)}.tabs button{font-size:11px;padding:8px 11px}.weather{padding:12px;gap:10px}.weather-icon{font-size:29px}.weather h3{font-size:15px}.weather p{font-size:10px}.temperature{font-size:24px}.box{padding:13px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{padding:10px}.fields{gap:12px 10px}.chart-row{grid-template-columns:74px 1fr 75px;gap:8px}.amount{font-size:12px}.chart-row .date{font-size:10px}.day-card{padding:10px}.eyebrow{font-size:8px}}
    </style>
    <button class="launcher" aria-haspopup="dialog" data-open><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 10-13h-8Z"/></svg><span><strong>Автоматизации</strong><small data-brief>Одесса · погода и солнечная выработка</small></span><span class="badge" data-badge>Вручную</span><span class="chevron">›</span></button>
    <dialog aria-labelledby="auto-title"><div class="head"><div class="eyebrow">ЭНЕРГЕТИКА / УМНОЕ ПИТАНИЕ</div><div class="head-row"><h2 id="auto-title">Автоматизации</h2><button class="close" aria-label="Закрыть автоматизации">×</button></div><div class="tabs" role="tablist" aria-label="Разделы автоматизации"><button role="tab" data-tab="control" aria-controls="auto-control" id="tab-control" aria-selected="true">Управление</button><button role="tab" data-tab="forecast" aria-controls="auto-forecast" id="tab-forecast" aria-selected="false">Прогноз</button><button role="tab" data-tab="history" aria-controls="auto-history" id="tab-history" aria-selected="false">Выработка</button></div></div>
    <div class="body"><div class="weather"><span class="weather-icon" data-weather-icon>◌</span><div><h3>Одесса</h3><p data-weather-text>Ожидание погоды</p><p data-weather-meta></p></div><div class="temperature"><span data-temperature>—</span><small> °C</small></div></div>
    <section id="auto-control" role="tabpanel" aria-labelledby="tab-control" data-section="control">
      <div class="box"><div class="switch-row"><div><h3>Солнечный SBU / SUB</h3><p>Работает в Home Assistant, даже когда панель закрыта.</p></div><button class="toggle" data-enable aria-pressed="false">Выключено</button></div><div class="state-line"><span>Инвертор: <b data-mode>—</b></span><span>Решение: <b data-target>—</b></span></div><p class="reason" data-reason></p><div class="status" data-status role="status"></div><div class="actions"><button class="action secondary" data-pause>Пауза на час</button><button class="action" data-resume>Возобновить</button></div></div>
      <div class="metrics"><div class="metric sun"><span>Солнце · среднее 5 мин</span><strong data-pv>—</strong><small> Вт</small></div><div class="metric"><span>Фоновая нагрузка</span><strong data-baseline>—</strong><small> Вт</small></div><div class="metric sun"><span>Солнце покрывает фон</span><strong data-coverage>—</strong><small> %</small></div><div class="metric battery"><span>Остаток АКБ по энергии</span><strong data-energy>—</strong><small> %</small></div></div>
      <div class="box"><h3>Условия переключения</h3><div class="fields">${FIELDS.map(([key,label,unit,min,max,step,hint])=>`<div class="field"><label for="field-${key}">${esc(label)}</label><div class="input-row"><input id="field-${key}" data-field="${key}" type="number" min="${min}" max="${max}" step="${step}" inputmode="decimal"><span>${unit}</span></div><p class="hint">${esc(hint)}</p></div>`).join('')}</div><div class="switch-row early"><div><h3>Ранний старт в ясный день</h3><p>От 120 Вт, АКБ ≥50% и прогноз на ближайшие 2 часа покрывает фон.</p></div><button class="toggle" data-early aria-pressed="false">Выкл.</button></div><div class="actions"><button class="action" data-save>Сохранить условия</button></div><p class="notification" data-feedback role="status"></p></div>
      <div class="box details"><details><summary>Как выбирается режим</summary><p><b>SBU:</b> ясно или переменная облачность, солнце достигло порога либо покрыло нужную долю фона. Условие держится 5 минут. АКБ сглаживает короткие пики дома.</p><p><b>SUB:</b> ночь, резерв АКБ 25% или напряжение приблизилось к нижнему порогу. Пасмурная погода, слабое солнце или потеря данных возвращают SUB после 10 минут. Между обычными переключениями — минимум 10 минут.</p><p>Фон — нижняя четверть показаний дома за 30 минут, ограниченная диапазоном 400–700 Вт. Короткий пик чайника не становится новым фоном. Погода — модель для Одессы, обновление раз в 15 минут. SBU не включается по устаревшей погоде.</p><p>Ручной выбор режима в этой панели ставит автоматику на паузу на час. Внешние изменения с LCD или из других карточек не распознаются как пауза: сначала выключите автоматику здесь. При неподтверждённой команде автоматические записи останавливаются до «Возобновить».</p><p>При отключённой автоматике текущий режим сохраняется. Автоматика меняет только SBU/SUB. Напряжения, токи заряда и частота не меняются.</p></details></div><p class="result" data-result></p>
    </section>
    <section id="auto-forecast" role="tabpanel" aria-labelledby="tab-forecast" data-section="forecast" hidden><div class="box"><h3>Солнечная установка</h3><p class="reason">4 × 630 Вт · <b>2,52 кВт</b> · горизонтально, 0°</p><p class="footnote">При горизонтальном положении направление «юг» не меняет наклон поверхности.</p><div class="state-line"><span>Сегодня по прогнозу</span><b><span data-today-forecast>—</span> кВт·ч</b></div><div class="state-line"><span>Ближайшие 2 часа · среднее</span><b><span data-next-hours>—</span> Вт</b></div></div><div data-forecast-days></div><p class="footnote">Оценка: солнечное излучение × 2,52 кВт × поправка на потери. Тени, снег и реальные условия панелей могут заметно изменить результат. <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Погода Open-Meteo</a> · CC BY 4.0.</p></section>
    <section id="auto-history" role="tabpanel" aria-labelledby="tab-history" data-section="history" hidden><div class="box"><h3>Солнце · сегодня</h3><div class="live-actual"><span data-today-actual>—</span> <small>кВт·ч</small></div><p class="footnote">Только выработка панелей. Энергия от сети сюда не входит.</p></div><div class="section-heading"><h3>Предыдущие 7 дней</h3><button class="action secondary" data-refresh aria-label="Обновить солнечную историю">↻ Обновить</button></div><div data-history-days></div><p class="message" data-history-message></p><p class="footnote">Данные солнечного счётчика EyeBond Local, рассчитанного по мощности PV. Дни с перерывами связи могут быть неполными. Для дня без записей показан прочерк.</p></section>
    </div></dialog>`;
    const r=this.shadowRoot,dialog=r.querySelector('dialog');
    r.querySelector('[data-open]').onclick=()=>{dialog.showModal();this._sync();this._timer=setInterval(()=>this._sync(),30000);};
    r.querySelector('.close').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{clearInterval(this._timer);r.querySelector('[data-open]').focus();});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
    r.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>this._selectTab(b.dataset.tab));
    r.querySelector('[data-enable]').onclick=()=>this._toggle(AUTO);
    r.querySelector('[data-early]').onclick=()=>this._toggle('input_boolean.energetika_solar_early_start');
    r.querySelector('[data-pause]').onclick=()=>this._command('script','energetika_solar_pause',{},'Автоматика на паузе на час.');
    r.querySelector('[data-resume]').onclick=()=>this._command('script','energetika_solar_resume',{},'Автоматика возобновлена, если включена.');
    r.querySelector('[data-save]').onclick=()=>this._save();
    r.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('input',()=>input.dataset.dirty='true'));
    r.querySelector('[data-refresh]').onclick=()=>this._loadHistory();
  }
  _selectTab(tab){this._tab=tab;const r=this.shadowRoot;r.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));r.querySelectorAll('[data-section]').forEach(s=>s.hidden=s.dataset.section!==tab);if(tab==='history'&&(!this._fetched||Date.now()-this._fetched>300000))this._loadHistory();this._sync();}
  _sync(){
    if(!this._hass||!this.shadowRoot.firstChild)return;
    const r=this.shadowRoot,set=(sel,value)=>{r.querySelector(sel).textContent=value;},on=id=>this._state(id)==='on';
    const c=this._attrs(WEATHER).current||{},fresh=on('binary_sensor.energetika_weather_fresh'),night=this._state('sun.sun')==='below_horizon';
    const [symbol,description]=weather(num(c.weather_code),night),enabled=on(AUTO),fault=on('input_boolean.energetika_solar_fault');
    const until=this._attrs('input_datetime.energetika_solar_pause_until').timestamp||0,paused=until>Date.now()/1000;
    set('[data-weather-icon]',symbol);set('[data-weather-text]',fresh?description:'Погода недоступна или устарела');
    set('[data-temperature]',fmt(c.temperature_2m,1));
    set('[data-weather-meta]',`Облачность ${fmt(c.cloud_cover)}% · ветер ${fmt(c.wind_speed_10m,1)} км/ч${c.time?' · '+new Date(c.time*1000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):''}`);
    set('[data-brief]',`Одесса · ${fresh?description.toLowerCase():'ожидание погоды'} · PV ${fmt(this._state(P+'pv_power'))} Вт`);
    set('[data-badge]',!enabled?'Вручную':fault?'Ошибка':paused?'Пауза':'Авто');
    set('[data-mode]',/\((\w+)\)$/.exec(this._state(MODE)||'')?.[1]||'—');
    set('[data-target]',this._state('sensor.energetika_solar_strategy')==='HOLD'?'Ожидание':this._state('sensor.energetika_solar_strategy')||'—');
    set('[data-reason]',this._attrs('sensor.energetika_solar_strategy').reason||'Ожидание серверных датчиков.');
    const status=r.querySelector('[data-status]');status.classList.toggle('error',fault);
    const configured=on('input_boolean.energetika_solar_configured'),fullControl=this._state(P+'control_mode')==='full';
    status.textContent=!configured?'Серверная автоматика ещё не настроена.':!enabled?'Автоматика выключена.':fault?'Переключение не подтверждено. Проверьте текущий режим и возобновите автоматику.':paused?'Пауза до '+new Date(until*1000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'.':!fullControl?'Для управления нужен «Полный контроль» EyeBond Local.':'Автоматическое управление включено.';
    for(const [sel,id] of [['[data-enable]',AUTO],['[data-early]','input_boolean.energetika_solar_early_start']]){
      const b=r.querySelector(sel),active=on(id);b.setAttribute('aria-pressed',String(active));b.textContent=active?'Включено':'Выключено';b.disabled=this._busy||!configured||this._hass.connected===false||!this._hass.states[id];
    }
    for(const [sel,id] of [['[data-pv]','sensor.energetika_pv_average'],['[data-baseline]','sensor.energetika_home_baseline'],['[data-coverage]','sensor.energetika_solar_coverage'],['[data-energy]','sensor.energetika_battery_percent_energy'],['[data-today-forecast]','sensor.energetika_solar_forecast'],['[data-next-hours]','sensor.energetika_solar_next_hours'],['[data-today-actual]',PV_DAY]])set(sel,fmt(this._state(id),sel.includes('today')?2:0));
    for(const [key] of FIELDS){const input=r.querySelector(`[data-field="${key}"]`);if(!input.dataset.dirty&&r.activeElement!==input)input.value=num(this._state('input_number.energetika_solar_'+key))??'';input.disabled=!!this._busy||!configured;}
    r.querySelectorAll('[data-pause],[data-resume],[data-save]').forEach(b=>b.disabled=!!this._busy||!configured||this._hass.connected===false);
    set('[data-result]',['unknown','unavailable',undefined].includes(this._state('input_text.energetika_solar_result'))?'':this._state('input_text.energetika_solar_result'));
    const days=this._attrs('sensor.energetika_solar_forecast').days;
    const signature=JSON.stringify(days);
    if(signature!==this._forecastSignature){this._forecastSignature=signature;const valid=Array.isArray(days)?days:[],max=Math.max(1,...valid.map(d=>num(d.kwh)||0));
      r.querySelector('[data-forecast-days]').innerHTML=valid.length?valid.map(d=>{const [ic,text]=weather(num(d.code));return `<div class="day-card"><div class="day-weather"><span>${esc(ic)} ${esc(text)}</span><span>${fmt(d.min)}…${fmt(d.max)} °C</span></div><div class="chart-row"><span class="date">${esc(dayLabel(d.date))}</span><div class="track"><div class="fill" style="width:${Math.max(0,Math.min(100,(num(d.kwh)||0)/max*100))}%"></div></div><span class="amount">${fmt(d.kwh,2)} кВт·ч</span></div></div>`;}).join(''):'<p class="message">Прогноз появится после получения погоды.</p>';
    }
  }
  async _command(domain,service,data,message){if(this._busy||!this._hass||this._hass.connected===false)return;this._busy=true;this._sync();const f=this.shadowRoot.querySelector('[data-feedback]');f.textContent='Сохранение…';try{await this._hass.callService(domain,service,data);f.textContent=message;}catch(error){f.textContent='Не удалось выполнить действие. '+String(error?.message||'Проверьте соединение.');}finally{this._busy=false;this._sync();}}
  async _toggle(id){return this._command('input_boolean',this._state(id)==='on'?'turn_off':'turn_on',{entity_id:id},'Настройка сохранена.');}
  async _save(){
    if(this._busy)return;const values=[];
    for(const [key,, ,min,max,step] of FIELDS){const input=this.shadowRoot.querySelector(`[data-field="${key}"]`),v=num(input.value);if(v===null||v<min||v>max||Math.abs((v-min)/step-Math.round((v-min)/step))>1e-6){input.reportValidity();this.shadowRoot.querySelector('[data-feedback]').textContent='Проверьте диапазон и шаг значений.';return;}values.push([key,v]);}
    this._busy=true;this._sync();const f=this.shadowRoot.querySelector('[data-feedback]');
    try{for(const [key,value] of values){await this._hass.callService('input_number','set_value',{entity_id:'input_number.energetika_solar_'+key,value});delete this.shadowRoot.querySelector(`[data-field="${key}"]`).dataset.dirty;}f.textContent='Условия сохранены. Применяются к следующим решениям автоматики.';}catch(error){f.textContent='Не все условия сохранены. '+String(error?.message||'Проверьте соединение.');}finally{this._busy=false;this._sync();}
  }
  async _loadHistory(){
    if(this._loadingHistory||!this._hass)return;this._loadingHistory=true;
    const r=this.shadowRoot,message=r.querySelector('[data-history-message]');message.textContent='Загрузка солнечной истории…';
    try{
      // Server statistics use HA's local day boundaries and survive recorder purges.
      const start=new Date(Date.now()-9*86400000).toISOString();
      const response=await this._hass.callWS({type:'recorder/statistics_during_period',start_time:start,end_time:new Date().toISOString(),statistic_ids:[PV_DAY],period:'day',types:['change'],units:{energy:'kWh'}});
      const byDay=new Map((response[PV_DAY]||[]).filter(row=>Number.isFinite(row.change)&&row.change>=0).map(row=>[dayKey(row.start),row.change]));
      const today=dayKey(Date.now()),keys=[];for(let n=7;n>=1;n--)keys.push(dayKey(new Date(today+'T12:00:00Z').getTime()-n*86400000));
      const max=Math.max(1,...keys.map(k=>byDay.get(k)||0));
      r.querySelector('[data-history-days]').innerHTML=keys.map(key=>`<div class="chart-row actual"><span class="date">${esc(dayLabel(key))}</span><div class="track"><div class="fill" style="width:${Math.min(100,(byDay.get(key)||0)/max*100)}%"></div></div><span class="amount">${byDay.has(key)?fmt(byDay.get(key),2)+' кВт·ч':'—'}</span></div>`).join('');
      message.textContent=keys.some(k=>!byDay.has(k))?'Для части дней ещё нет записей солнечного счётчика.':'';this._fetched=Date.now();
    }catch(error){message.textContent='Не удалось загрузить солнечную историю. Нажмите «Обновить».';}finally{this._loadingHistory=false;}
  }
}
if(!customElements.get('energetika-automation-panel'))customElements.define('energetika-automation-panel',EnergetikaAutomationPanel);
