/* Aligned hourly weather / horizontal PV forecast, with measured hourly PV. */
const WEATHER='sensor.energetika_solar_weather',PV='sensor.anenji_4200_protocol_1_pv_power';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const fmt=(v,d=0)=>number(v)===null?'—':Number(v).toLocaleString('ru-RU',{maximumFractionDigits:d});
const dateKey=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
const clock=t=>new Date(t).toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'});
const condition=(code,day)=>code===null||day===null?'Нет данных':!day?'Ночь':code===0?'Ясно':code===1?'Преимущественно ясно':code===2?'Переменная облачность':code===3?'Пасмурно':[45,48].includes(code)?'Туман':code>=95?'Гроза':[71,73,75,77,85,86].includes(code)?'Снег':code>=51?'Осадки':'Нет данных';

class EnergetikaHourlyCharts extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._actual=[];this._rows=[];this._request=0;this._selected=12;}
  connectedCallback(){this._render();this._resize=new ResizeObserver(()=>this._draw());this._resize.observe(this);this._timer=setInterval(()=>{if(this._active)this._sync();},60000);}
  disconnectedCallback(){clearInterval(this._timer);this._resize?.disconnect();this._request++;}
  set hass(value){this._hass=value;if(this._active)this._sync();}
  set active(value){this._active=!!value;if(value)this._sync();}
  _render(){if(this.shadowRoot.firstChild)return;
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;color:#dbeaf6;font:12px inherit}*{box-sizing:border-box}button,select{font:inherit;color:inherit}button{cursor:pointer}button:focus-visible,select:focus-visible,svg:focus-visible{outline:2px solid #66cfec;outline-offset:2px}.heading{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 10px}h3{font-size:14px;margin:0}.controls{display:flex;gap:5px;flex-wrap:wrap}button,select{padding:7px 9px;background:#0b1d2c;border:1px solid #335368;border-radius:8px;font-size:11px}button.selected{border-color:#268f9e;color:#86e9dd;background:#123c42}select{max-width:165px;color-scheme:dark}.chart{border:1px solid #294b5f;border-radius:14px;background:#091c2b;margin:9px 0;padding:12px 9px 6px;overflow:hidden}.chart h4{margin:0 6px 3px;font-size:12px;color:#b6d1df}.legend{display:flex;flex-wrap:wrap;gap:13px;margin:7px 6px 3px;color:#8caebf;font-size:10px}.legend span:before{content:'';display:inline-block;width:8px;height:8px;margin-right:5px;border-radius:50%;background:var(--tone)}svg{display:block;width:100%;height:160px;touch-action:pan-y;user-select:none}.axis{fill:#799aaf;font-size:10px}.grid{stroke:#284659;stroke-dasharray:3 5;stroke-opacity:.65}.cursor{stroke:#c1d9e3;stroke-dasharray:3 3;opacity:.6}.line{fill:none;stroke-width:2;vector-effect:non-scaling-stroke}.readout{border:1px solid #2b5365;background:#102838;border-radius:12px;padding:11px 13px;margin:10px 0}.time{font-size:12px;color:#d9eef8;margin-bottom:6px}.values{display:flex;gap:6px 15px;flex-wrap:wrap;color:#88afc0;font-size:11px;line-height:1.8}.values b{color:#d9edf4}.values .solar{color:#ffdb6c}.values .actual{color:#43dfb7}.note{font-size:10px;line-height:1.6;color:#7fa1b2;margin:8px 2px}.empty{fill:#809faf;font-size:11px;text-anchor:middle}.status{color:#d6be86}.status:empty{display:none}@media(max-width:520px){svg{height:160px}.controls{gap:4px}button,select{padding:6px 8px;font-size:10px}select{max-width:148px}.chart{padding:10px 5px 5px}.legend{gap:10px;font-size:9px}.values{font-size:10px;gap:4px 11px}}
    </style><div class="heading"><h3>Погода и солнце по часам</h3><div class="controls"><button data-day="today">Сегодня</button><button data-day="tomorrow">Завтра</button><select aria-label="День почасового прогноза"></select></div></div><p class="note status" data-status></p>
    <div class="chart"><h4>Почасовая погода · Одесса</h4><div class="legend"><span style="--tone:#6bd4ff">Температура, °C</span><span style="--tone:#8e9fb6">Облачность, %</span></div><svg data-weather role="img" tabindex="0" aria-label="Температура и облачность по часам. Нажмите на час или используйте стрелки."></svg></div>
    <div class="chart"><h4>Солнечная выработка · средняя мощность за час</h4><div class="legend"><span style="--tone:#ffd65a">Прогноз PV, Вт</span><span style="--tone:#35e3b4">Факт PV, Вт</span></div><svg data-pv role="img" tabindex="0" aria-label="Прогноз и фактическая солнечная мощность по часам. Нажмите на час или используйте стрелки."></svg></div>
    <div class="readout"><div class="time" data-time>Ожидание прогноза</div><div class="values" data-values></div></div><p class="note" data-actual-status></p><p class="note">Нажмите на час: маркер общий для двух графиков. Время — Одесса. Прогноз PV рассчитан для 2,52 кВт горизонтальных панелей с заданными потерями. Погода — на начало часа, выработка — средняя за следующий час. Факт — статистика PV в Home Assistant; текущий час может быть неполным, отсутствие данных показано разрывом.</p>`;
    const r=this.shadowRoot;r.querySelector('select').onchange=e=>this._changeDay(e.target.value);
    r.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>this._changeDay(this._days[b.dataset.day==='today'?0:1]));
    r.querySelectorAll('svg').forEach(svg=>{
      const select=e=>{if(!this._rows?.length)return;const b=svg.getBoundingClientRect(),x=(e.clientX-b.left)/b.width*(this._geometry?.width||b.width);this._select(Math.floor((x-40)/((this._geometry?.right||b.width)-40)*this._rows.length));};
      svg.addEventListener('click',select);svg.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')select(e);});
      svg.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();this._select(e.key==='Home'?0:e.key==='End'?this._rows.length-1:this._selected+(e.key==='ArrowLeft'?-1:1));}});
    });
  }
  _changeDay(day){if(!day||day===this._day)return;this._day=day;this._actual=[];this._actualDay=null;this._signature=null;this._request++;this._sync();}
  _sync(){
    if(!this._hass||!this.shadowRoot.firstChild||!this._active)return;
    const a=this._hass.states[WEATHER]?.attributes||{},h=a.hourly||{},times=h.time||[];
    this._days=[...new Set(times.map(t=>dateKey(t*1000)))];
    if(!this._days.includes(this._day))this._day=this._days[0];
    const r=this.shadowRoot,options=JSON.stringify(this._days);
    if(options!==this._options){this._options=options;r.querySelector('select').innerHTML=this._days.map(day=>`<option value="${esc(day)}">${esc(new Date(day+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'short',timeZone:'Europe/Kyiv'}))}</option>`).join('');}
    r.querySelector('select').value=this._day||'';
    r.querySelectorAll('[data-day]').forEach(b=>{const day=this._days[b.dataset.day==='today'?0:1];b.disabled=!day;b.classList.toggle('selected',day===this._day);});
    const loss=number(this._hass.states['input_number.energetika_solar_losses']?.state)??20;
    const fresh=this._hass.states['binary_sensor.energetika_weather_fresh']?.state==='on';
    r.querySelector('[data-status]').textContent=!times.length?'Ожидание почасового прогноза.':!fresh?'Прогноз устарел: показаны последние полученные данные.':'';
    const signature=JSON.stringify([h,loss,this._day]);
    if(signature!==this._signature){this._signature=signature;this._rows=[];
      for(let i=0;i<times.length;i++)if(dateKey(times[i]*1000)===this._day){
        // Open-Meteo radiation at t+1h is the mean for [t,t+1h]. No forward shift.
        const end=times[i]+3600,next=times[i+1]===end?number(h.shortwave_radiation?.[i+1]):null;
        this._rows.push({t:times[i]*1000,end:end*1000,temp:number(h.temperature_2m?.[i]),cloud:number(h.cloud_cover?.[i]),code:number(h.weather_code?.[i]),day:number(h.is_day?.[i]),pv:next===null?null:Math.max(0,Math.min(2520,next*2.52*(1-loss/100)))});
      }
      this._selected=Math.max(0,Math.min(this._rows.length-1,this._selected));this._draw();
    }
    if(this._day&&(this._actualDay!==this._day||Date.now()-(this._fetched||0)>300000))this._loadActual();
  }
  async _loadActual(){
    const day=this._day;if(!this._rows.length||this._loadingDay===day)return;
    const start=this._rows[0].t,end=Math.min(this._rows.at(-1).end,Date.now()),request=++this._request;
    this._actualDay=day;this._fetched=Date.now();this._actual=[];
    if(end<=start){this.shadowRoot.querySelector('[data-actual-status]').textContent='Фактическая выработка появится после наступления этого дня.';this._draw();return;}
    this._loadingDay=day;this.shadowRoot.querySelector('[data-actual-status]').textContent='Загрузка фактической выработки…';
    try{
      const response=await this._hass.callWS({type:'recorder/statistics_during_period',start_time:new Date(start).toISOString(),end_time:new Date(end).toISOString(),statistic_ids:[PV],period:'hour',types:['mean']});
      if(request!==this._request)return;
      this._actual=(response[PV]||[]).filter(p=>Number.isFinite(p.mean)&&p.mean>=0&&p.mean<=5400).map(p=>({t:p.start,end:Math.min(p.end||p.start+3600000,end),v:p.mean}));
      this.shadowRoot.querySelector('[data-actual-status]').textContent=this._actual.length?'Факт: средняя мощность панелей из Recorder. Обновление раз в 5 минут.':'За этот день ещё нет почасовой статистики PV. Прогноз показан отдельно.';this._draw();
    }catch(error){if(request===this._request)this.shadowRoot.querySelector('[data-actual-status]').textContent='Фактическая история пока недоступна. Следующая попытка — через 5 минут.';}
    finally{if(this._loadingDay===day)this._loadingDay=null;}
  }
  _select(index){index=Math.max(0,Math.min(this._rows.length-1,index));if(index===this._selected)return;this._selected=index;this._draw();}
  _draw(){
    if(!this.shadowRoot.firstChild)return;
    const r=this.shadowRoot,svgs=[r.querySelector('[data-weather]'),r.querySelector('[data-pv]')],rows=this._rows||[];
    if(!rows.length){for(const s of svgs){s.setAttribute('viewBox','0 0 600 180');s.innerHTML='<text class="empty" x="300" y="90">Почасовые данные ещё не получены</text>';}return;}
    const width=Math.max(260,svgs[0].clientWidth),height=svgs[0].clientHeight||170,left=40,right=width-36,top=22,bottom=height-27;
    this._geometry={width,right};const start=rows[0].t,end=rows.at(-1).end,x=t=>left+(t-start)/(end-start)*(right-left),y=(v,min,max)=>bottom-(v-min)/(max-min)*(bottom-top);
    const axis=(min,max,unit,rightUnit='')=>`<text class="axis" x="4" y="12">${unit}</text>${rightUnit?`<text class="axis" x="${width-4}" y="12" text-anchor="end">${rightUnit}</text>`:''}${[0,1,2,3,4].map(i=>{const v=min+(max-min)*i/4,py=y(v,min,max);return `<path class="grid" d="M${left} ${py}H${right}"/><text class="axis" x="${left-5}" y="${py+3}" text-anchor="end">${fmt(v,max-min<15?1:0)}</text>${rightUnit?`<text class="axis" x="${right+5}" y="${py+3}">${i*25}</text>`:''}`;}).join('')}${rows.filter((_,i)=>i%Math.ceil(rows.length/6)===0).map(p=>`<text class="axis" x="${x(p.t)}" y="${height-7}" text-anchor="middle">${clock(p.t).slice(0,2)}</text>`).join('')}<text class="axis" x="${right}" y="${height-7}" text-anchor="middle">${clock(end).slice(0,2)}</text>`;
    const line=(points,min,max)=>{let d='',previous=null;for(const p of points){if(p.v===null){previous=null;continue;}d+=`${previous?'L':'M'}${x(p.t)},${y(p.v,min,max)}`;previous=p;}return d;};
    const bars=(points,min,max,colour,opacity)=>points.filter(p=>p.v!==null&&p.end>p.t).map(p=>`<rect x="${x(p.t)}" y="${y(p.v,min,max)}" width="${Math.max(0,x(p.end)-x(p.t)-1)}" height="${Math.max(0,bottom-y(p.v,min,max))}" fill="${colour}" opacity="${opacity}"/>`).join('');
    const temps=rows.map(p=>p.temp).filter(v=>v!==null),min=temps.length?Math.floor(Math.min(...temps)-2):0,max=temps.length?Math.ceil(Math.max(...temps)+2):20;
    const marker=`<path class="cursor" d="M${x(rows[this._selected]?.t??start)} ${top}V${bottom}"/>`;
    svgs[0].setAttribute('viewBox',`0 0 ${width} ${height}`);
    svgs[0].innerHTML=axis(min,max,'°C','%')+bars(rows.map(p=>({...p,v:p.cloud})),0,100,'#a1b0c6',.22)+`<path class="line" stroke="#6bd4ff" d="${line(rows.map(p=>({t:p.t,v:p.temp})),min,max)}"/>`+marker;
    const powerMax=Math.max(500,Math.ceil(Math.max(...rows.map(p=>p.pv||0),...this._actual.map(p=>p.v))/500)*500);
    svgs[1].setAttribute('viewBox',`0 0 ${width} ${height}`);
    svgs[1].innerHTML=axis(0,powerMax,'Вт')+bars(rows.map(p=>({...p,v:p.pv})),0,powerMax,'#ffd65a',.25)+rows.filter(p=>p.pv!==null).map(p=>`<path class="line" stroke="#ffd65a" d="M${x(p.t)} ${y(p.pv,0,powerMax)}H${x(p.end)}"/>`).join('')+this._actual.map(p=>`<path class="line" stroke="#35e3b4" d="M${x(p.t)} ${y(p.v,0,powerMax)}H${x(p.end)}"/>`).join('')+marker;
    const selected=rows[this._selected]||rows[0],actual=this._actual.find(p=>p.t<=selected.t&&p.end>selected.t);
    r.querySelector('[data-time]').textContent=`${clock(selected.t)}–${clock(selected.end)} · ${condition(selected.code,selected.day)}`;
    r.querySelector('[data-values]').innerHTML=`<span>Температура <b>${fmt(selected.temp,1)} °C</b></span><span>Облачность <b>${fmt(selected.cloud)}%</b></span><span>Прогноз <b class="solar">${fmt(selected.pv)} Вт</b></span><span>Факт <b class="actual">${fmt(actual?.v)} Вт</b></span>`;
  }
}
if(!customElements.get('energetika-hourly-charts'))customElements.define('energetika-hourly-charts',EnergetikaHourlyCharts);
