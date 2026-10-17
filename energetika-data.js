import './energetika-dtek.js?v=2.13.0.1';
import './energetika-hourly.js?v=2.13.0';
/* Data views read HA sensors; they do not switch inverter modes. */
const P='sensor.anenji_4200_protocol_1_';
const WEATHER='sensor.energetika_solar_weather';
const PV_DAY=P+'estimated_pv_energy_today';
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

class EnergetikaDataPanel extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._tab='forecast';}
  connectedCallback(){if(!this.shadowRoot.firstChild)this._render();}
  disconnectedCallback(){clearInterval(this._timer);}
  set hass(value){this._hass=value;if(!this.shadowRoot.firstChild)this._render();this._sync();}
  _state(id){return this._hass?.states[id]?.state;}
  _attrs(id){return this._hass?.states[id]?.attributes||{};}
  open(tab=this._tab){if(!this.shadowRoot.firstChild)this._render();const dialog=this.shadowRoot.querySelector('dialog');if(!dialog.open)dialog.showModal();this._selectTab(tab);clearInterval(this._timer);this._timer=setInterval(()=>this._sync(),30000);}
  _render(){this.shadowRoot.innerHTML=`<style>
      :host{display:block;margin-top:10px;color:#dbe9f5;font-family:inherit}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible{outline:2px solid #5cd9e9;outline-offset:2px}[hidden]{display:none!important}
      .launcher{width:100%;display:flex;align-items:center;gap:11px;padding:12px 14px;border:1px solid #275467;border-radius:13px;background:linear-gradient(110deg,#0d2a32,#112236);color:#d7f3ed;text-align:left}.launcher svg{width:24px;height:24px;color:#3fe0b6;flex-shrink:0}.launcher strong{display:block;font-size:13px}.launcher small{display:block;color:#87a9b9;font-size:10px;margin-top:3px}.badge{margin-left:auto;font-size:10px;color:#67dec0;white-space:nowrap}.chevron{color:#77a4b8;font-size:22px}
      dialog{width:min(760px,calc(100vw - 24px));max-width:none;max-height:92dvh;padding:0;border:1px solid #35576e;border-radius:24px;color:#dbe9f5;background:radial-gradient(ellipse at top right,#182e45,#081722 70%);box-shadow:0 24px 80px #0009}dialog::backdrop{background:#030a12c9;backdrop-filter:blur(7px)}.head{padding:22px 22px 15px}.eyebrow{font-size:9px;letter-spacing:2px;color:#789bae;margin-bottom:7px}h2{font-size:23px;margin:0}.head-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.close{border:1px solid #335164;border-radius:12px;width:38px;height:38px;background:#102b3d;color:#9fc2ce;font-size:26px}.tabs{display:flex;gap:6px;margin-top:18px}.tabs button{padding:9px 13px;border:1px solid #304c60;border-radius:10px;background:#0b1c2b;color:#8eafc0;font-size:12px}.tabs button[aria-selected=true]{color:#8af1d7;background:#13433e;border-color:#299b8f}.body{padding:0 22px 22px;overflow:auto;max-height:calc(92dvh - 160px);overscroll-behavior:contain;scrollbar-width:thin}.weather{display:flex;gap:13px;align-items:center;padding:15px;border:1px solid #2c4e63;border-radius:15px;background:#0b1e2d;margin-bottom:12px}.weather-icon{font-size:35px;color:#ffd365}.weather h3{margin:0 0 5px;font-size:17px}.weather p{margin:0;font-size:11px;color:#8cafc0;line-height:1.6}.temperature{margin-left:auto;font-size:27px;white-space:nowrap}.temperature small{font-size:12px;color:#86a6ba}
      .box{padding:16px;border:1px solid #2b495d;border-radius:15px;background:#0b1c2acc;margin-bottom:12px}.box h3{font-size:14px;margin:0 0 10px}.switch-row{display:flex;align-items:center;gap:10px;justify-content:space-between}.switch-row p{font-size:11px;line-height:1.55;color:#8cadbd;margin:5px 0 0}.toggle{flex-shrink:0;border-radius:20px;border:1px solid #355567;background:#192b3a;color:#9db7c5;padding:8px 13px;font-size:12px}.toggle[aria-pressed=true]{background:#155346;color:#95f5d7;border-color:#26b297}.state-line{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:15px;font-size:12px;color:#88aabd}.state-line b{color:#e7f6ff;font-size:19px}.reason{color:#a4bdcb;font-size:12px;line-height:1.6;margin:10px 0 0}.status{color:#69dfbd;font-size:11px;line-height:1.6;min-height:16px;margin-top:9px}.status.error{color:#ffa19a}.actions{display:flex;gap:7px;margin-top:12px}.action{padding:9px 12px;border:1px solid #2f6c7d;border-radius:9px;background:#113b47;color:#a6e8e8;font-size:11px}.action.secondary{background:#102633;border-color:#345468;color:#94b3c4}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-bottom:12px}.metric{padding:12px 8px;border:1px solid #2c485b;border-radius:12px;background:#0c1d2b}.metric span{display:block;color:#7fa0b3;font-size:10px;margin-bottom:5px}.metric strong{font-size:20px;color:#d9f5f6}.metric small{font-size:10px;color:#8eacbb}.sun strong{color:#ffd869}.battery strong{color:#38e3b9}.footnote{font-size:10px;line-height:1.7;color:#799dad;margin:10px 0}.footnote a{color:#88c7df}.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field label{display:block;font-size:11px;color:#a9c2d0;margin-bottom:7px}.input-row{display:flex;align-items:center;gap:7px}.input-row input{width:100%;min-width:0;padding:9px 10px;border:1px solid #335468;border-radius:9px;background:#071a28;color:#d8edf6;font-size:14px}.input-row span{font-size:11px;color:#82a6b8}.hint{font-size:10px;color:#7899aa;line-height:1.6;margin:5px 0 0}.early{margin-top:15px;border-top:1px solid #213e50;padding-top:13px}.details{font-size:12px;line-height:1.7;color:#91b2c2}.details summary{cursor:pointer;color:#b1d4df}.details p{font-size:11px}.result{font-size:11px;color:#83abbb;line-height:1.6;margin:0}.chart-row{display:grid;grid-template-columns:90px 1fr 83px;gap:12px;align-items:center;margin:13px 0}.chart-row .date{font-size:11px;color:#a0bdce}.track{height:17px;background:#122a3b;border-radius:5px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,#bc811c,#ffda61);border-radius:5px;min-width:0}.actual .fill{background:linear-gradient(90deg,#157b6c,#45e9bf)}.amount{text-align:right;color:#ffe599;font-size:13px;white-space:nowrap}.actual .amount{color:#7ce7c9}.forecast-note{font-size:10px;color:#789cad;margin-top:4px}.day-card{padding:12px 14px;border:1px solid #294a5e;border-radius:12px;margin:8px 0;background:#0a1d2b}.day-card .chart-row{margin:7px 0 0}.day-weather{font-size:10px;color:#8baabb;display:flex;justify-content:space-between;gap:8px}.section-heading{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:14px 0}.section-heading h3{margin:0;font-size:14px}.live-actual{font-size:30px;color:#ffe27a;margin:7px 0}.live-actual small{font-size:13px;color:#91aab7}.message{font-size:11px;color:#e5c784;line-height:1.7}.notification{color:#8fdbc9;margin:8px 0 0;font-size:11px;line-height:1.6;min-height:16px}
      @media(max-width:520px){:host{margin-top:8px}.launcher{padding:9px 10px;gap:8px}.launcher strong{font-size:11px}.launcher small{font-size:9px}.badge{font-size:9px}.launcher svg{width:20px;height:20px}dialog{border-radius:19px;width:calc(100vw - 16px);max-height:94dvh}.head{padding:17px 15px 12px}h2{font-size:21px}.body{padding:0 13px 16px;max-height:calc(94dvh - 150px)}.tabs button{font-size:11px;padding:8px 11px}.weather{padding:12px;gap:10px}.weather-icon{font-size:29px}.weather h3{font-size:15px}.weather p{font-size:10px}.temperature{font-size:24px}.box{padding:13px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{padding:10px}.fields{gap:12px 10px}.chart-row{grid-template-columns:74px 1fr 75px;gap:8px}.amount{font-size:12px}.chart-row .date{font-size:10px}.day-card{padding:10px}.eyebrow{font-size:8px}}
      .phone-row{display:flex;align-items:center;gap:7px;margin:10px 0}.phone-row select{flex:1;min-width:0;padding:9px;border:1px solid #335468;border-radius:9px;background:#071a28;color:#d8edf6;font-size:12px}.notify-option{border-top:1px solid #233f50;padding-top:11px;margin-top:10px}.notify-option h3{margin-bottom:3px}.notification-info{font-size:10px;color:#7fabbc;line-height:1.6}
      .weather-refresh{display:block;margin:5px 0 0 auto;background:#123443;border:1px solid #315e71;border-radius:8px;color:#8ed8e6;padding:3px 8px;font-size:16px}
    
      .tabs{overflow-x:auto}.tabs button{white-space:nowrap}.input-row .action{flex-shrink:0}.status:empty{display:none}.launcher svg{color:#ffd65a}
    </style><button class="launcher" aria-haspopup="dialog" data-open><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 19V5m0 14h16M7 14l4-5 4 3 5-7"/></svg><span><strong>Данные и прогнозы</strong><small data-brief>Погода · солнце · ДТЭК</small></span><span class="chevron" style="margin-left:auto">›</span></button>
    <dialog aria-labelledby="data-title"><div class="head"><div class="eyebrow">ЭНЕРГЕТИКА / ДАННЫЕ</div><div class="head-row"><h2 id="data-title">Данные и прогнозы</h2><button class="close" aria-label="Закрыть данные и прогнозы">×</button></div><div class="tabs" role="tablist" aria-label="Разделы данных"><button role="tab" data-tab="forecast" aria-controls="data-forecast" id="data-tab-forecast" aria-selected="true">Погода и прогноз</button><button role="tab" data-tab="dtek" aria-controls="data-dtek" id="data-tab-dtek" aria-selected="false">ДТЭК</button><button role="tab" data-tab="history" aria-controls="data-history" id="data-tab-history" aria-selected="false">Выработка</button></div></div>
    <div class="body"><div class="weather"><span class="weather-icon" data-weather-icon>◌</span><div><h3>Одесса</h3><p data-weather-text>Ожидание погоды</p><p data-weather-meta></p></div><div class="temperature"><span data-temperature>—</span><small> °C</small><button class="weather-refresh" data-weather-refresh aria-label="Обновить погоду" title="Получить погоду сейчас">↻</button></div></div>
    <section id="data-forecast" role="tabpanel" aria-labelledby="data-tab-forecast" data-section="forecast" hidden><energetika-hourly-charts></energetika-hourly-charts><div class="box"><h3>Солнечная установка</h3><p class="reason">4 × 630 Вт · <b>2,52 кВт</b> · горизонтально, 0°</p><p class="footnote">При горизонтальном положении направление «юг» не меняет наклон поверхности.</p><div class="state-line"><span>Сегодня по прогнозу</span><b><span data-today-forecast>—</span> кВт·ч</b></div><div class="state-line"><span>Ближайшие 2 часа · среднее</span><b><span data-next-hours>—</span> Вт</b></div></div><div class="box"><h3>Поправка на потери</h3><p class="hint">Нагрев, загрязнение, проводка и преобразование. Меняет только расчёт прогноза.</p><div class="input-row"><input data-losses type="number" min="5" max="50" step="1" inputmode="decimal" aria-label="Потери для прогноза"><span>%</span><button class="action" data-save-losses>Сохранить</button></div><p class="status" data-losses-status role="status"></p></div><div data-forecast-days></div><p class="footnote">Оценка: солнечное излучение × 2,52 кВт × поправка на потери. Тени, снег и реальные условия панелей могут заметно изменить результат. <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Погода Open-Meteo</a> · CC BY 4.0.</p></section>
    <section id="data-history" role="tabpanel" aria-labelledby="data-tab-history" data-section="history" hidden><div class="box"><h3>Солнце · сегодня</h3><div class="live-actual"><span data-today-actual>—</span> <small>кВт·ч</small></div><p class="footnote">Только выработка панелей. Энергия от сети сюда не входит.</p></div><div class="section-heading"><h3>Предыдущие 7 дней</h3><button class="action secondary" data-refresh aria-label="Обновить солнечную историю">↻ Обновить</button></div><div data-history-days></div><p class="message" data-history-message></p><p class="footnote">Данные солнечного счётчика EyeBond Local, рассчитанного по мощности PV. Дни с перерывами связи могут быть неполными. Для дня без записей показан прочерк.</p></section>
    <section id="data-dtek" role="tabpanel" aria-labelledby="data-tab-dtek" data-section="dtek" hidden><energetika-dtek-panel></energetika-dtek-panel></section>
    </div></dialog>`;
    const r=this.shadowRoot,dialog=r.querySelector('dialog');
    r.querySelector('[data-open]').onclick=()=>this.open();
    r.querySelector('.close').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{r.querySelector('energetika-hourly-charts').active=false;r.querySelector('energetika-dtek-panel').active=false;clearInterval(this._timer);r.querySelector('[data-open]').focus();});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
    r.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>this._selectTab(b.dataset.tab));
    r.querySelector('[data-weather-refresh]').onclick=async()=>{const b=r.querySelector('[data-weather-refresh]');b.disabled=true;try{await this._hass.callService('homeassistant','update_entity',{entity_id:WEATHER});b.title='Погода запрошена';}catch{b.title='Не удалось обновить погоду';}finally{b.disabled=false;}};
    r.querySelector('[data-refresh]').onclick=()=>this._loadHistory();
    r.querySelector('[data-losses]').oninput=e=>e.target.dataset.dirty='true';
    r.querySelector('[data-save-losses]').onclick=()=>this._saveLosses();
  }
  _selectTab(tab){this._tab=['forecast','dtek','history'].includes(tab)?tab:'forecast';const r=this.shadowRoot;r.querySelector('.body').scrollTop=0;r.querySelector('.weather').hidden=this._tab!=='forecast';r.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===this._tab)));r.querySelectorAll('[data-section]').forEach(s=>s.hidden=s.dataset.section!==this._tab);if(this._tab==='history'&&(!this._fetched||Date.now()-this._fetched>300000))this._loadHistory();this._sync();}
  _sync(){
    if(!this._hass||!this.shadowRoot.firstChild)return;
    const r=this.shadowRoot,opened=r.querySelector('dialog').open;
    const hourly=r.querySelector('energetika-hourly-charts');hourly.hass=this._hass;hourly.active=this._tab==='forecast'&&opened;
    const dtek=r.querySelector('energetika-dtek-panel');dtek.hass=this._hass;dtek.active=this._tab==='dtek'&&opened;
    const set=(sel,value)=>{r.querySelector(sel).textContent=value;};
    const c=this._attrs(WEATHER).current||{},fresh=this._state('binary_sensor.energetika_weather_fresh')==='on',night=this._state('sun.sun')==='below_horizon';
    const [symbol,description]=weather(num(c.weather_code),night);
    set('[data-weather-icon]',symbol);set('[data-weather-text]',fresh?description:'Погода недоступна или устарела');set('[data-temperature]',fmt(c.temperature_2m,1));
    set('[data-weather-meta]',`Облачность ${fmt(c.cloud_cover)}% · ветер ${fmt(c.wind_speed_10m,1)} км/ч${c.time?' · '+new Date(c.time*1000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):''}`);
    set('[data-brief]',`Одесса · ${fresh?description.toLowerCase():'ожидание погоды'} · ДТЭК`);
    for(const [sel,id] of [['[data-today-forecast]','sensor.energetika_solar_forecast'],['[data-next-hours]','sensor.energetika_solar_next_hours'],['[data-today-actual]',PV_DAY]])set(sel,fmt(this._state(id),sel.includes('today')?2:0));
    const input=r.querySelector('[data-losses]');if(!input.dataset.dirty&&r.activeElement!==input)input.value=num(this._state('input_number.energetika_solar_losses'))??'';
    r.querySelector('[data-save-losses]').disabled=!!this._saving||this._hass.connected===false||!this._hass.states['input_number.energetika_solar_losses'];
    const days=this._attrs('sensor.energetika_solar_forecast').days;
    const signature=JSON.stringify(days);
    if(signature!==this._forecastSignature){this._forecastSignature=signature;const valid=Array.isArray(days)?days:[],max=Math.max(1,...valid.map(d=>num(d.kwh)||0));
      r.querySelector('[data-forecast-days]').innerHTML=valid.length?valid.map(d=>{const [ic,text]=weather(num(d.code));return `<div class="day-card"><div class="day-weather"><span>${esc(ic)} ${esc(text)}</span><span>${fmt(d.min)}…${fmt(d.max)} °C</span></div><div class="chart-row"><span class="date">${esc(dayLabel(d.date))}</span><div class="track"><div class="fill" style="width:${Math.max(0,Math.min(100,(num(d.kwh)||0)/max*100))}%"></div></div><span class="amount">${fmt(d.kwh,2)} кВт·ч</span></div></div>`;}).join(''):'<p class="message">Прогноз появится после получения погоды.</p>';
    }
  }
  async _saveLosses(){
    if(this._saving||!this._hass||this._hass.connected===false)return;
    const input=this.shadowRoot.querySelector('[data-losses]'),status=this.shadowRoot.querySelector('[data-losses-status]'),value=num(input.value);
    if(value===null||value<5||value>50||!Number.isInteger(value)){input.reportValidity();status.textContent='Укажите целое число от 5 до 50%.';return;}
    this._saving=true;this._sync();status.textContent='Сохранение…';
    try{await this._hass.callService('input_number','set_value',{entity_id:'input_number.energetika_solar_losses',value});delete input.dataset.dirty;status.textContent='Поправка сохранена. Прогноз пересчитывается.';}catch{status.textContent='Не удалось сохранить поправку. Проверьте соединение.';}finally{this._saving=false;this._sync();}
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
if(!customElements.get('energetika-data-panel'))customElements.define('energetika-data-panel',EnergetikaDataPanel);
