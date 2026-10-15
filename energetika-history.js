/* Energetika history 2.1 — local HA recorder, no CDN or chart dependencies. */
const escapeHtml = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n,d=0)=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:d});

export function cleanHistory(rows,minimum,maximum,start,end) {
  let rejected=0;
  const points=[];
  for(const row of rows) {
    const time=Date.parse(row.last_changed||row.last_updated);
    if(!Number.isFinite(time)||time>end)continue;
    let value=Number(row.state);
    const unknown=['unknown','unavailable','',null].includes(row.state);
    if(unknown||!Number.isFinite(value))value=null;
    else if(value<minimum||value>maximum){value=null;rejected++;}
    points.push({t:Math.max(start,time),v:value});
  }
  points.sort((a,b)=>a.t-b.t);
  // Keep the final reading at a duplicate timestamp.
  const unique=[];
  for(const point of points){if(unique.length&&unique.at(-1).t===point.t)unique[unique.length-1]=point;else unique.push(point);}
  return {points:unique,rejected};
}

export function buildStepPath(points,start,end,yMinimum,yMaximum) {
  const x=t=>58+(t-start)/(end-start)*922;
  const y=v=>230-(v-yMinimum)/(yMaximum-yMinimum)*204;
  let path='',last=null;
  for(const point of points){
    if(point.v===null){if(last)path+=`H${x(point.t).toFixed(2)}`;last=null;continue;}
    if(!last)path+=`M${x(point.t).toFixed(2)},${y(point.v).toFixed(2)}`;
    else path+=`H${x(point.t).toFixed(2)}V${y(point.v).toFixed(2)}`;
    last=point;
  }
  if(last)path+=`H${x(end).toFixed(2)}`;
  return path;
}

class EnergetikaHistoryCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._series=[];this._hidden=new Set();this._range='24';this._request=0;}
  setConfig(config){
    if(!Array.isArray(config.entities)||!config.entities.length)throw new Error('energetika-history-card: entities required');
    this.config=config;
    this._date=config.date_selector?this._localDate(new Date()):'';
    this._entities=config.entities.map(item=>typeof item==='string'?{entity:item,name:item}:item);
    this._render();
  }
  set hass(value){this._hass=value;if(this.isConnected&&(!this._lastFetch||Date.now()-this._lastFetch>60000))this._load();}
  getCardSize(){return 5;}
  connectedCallback(){if(this._hass)this._load();this._timer=setInterval(()=>{if(this._hass)this._load();},60000);}
  disconnectedCallback(){clearInterval(this._timer);this._request++;}
  _localDate(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  _window(){
    let end=new Date(),start;
    if(this._date){start=new Date(this._date+'T00:00:00');end=new Date(start);end.setDate(end.getDate()+1);if(end>new Date())end=new Date();}
    else start=new Date(end.getTime()-Number(this._range)*3600000);
    return {start:+start,end:Math.max(+start+1000,+end)};
  }
  _render(){
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;color:#edf5ff;font-family:Inter,system-ui,sans-serif}*{box-sizing:border-box}button,input{font:inherit;color:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #38bfff;outline-offset:3px}
      ha-card{display:block;max-width:1100px;margin:8px auto 18px;padding:23px 25px;border:1px solid #223449;border-radius:25px;background:radial-gradient(ellipse at 90% 0,#14253a 0,transparent 65%),linear-gradient(145deg,#0a1524,#060e18);box-shadow:0 10px 30px #0002}
      header{display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap}.eyebrow{color:#65879f;font-size:9px;font-weight:700;letter-spacing:1.8px;margin-bottom:8px}h2{margin:0;font-size:18px;font-weight:650;letter-spacing:-.3px}.controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.controls button,input{border:1px solid #284156;background:#0b1a2a;border-radius:9px;padding:7px 10px;font-size:11px}.controls button.selected{color:#4acaff;border-color:#2a829f;background:#103348}.controls input{color-scheme:dark;max-width:132px}.status{font-size:10px;color:#718da4;margin:10px 0 0;min-height:15px}.status.warn{color:#cfb783}.chart{position:relative;margin-top:6px}.chart svg{width:100%;display:block;touch-action:pan-y;overflow:visible}.gridline{stroke:#234055;stroke-dasharray:3 5;stroke-opacity:.65}.axis{fill:#7391a9;font-size:11px;font-variant-numeric:tabular-nums}.series-line{fill:none;stroke-width:2;stroke-linejoin:round;vector-effect:non-scaling-stroke}.cross{stroke:#a4beca;stroke-dasharray:3 4;stroke-opacity:.65}.legend{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}.legend button{display:flex;align-items:center;gap:7px;text-align:left;background:#10213277;border:1px solid #20394b;border-radius:10px;padding:9px 11px;flex:1 1 145px}.swatch{width:7px;height:7px;border-radius:50%;background:var(--tone);box-shadow:0 0 9px color-mix(in srgb,var(--tone) 40%,transparent)}.legend .name{color:#9fb6c9;font-size:10px;flex:1}.legend strong{font-size:13px;font-weight:650;font-variant-numeric:tabular-nums}.legend button.off{opacity:.35}.unit{font-size:9px;font-weight:400;color:#7892aa;margin-left:3px}.footer{display:flex;justify-content:space-between;gap:12px;margin-top:12px;font-size:9px;color:#526f87}.tooltip{display:none;position:absolute;pointer-events:none;z-index:2;top:12px;left:70px;max-width:230px;background:#07111df2;border:1px solid #325169;border-radius:12px;padding:12px;box-shadow:0 5px 24px #0005;font-size:11px;color:#bdd0de}.tooltip strong{color:#f1f8ff}.tooltip .row{display:flex;justify-content:space-between;gap:15px;margin-top:6px}.tip-time{color:#87a4bb;font-size:10px;margin-bottom:9px}.empty{fill:#7897ad;font-size:14px;text-anchor:middle}
      @media(max-width:600px){ha-card{padding:18px 12px;border-radius:22px}h2{font-size:16px}.eyebrow{font-size:8px}.controls{gap:4px}.controls button,input{font-size:10px;padding:6px 8px}.legend{gap:6px;margin-top:8px}.legend button{flex-basis:120px;padding:8px}.legend strong{font-size:12px}.legend .name{font-size:9px}.footer{font-size:8px}.axis{font-size:13px}}
    </style><ha-card><header><div><div class="eyebrow">ЭНЕРГЕТИКА / ИСТОРИЯ</div><h2>${escapeHtml(this.config.title||'История энергии')}</h2></div><div class="controls"><button data-range="6">6 ч</button><button data-range="24" class="selected">24 ч</button><input type="date" aria-label="День графика" value="${this._date}" max="${this._localDate(new Date())}"><button data-reset title="Вернуться к последним 24 часам">↺</button></div></header><div class="status" role="status">Загрузка истории…</div><div class="chart"><svg viewBox="0 0 1000 265" role="img" aria-label="${escapeHtml(this.config.title||'График')}"></svg><div class="tooltip"></div></div><div class="legend"></div><div class="footer"><span>Нажмите легенду для скрытия линии · двойное нажатие — история</span><span>ЛОКАЛЬНЫЙ RECORDER</span></div></ha-card>`;
    this.shadowRoot.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>{this._range=button.dataset.range;this._date='';this.shadowRoot.querySelector('input').value='';this._load();}));
    this.shadowRoot.querySelector('input').addEventListener('change',event=>{this._date=event.target.value;this._load();});
    this.shadowRoot.querySelector('[data-reset]').addEventListener('click',()=>{this._date='';this._range='24';this.shadowRoot.querySelector('input').value='';this._load();});
    const svg=this.shadowRoot.querySelector('svg');svg.addEventListener('pointermove',event=>this._hover(event));svg.addEventListener('pointerleave',()=>{this.shadowRoot.querySelector('.tooltip').style.display='none';svg.querySelector('.cross')?.setAttribute('visibility','hidden');});
  }
  async _load(){
    if(!this._hass||!this.shadowRoot.firstChild)return;
    if(this._loading){this._pending=true;return;}
    const request=++this._request,{start,end}=this._window();this._start=start;this._end=end;this._lastFetch=Date.now();this._loading=true;
    const status=this.shadowRoot.querySelector('.status');status.textContent='Загрузка истории…';status.classList.remove('warn');
    const baseTitle=(this.config.title||'История энергии').replace(/ · 24 часа$/,'');
    this.shadowRoot.querySelector('h2').textContent=baseTitle+(this._date?' · '+new Date(this._date+'T12:00:00').toLocaleDateString('ru-RU'):' · '+this._range+' ч');
    this.shadowRoot.querySelectorAll('[data-range]').forEach(button=>button.classList.toggle('selected',!this._date&&button.dataset.range===this._range));
    try{
      const ids=this._entities.map(s=>s.entity).join(',');
      const response=await this._hass.callApi('GET',`history/period/${new Date(start).toISOString()}?filter_entity_id=${encodeURIComponent(ids)}&end_time=${encodeURIComponent(new Date(end).toISOString())}&minimal_response&no_attributes`);
      if(request!==this._request)return;
      const byId=new Map(response.filter(rows=>rows.length).map(rows=>[rows[0].entity_id,rows]));
      this._series=this._entities.map((entity,index)=>({...entity,color:entity.color||['#ffd65a','#bc7bff','#38bfff','#17e6b3','#70a7ff'][index%5],...cleanHistory(byId.get(entity.entity)||[],entity.minimum??0,entity.maximum??11000,start,end)}));
      const rejected=this._series.reduce((sum,s)=>sum+s.rejected,0);
      status.classList.toggle('warn',rejected>0);
      status.textContent=rejected?`Недостоверные показания исключены: ${rejected}. На их месте — разрывы, без подмены нулями.`:this._series.some(s=>s.points.length)?'Показания из истории Home Assistant · обновление раз в минуту':'За выбранный период данных ещё нет';
      this._draw();
    }catch(error){if(request===this._request){status.textContent='История недоступна. Нажмите ↺ для повторной загрузки.';status.classList.add('warn');}}
    finally{this._loading=false;if(this._pending&&this.isConnected){this._pending=false;this._load();}}
  }
  _draw(redrawLegend=true){
    const active=this._series.filter(s=>!this._hidden.has(s.entity));
    const values=active.flatMap(s=>s.points.filter(p=>p.v!==null).map(p=>p.v));
    let minimum=Math.min(0,...values),maximum=Math.max(1,...values);
    if(this.config.unit==='%'){minimum=0;maximum=100;}
    else{const step=10**Math.floor(Math.log10(Math.max(1,maximum-minimum)));maximum=Math.ceil(maximum/step)*step;minimum=Math.floor(minimum/step)*step;}
    this._minimum=minimum;this._maximum=maximum;
    const y=value=>230-(value-minimum)/(maximum-minimum)*204;
    let markup='';
    for(let index=0;index<5;index++){
      const value=minimum+(maximum-minimum)*index/4;
      markup+=`<line class="gridline" x1="58" x2="980" y1="${y(value)}" y2="${y(value)}"/><text class="axis" x="46" y="${y(value)+4}" text-anchor="end">${fmt(value,value<10?1:0)}</text>`;
    }
    for(let index=0;index<=6;index++){
      const time=this._start+(this._end-this._start)*index/6,x=58+922*index/6;
      markup+=`<line class="gridline" x1="${x}" x2="${x}" y1="26" y2="230"/><text class="axis" x="${x}" y="254" text-anchor="${index===0?'start':index===6?'end':'middle'}">${new Date(time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</text>`;
    }
    markup+=`<text class="axis" x="58" y="14">${escapeHtml(this.config.unit||'Вт')}</text>`;
    for(const series of active)markup+=`<path class="series-line" stroke="${escapeHtml(series.color)}" d="${buildStepPath(series.points,this._start,this._end,minimum,maximum)}"/>`;
    if(!values.length)markup+='<text class="empty" x="520" y="130">Нет достоверных данных за выбранный период</text>';
    markup+='<line class="cross" y1="26" y2="230" visibility="hidden"/>';
    this.shadowRoot.querySelector('.chart svg').innerHTML=markup;
    if(!redrawLegend)return;
    this.shadowRoot.querySelector('.legend').innerHTML=this._series.map((series,index)=>{
      const last=series.points.at(-1)?.v;
      return `<button style="--tone:${escapeHtml(series.color)}" data-series="${index}" class="${this._hidden.has(series.entity)?'off':''}" title="Показать/скрыть ${escapeHtml(series.name)}; двойное нажатие — история"><span class="swatch"></span><span class="name">${escapeHtml(series.name)}</span><strong>${last===null||last===undefined?'—':fmt(last)}<span class="unit">${escapeHtml(this.config.unit||'Вт')}</span></strong></button>`;
    }).join('');
    this.shadowRoot.querySelectorAll('[data-series]').forEach(button=>{
      const series=this._series[Number(button.dataset.series)];
      button.addEventListener('click',()=>{this._hidden.has(series.entity)?this._hidden.delete(series.entity):this._hidden.add(series.entity);button.classList.toggle('off',this._hidden.has(series.entity));this._draw(false);});
      button.addEventListener('dblclick',()=>this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:series.entity},bubbles:true,composed:true})));
    });
  }
  _hover(event){
    const svg=this.shadowRoot.querySelector('.chart svg'),box=svg.getBoundingClientRect();
    const relative=Math.min(980,Math.max(58,(event.clientX-box.left)/box.width*1000)),time=this._start+(relative-58)/922*(this._end-this._start);
    const rows=this._series.filter(s=>!this._hidden.has(s.entity)).map(series=>{
      let low=0,high=series.points.length-1,index=-1;
      while(low<=high){const mid=(low+high)>>1;if(series.points[mid].t<=time){index=mid;low=mid+1;}else high=mid-1;}
      const value=index<0?null:series.points[index].v;
      return `<div class="row"><span style="color:${escapeHtml(series.color)}">${escapeHtml(series.name)}</span><strong>${value===null?'—':fmt(value)} ${escapeHtml(this.config.unit||'Вт')}</strong></div>`;
    }).join('');
    const tooltip=this.shadowRoot.querySelector('.tooltip');tooltip.innerHTML=`<div class="tip-time">${new Date(time).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>${rows}`;tooltip.style.display='block';tooltip.style.left=relative>600?'65px':'auto';tooltip.style.right=relative>600?'auto':'12px';
    const cross=svg.querySelector('.cross');cross.setAttribute('x1',relative);cross.setAttribute('x2',relative);cross.setAttribute('visibility','visible');
  }
}
if(!customElements.get('energetika-history-card'))customElements.define('energetika-history-card',EnergetikaHistoryCard);
window.customCards=window.customCards||[];
window.customCards.push({type:'energetika-history-card',name:'Энергетика · История',description:'Графики потоков с фильтрацией недостоверной телеметрии',preview:false});
