import {dayKey,dayStart,dateLabel} from './energetika-date.js?v=2.13.0';
/* Energetika history 2.13 — recorder, calendar, fixed-hour navigation and touch zoom. */
const escapeHtml = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n,d=0)=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:d});
const clock = time=>new Date(time).toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'});

export function cleanHistory(rows,minimum,maximum,start,end) {
  let rejected=0;
  const points=[];
  for(const row of rows) {
    const time=Date.parse(row.last_changed||row.last_updated);
    if(!Number.isFinite(time)||time>end)continue;
    let value=Number(row.state);
    if(['unknown','unavailable','',null].includes(row.state)||!Number.isFinite(value))value=null;
    else if(value<minimum||value>maximum){value=null;rejected++;}
    points.push({t:Math.max(start,time),v:value});
  }
  points.sort((a,b)=>a.t-b.t);
  const unique=[];
  for(const point of points){if(unique.length&&unique.at(-1).t===point.t)unique[unique.length-1]=point;else unique.push(point);}
  return {points:unique,rejected};
}

// Carry the actual state at the left edge, including unknown intervals.
export function visiblePoints(points,start,end) {
  let previous=null;
  const result=[];
  for(const point of points){
    if(point.t<=start){previous=point;continue;}
    if(point.t>end)break;
    if(!result.length&&previous){result.push({t:start,v:previous.v});previous=null;}
    result.push(point);
  }
  if(!result.length&&previous)result.push({t:start,v:previous.v});
  return result;
}

export function clampWindow(start,span,fullStart,fullEnd) {
  span=Math.max(Math.min(60000,fullEnd-fullStart),Math.min(span,fullEnd-fullStart));
  start=Math.max(fullStart,Math.min(start,fullEnd-span));
  return {start,end:start+span};
}

export function buildStepPath(points,start,end,yMinimum,yMaximum,geometry={left:58,right:980,top:26,bottom:230}) {
  const {left,right,top,bottom}=geometry;
  const x=t=>left+(t-start)/(end-start)*(right-left);
  const y=v=>bottom-(v-yMinimum)/(yMaximum-yMinimum)*(bottom-top);
  let path='',last=null;
  for(const point of visiblePoints(points,start,end)){
    if(point.v===null){if(last)path+=`H${x(point.t).toFixed(2)}`;last=null;continue;}
    if(!last)path+=`M${x(point.t).toFixed(2)},${y(point.v).toFixed(2)}`;
    else path+=`H${x(point.t).toFixed(2)}V${y(point.v).toFixed(2)}`;
    last=point;
  }
  if(last)path+=`H${x(end).toFixed(2)}`;
  return path;
}

class EnergetikaHistoryCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._series=[];this._hidden=new Set();this._range='24';this._request=0;this._pointers=new Map();}
  setConfig(config){
    if(!Array.isArray(config.entities)||!config.entities.length)throw new Error('energetika-history-card: entities required');
    this.config=config;
    this._anchor=config.date_selector?dayStart(dayKey(Date.now())):null;
    this._entities=config.entities.map(item=>typeof item==='string'?{entity:item,name:item}:item);
    this._render();
  }
  set hass(value){this._hass=value;if(this.isConnected&&(!this._lastFetch||Date.now()-this._lastFetch>60000))this._load();}
  getCardSize(){return 6;}
  connectedCallback(){
    if(this._hass)this._load();
    this._timer=setInterval(()=>{if(this._hass)this._load();},60000);
    this._resize=new ResizeObserver(()=>{if(this._series.length)this._draw(false);});
    this._resize.observe(this);
  }
  disconnectedCallback(){clearInterval(this._timer);this._resize?.disconnect();this._pointers.clear();this._request++;}
  _localDate(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  _window(){
    const now=Date.now(),span=Number(this._range)*3600000,start=this._anchor??now-span;
    return {start,end:Math.max(start+1000,Math.min(now,start+span))};
  }
  _navigate(direction){if(direction>0&&this._anchor===null)return;const span=Number(this._range)*3600000,start=this._window().start+direction*span;if(start>=Date.now())return;this._anchor=start;this._view=null;this._request++;this._load();}
  _syncControls(){
    const r=this.shadowRoot,{start,end}=this._window(),picker=r.querySelector('energetika-date-picker');picker.value=dayKey(this._anchor??Date.now());picker.limits={max:dayKey(Date.now())};
    r.querySelector('[data-step="1"]').disabled=this._anchor===null||start+Number(this._range)*3600000>=Date.now();r.querySelector('[data-now]').hidden=this._anchor===null;
    r.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('selected',b.dataset.range===this._range));
    const base=(this.config.title||'История энергии').replace(/ · 24 часа$/,'');
    r.querySelector('h2').textContent=base+' · '+this._range+' ч';
    r.querySelector('[data-period]').textContent=`${dateLabel(dayKey(start))}, ${clock(start)} — ${dayKey(end)===dayKey(start)?'':dateLabel(dayKey(end))+', '}${clock(end)}`;
  }
  _render(){
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;color:#edf5ff;font-family:Inter,system-ui,sans-serif}*{box-sizing:border-box}button,input{font:inherit;color:inherit}button{cursor:pointer;touch-action:manipulation}button:focus-visible,input:focus-visible,svg:focus-visible{outline:2px solid #38bfff;outline-offset:2px}
      ha-card{display:block;max-width:1100px;margin:8px auto 16px;padding:21px 23px;border:1px solid #223449;border-radius:25px;background:radial-gradient(ellipse at 90% 0,#14253a 0,transparent 65%),linear-gradient(145deg,#0a1524,#060e18);box-shadow:0 10px 30px #0002}
      header{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.eyebrow{color:#65879f;font-size:9px;font-weight:700;letter-spacing:1.8px;margin-bottom:7px}h2{margin:0;font-size:18px;font-weight:650;letter-spacing:-.3px}.controls{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.controls button:disabled{opacity:.3;cursor:default}.period{color:#86aabe;font-size:11px;margin:10px 0 0;font-variant-numeric:tabular-nums}.controls [hidden]{display:none}.controls [data-step]{font-size:20px;padding:3px 10px;min-height:34px}.controls energetika-date-picker{font:inherit}.controls button,input,.zoom button{border:1px solid #284156;background:#0b1a2a;border-radius:9px;padding:7px 10px;font-size:11px}.controls button.selected{color:#4acaff;border-color:#2a829f;background:#103348}.controls input{color-scheme:dark;max-width:132px;min-width:0}.status{display:none;font-size:11px;color:#e6b18a;margin:9px 0 0}.status.visible{display:block}.chart{position:relative;margin-top:6px}.chart svg{width:100%;height:310px;display:block;touch-action:none;user-select:none;-webkit-user-select:none;cursor:crosshair}.chart svg.zoomed{cursor:grab}.chart svg.dragging{cursor:grabbing}.gridline{stroke:#234055;stroke-dasharray:3 5;stroke-opacity:.65}.axis{fill:#8ba6ba;font-size:11px;font-variant-numeric:tabular-nums}.series-line{fill:none;stroke-width:1.8;stroke-linejoin:round;vector-effect:non-scaling-stroke}.cross{stroke:#a4beca;stroke-dasharray:3 4;stroke-opacity:.65}
      .legend{display:grid;grid-template-columns:repeat(var(--series-count),minmax(0,1fr));gap:7px;margin-top:8px}.legend button{display:grid;grid-template-columns:7px 1fr;align-items:center;gap:4px 6px;text-align:left;background:#10213277;border:1px solid #20394b;border-radius:10px;padding:8px;min-width:0}.swatch{width:6px;height:6px;border-radius:50%;background:var(--tone);box-shadow:0 0 8px color-mix(in srgb,var(--tone) 40%,transparent)}.legend .name{color:#a6bed0;font-size:10px;white-space:nowrap}.legend strong{grid-column:2;font-size:14px;font-weight:650;white-space:nowrap;font-variant-numeric:tabular-nums}.legend button.off{opacity:.35}.unit{font-size:9px;font-weight:400;color:#8ca4b8;margin-left:2px}.footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;font-size:10px;color:#6b8a9f}.zoom{display:flex;align-items:center;gap:4px}.zoom button{padding:3px 9px;font-size:15px;min-height:28px}.zoom .fit{font-size:10px}.zoom button:disabled{opacity:.35;cursor:default}.zoom-label{font-variant-numeric:tabular-nums;color:#7dc7e0;font-size:10px;margin-left:3px}.tooltip{display:none;position:absolute;pointer-events:none;z-index:2;top:25px;max-width:230px;background:#07111df2;border:1px solid #325169;border-radius:12px;padding:11px;box-shadow:0 5px 24px #0005;font-size:11px;color:#bdd0de}.tooltip strong{color:#f1f8ff}.tooltip .row{display:flex;justify-content:space-between;gap:15px;margin-top:6px}.tip-time{color:#87a4bb;font-size:10px;margin-bottom:9px}.empty{fill:#7897ad;font-size:12px;text-anchor:middle}
      @media(max-width:600px){ha-card{padding:14px 10px;border-radius:20px}h2{font-size:15px}.eyebrow{font-size:8px;margin-bottom:5px}.controls{gap:4px}.controls button,input{font-size:10px;padding:6px 8px}.chart svg{height:280px}.legend{gap:4px;margin-top:3px}.legend button{padding:7px 3px;gap:4px 3px;grid-template-columns:5px 1fr;border-radius:8px}.swatch{width:5px;height:5px}.legend .name{font-size:9px}.legend strong{font-size:12px;grid-column:1/-1;text-align:center}.unit{font-size:8px}.footer{font-size:9px;flex-wrap:wrap}.zoom-label{font-size:9px}.gesture-hint{flex:1;white-space:nowrap}}
      @media(max-width:360px){.legend .name{font-size:8px}.legend strong{font-size:11px}.legend button{gap:3px 2px}.chart svg{height:265px}}
      .history-tracks{margin-top:12px}.history-track{margin:12px 0}.track-title{font-size:11px;color:#a6c6d6;line-height:1.6}.track-title .key{white-space:nowrap;display:inline-block;margin-right:8px;font-size:10px}.history-track svg{width:100%;display:block;height:66px;touch-action:pan-y}.history-track.state svg{height:42px}.track-readout{font-size:11px;color:#d7e8f4;line-height:1.8;background:#102739;border:1px solid #2f5268;border-radius:9px;padding:9px}.track-threshold{fill:none;stroke-width:1.2;stroke-dasharray:5 4}.track-axis{font-size:9px;fill:#88a8be}.track-line{fill:none;stroke-width:1.7;vector-effect:non-scaling-stroke}
    </style><ha-card><header><div><div class="eyebrow">ЭНЕРГЕТИКА / ИСТОРИЯ</div><h2>${escapeHtml(this.config.title||'История энергии')}</h2></div><div class="controls"><button data-range="6">6 ч</button><button data-range="12">12 ч</button><button data-range="24" class="selected">24 ч</button><button data-step="-1" aria-label="Предыдущий период">‹</button><energetika-date-picker></energetika-date-picker><button data-step="1" aria-label="Следующий период">›</button><button data-now hidden title="К текущему времени">Сейчас</button><button data-refresh title="Обновить историю">↻</button></div></header><p class="period" data-period></p><div class="status" role="status"></div><div class="chart"><svg role="img" tabindex="0" aria-label="${escapeHtml(this.config.title||'График')}. Два пальца — масштаб, один — сдвиг. Клавиши плюс, минус, стрелки, Home."></svg><div class="tooltip"></div></div><div class="history-tracks"></div><p class="track-readout" role="status" hidden></p><div class="legend" style="--series-count:${this._entities.length}"></div><div class="footer"><span class="gesture-hint">Два пальца — масштаб · один — сдвиг</span><div class="zoom"><button data-zoom="in" aria-label="Увеличить график">+</button><button data-zoom="out" aria-label="Уменьшить график">−</button><button class="fit" data-fit title="Показать весь выбранный период">Весь период</button><span class="zoom-label"></span></div></div></ha-card>`;
    this.shadowRoot.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>{this._range=button.dataset.range;this._view=null;this._request++;this._load();}));
    this.shadowRoot.querySelectorAll('[data-step]').forEach(button=>button.onclick=()=>this._navigate(Number(button.dataset.step)));
    this.shadowRoot.querySelector('energetika-date-picker').addEventListener('change',event=>{this._anchor=dayStart(event.detail.value);this._view=null;this._request++;this._load();});
    this.shadowRoot.querySelector('[data-now]').onclick=()=>{this._anchor=null;this._view=null;this._request++;this._load();};
    this._syncControls();
    this.shadowRoot.querySelector('[data-refresh]').addEventListener('click',()=>this._load());
    this.shadowRoot.querySelector('[data-fit]').addEventListener('click',()=>{this._view=null;this._draw(false);});
    this.shadowRoot.querySelectorAll('[data-zoom]').forEach(button=>button.addEventListener('click',()=>this._zoom(button.dataset.zoom==='in'?0.5:2)));
    const svg=this.shadowRoot.querySelector('svg');
    svg.addEventListener('pointerdown',event=>this._pointerDown(event));
    svg.addEventListener('pointermove',event=>this._pointerMove(event));
    for(const name of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(name,event=>{this._pointers.delete(event.pointerId);this._rebaseGesture();});
    svg.addEventListener('pointerleave',()=>{if(!this._pointers.size)this._hideHover();});
    svg.addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey){event.preventDefault();this._zoom(Math.exp(Math.max(-1,Math.min(1,event.deltaY/300))),this._fraction(event.clientX));}},{passive:false});
    svg.addEventListener('keydown',event=>{
      if(['+','=','-','Home','ArrowLeft','ArrowRight'].includes(event.key)){
        event.preventDefault();
        if(event.key==='Home'){this._view=null;this._draw(false);}
        else if(event.key.startsWith('Arrow')){const v=this._visibleWindow(),span=v.end-v.start;this._setView(v.start+span*(event.key==='ArrowLeft'?-.2:.2),span);}
        else this._zoom(event.key==='-'?2:.5);
      }
    });
  }
  async _load(){
    if(!this._hass||!this.shadowRoot.firstChild)return;
    if(this._loading){this._pending=true;return;}
    const request=++this._request,{start,end}=this._window();this._lastFetch=Date.now();this._loading=true;
    const status=this.shadowRoot.querySelector('.status');status.classList.remove('visible');
    this._syncControls();
    try{
      const tracks=this.config.tracks||[];const ids=[...new Set([...this._entities.map(s=>s.entity),...tracks.flatMap(t=>[t.entity,...(t.thresholds||[]).map(q=>q.entity)]).filter(Boolean)])].join(',');
      const response=await this._hass.callApi('GET',`history/period/${new Date(start).toISOString()}?filter_entity_id=${encodeURIComponent(ids)}&end_time=${encodeURIComponent(new Date(end).toISOString())}&minimal_response&no_attributes`);
      if(request!==this._request)return;
      this._start=start;this._end=end;
      if(this._view)this._view=clampWindow(this._view.start,this._view.end-this._view.start,start,end);
      const byId=new Map(response.filter(rows=>rows.length).map(rows=>[rows[0].entity_id,rows]));
      this._series=this._entities.map((entity,index)=>({...entity,color:entity.color||['#ffd65a','#bc7bff','#38bfff','#17e6b3','#70a7ff'][index%5],...cleanHistory(byId.get(entity.entity)||[],entity.minimum??0,entity.maximum??11000,start,end)}));
      this._tracks=tracks.map(track=>{
        const points=track.kind?(byId.get(track.entity)||[]).map(row=>({t:Math.max(start,Date.parse(row.last_changed||row.last_updated)),v:['unknown','unavailable','',null].includes(row.state)?null:row.state})).filter(p=>Number.isFinite(p.t)&&p.t<=end).sort((a,b)=>a.t-b.t).reduce((out,p)=>{if(!out.length||out.at(-1).v!==p.v)out.push(p);return out;},[]):cleanHistory(byId.get(track.entity)||[],0,track.maximum??100,start,end).points;
        const thresholds=(track.thresholds||[]).map(q=>({...q,points:q.entity?cleanHistory(byId.get(q.entity)||[],0,100,start,end).points.map(p=>({...p,v:p.v===null?null:p.v+(q.offset||0)})):[{t:start,v:q.value}]}));
        return {...track,points,thresholds};
      });
      this._draw();
    }catch(error){if(request===this._request){status.textContent='Не удалось загрузить историю. Нажмите ↻ для повтора.';status.classList.add('visible');}}
    finally{this._loading=false;if(this._pending&&this.isConnected){this._pending=false;this._load();}}
  }
  _visibleWindow(){return this._view||{start:this._start,end:this._end};}
  _isZoomed(){return this._view&&this._view.end-this._view.start<this._end-this._start-1;}
  _fraction(clientX){if(!this._geometry)return .5;const box=this.shadowRoot.querySelector('svg').getBoundingClientRect(),g=this._geometry;return Math.max(0,Math.min(1,(clientX-box.left-g.left)/(g.right-g.left)));}
  _setView(start,span){if(!this._start)return;this._view=clampWindow(start,span,this._start,this._end);this._hideHover();this._draw(false);}
  _zoom(factor,fraction=.5){if(!this._start)return;const v=this._visibleWindow(),span=v.end-v.start,anchor=v.start+span*fraction;this._setView(anchor-span*factor*fraction,span*factor);}
  _pointerDown(event){
    if(!this._start||event.button>0)return;
    event.preventDefault();
    this._pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    event.currentTarget.setPointerCapture(event.pointerId);this._rebaseGesture();
    if(event.pointerType==='touch'&&this._pointers.size===1)this._hover(event);
  }
  _rebaseGesture(){
    const p=[...this._pointers.values()],view=this._visibleWindow();
    this._gesture=p.length?{view:{...view},x:p[0].x,distance:p.length>1?Math.max(1,Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y)):0,anchor:p.length>1?view.start+(view.end-view.start)*this._fraction((p[0].x+p[1].x)/2):0}:null;
    this.shadowRoot.querySelector('svg').classList.toggle('dragging',p.length>0&&!!this._isZoomed());
  }
  _pointerMove(event){
    if(!this._pointers.has(event.pointerId)){if(event.pointerType!=='touch')this._hover(event);return;}
    this._pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const p=[...this._pointers.values()],g=this._gesture,span=g.view.end-g.view.start;
    if(p.length>1&&g.distance){
      event.preventDefault();
      const distance=Math.max(1,Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y));
      const nextSpan=clampWindow(this._start,span*g.distance/distance,this._start,this._end).end-this._start;
      this._setView(g.anchor-nextSpan*this._fraction((p[0].x+p[1].x)/2),nextSpan);
    }else if(this._isZoomed()){
      event.preventDefault();this._setView(g.view.start-(p[0].x-g.x)/(this._geometry.right-this._geometry.left)*span,span);
    }else this._hover(event);
  }
  _draw(redrawLegend=true){
    if(!this._start)return;
    const svg=this.shadowRoot.querySelector('.chart svg'),width=Math.max(260,svg.clientWidth),height=svg.clientHeight||280;
    const geometry={left:48,right:width-10,top:25,bottom:height-29};this._geometry=geometry;
    const {left,right,top,bottom}=geometry,{start,end}=this._visibleWindow();
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.classList.toggle('zoomed',!!this._isZoomed());
    const active=this._series.filter(s=>!this._hidden.has(s.entity));
    const values=active.flatMap(s=>visiblePoints(s.points,start,end).filter(p=>p.v!==null).map(p=>p.v));
    let minimum=Math.min(0,...values),maximum=Math.max(1,...values);
    if(this.config.unit==='%'){minimum=0;maximum=100;}
    else{const step=10**Math.floor(Math.log10(Math.max(1,maximum-minimum)));maximum=Math.ceil(maximum/step)*step;minimum=Math.floor(minimum/step)*step;}
    const y=value=>bottom-(value-minimum)/(maximum-minimum)*(bottom-top);
    let markup='';
    for(let index=0;index<5;index++){
      const value=minimum+(maximum-minimum)*index/4;
      markup+=`<line class="gridline" x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"/><text class="axis" x="${left-7}" y="${y(value)+4}" text-anchor="end">${fmt(value,value<10?1:0)}</text>`;
    }
    const ticks=width<500?4:6;
    for(let index=0;index<=ticks;index++){
      const time=start+(end-start)*index/ticks,x=left+(right-left)*index/ticks;
      markup+=`<line class="gridline" x1="${x}" x2="${x}" y1="${top}" y2="${bottom}"/><text class="axis" x="${x}" y="${height-7}" text-anchor="${index===0?'start':index===ticks?'end':'middle'}">${clock(time)}</text>`;
    }
    markup+=`<text class="axis" x="${left}" y="14">${escapeHtml(this.config.unit||'Вт')}</text>`;
    for(const series of active)markup+=`<path class="series-line" stroke="${escapeHtml(series.color)}" ${series.dash?'stroke-dasharray="5 4"':''} d="${buildStepPath(series.points,start,end,minimum,maximum,geometry)}"/>`;
    if(!values.length)markup+=`<text class="empty" x="${(left+right)/2}" y="${height/2}">Нет данных</text>`;
    markup+=`<line class="cross" y1="${top}" y2="${bottom}" visibility="hidden"/>`;
    svg.innerHTML=markup;
    this.shadowRoot.querySelector('.zoom-label').textContent=this._isZoomed()?`${fmt((this._end-this._start)/(end-start),1)}×`:'';
    this.shadowRoot.querySelector('[data-fit]').disabled=!this._isZoomed();
    this.shadowRoot.querySelector('[data-zoom="out"]').disabled=!this._isZoomed();
    this.shadowRoot.querySelector('[data-zoom="in"]').disabled=end-start<=Math.min(60000,this._end-this._start);
    this._drawTracks();
    if(!redrawLegend)return;
    this.shadowRoot.querySelector('.legend').innerHTML=this._series.map((series,index)=>{
      const last=series.points.at(-1)?.v,name=series.name.replace('Зарядка АКБ','Заряд').replace('Разрядка АКБ','Разряд');
      return `<button style="--tone:${escapeHtml(series.color)}" data-series="${index}" class="${this._hidden.has(series.entity)?'off':''}" aria-pressed="${!this._hidden.has(series.entity)}" title="${escapeHtml(series.name)}: показать/скрыть; двойное нажатие — история"><span class="swatch"></span><span class="name">${escapeHtml(name)}</span><strong>${last===null||last===undefined?'—':fmt(last)}<span class="unit">${escapeHtml(this.config.unit||'Вт')}</span></strong></button>`;
    }).join('');
    this.shadowRoot.querySelectorAll('[data-series]').forEach(button=>{
      const series=this._series[Number(button.dataset.series)];
      button.addEventListener('click',()=>{this._hidden.has(series.entity)?this._hidden.delete(series.entity):this._hidden.add(series.entity);button.classList.toggle('off',this._hidden.has(series.entity));button.setAttribute('aria-pressed',String(!this._hidden.has(series.entity)));this._draw(false);});
      button.addEventListener('dblclick',()=>this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:series.entity},bubbles:true,composed:true})));
    });
  }
  _trackState(track,value){
    if(value===null)return {label:'Нет данных',color:'#314354'};
    if(track.kind==='boolean')return value==='on'?{label:track.onLabel||'Да',color:track.onColor||'#258b74'}:{label:track.offLabel||'Нет',color:'#3e5062'};
    const code=String(value).match(/\(([^)]+)\)/)?.[1]||String(value);
    return {label:code,color:({SBU:'#159b7c',SUB:'#237ca8',SOL:'#b5932c',SUF:'#9d78ca',UTI:'#6f85b5'})[code]||'#657a8d'};
  }
  _pointValue(points,time){let value=null;for(const point of points){if(point.t>time)break;value=point.v;}return value;}
  _trackText(time){
    return (this._tracks||[]).map(t=>`${t.name}: ${t.kind?this._trackState(t,this._pointValue(t.points,time)).label:(this._pointValue(t.points,time)===null?'—':fmt(this._pointValue(t.points,time))+'%')}${t.kind?'':t.thresholds.map(q=>' · '+q.name+': '+(this._pointValue(q.points,time)===null?'—':fmt(this._pointValue(q.points,time))+'%')).join('')}`).join(' | ');
  }
  _drawTracks(){
    const container=this.shadowRoot.querySelector('.history-tracks'),tracks=this._tracks||[];if(!tracks.length){container.innerHTML='';return;}
    const {start,end}=this._visibleWindow(),width=Math.max(260,this.shadowRoot.querySelector('.chart svg').clientWidth),left=this._geometry.left,right=this._geometry.right,x=t=>left+(t-start)/(end-start)*(right-left);
    container.innerHTML=tracks.map(track=>{
      const points=visiblePoints(track.points,start,end);let body='',key='';
      if(track.kind){
        const modes=track.kind==='mode'?['SBU','SUB']:['on','off'];
        key=modes.map(v=>{const s=this._trackState(track,v);return `<span class="key" style="color:${s.color}">● ${escapeHtml(s.label)}</span>`;}).join('');
        body=`<rect x="${left}" y="2" width="${right-left}" height="22" rx="4" fill="#152737"/>`;
        for(let i=0;i<points.length;i++){const p=points[i],to=points[i+1]?.t??end,state=this._trackState(track,p.v),span=x(to)-x(p.t);body+=`<rect x="${x(p.t)}" y="2" width="${Math.max(0,span)}" height="22" fill="${state.color}"><title>${escapeHtml(state.label)} · ${clock(p.t)}–${clock(to)}</title></rect>`;if(span>42)body+=`<text x="${x(p.t)+span/2}" y="17" text-anchor="middle" fill="#eef9ff" font-size="10">${escapeHtml(state.label)}</text>`;}
      }else{
        const values=points.map(p=>p.v).filter(v=>v!==null),maximum=Math.max(100,...values),g={left,right,top:3,bottom:45};
        body=`<text class="track-axis" x="${left-5}" y="10" text-anchor="end">${fmt(maximum)}</text><text class="track-axis" x="${left-5}" y="46" text-anchor="end">0%</text>`;
        for(const q of track.thresholds){body+=`<path class="track-threshold" stroke="${q.color}" d="${buildStepPath(q.points,start,end,0,maximum,g)}"/>`;key+=`<span class="key" style="color:${q.color}">┄ ${escapeHtml(q.name)}</span>`;}
        body+=`<path class="track-line" stroke="${track.color}" d="${buildStepPath(track.points,start,end,0,maximum,g)}"/>`;
      }
      const height=track.kind?42:66;
      for(let i=0;i<=4;i++){const time=start+(end-start)*i/4;body+=`<text class="track-axis" x="${x(time)}" y="${height-2}" text-anchor="${i===0?'start':i===4?'end':'middle'}">${clock(time)}</text>`;}
      return `<div class="history-track ${track.kind?'state':''}"><div class="track-title">${escapeHtml(track.name)} · ${key}</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(track.name)}">${body}</svg></div>`;
    }).join('');
    container.querySelectorAll('svg').forEach(svg=>{const show=event=>{const box=svg.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,((event.clientX-box.left)/box.width*width-left)/(right-left))),time=start+(end-start)*fraction,readout=this.shadowRoot.querySelector('.track-readout');readout.hidden=false;readout.textContent=new Date(time).toLocaleString('ru-RU')+' · '+this._trackText(time);};svg.onpointermove=show;svg.onclick=show;});
  }
  _hideHover(){this.shadowRoot.querySelector('.tooltip').style.display='none';this.shadowRoot.querySelector('.cross')?.setAttribute('visibility','hidden');}
  _hover(event){
    if(!this._start||!this._geometry)return;
    const {left,right}=this._geometry,{start,end}=this._visibleWindow(),fraction=this._fraction(event.clientX),relative=left+fraction*(right-left),time=start+fraction*(end-start);
    const rows=this._series.filter(s=>!this._hidden.has(s.entity)).map(series=>{
      let low=0,high=series.points.length-1,index=-1;
      while(low<=high){const mid=(low+high)>>1;if(series.points[mid].t<=time){index=mid;low=mid+1;}else high=mid-1;}
      const value=index<0?null:series.points[index].v;
      return `<div class="row"><span style="color:${escapeHtml(series.color)}">${escapeHtml(series.name)}</span><strong>${value===null?'—':fmt(value)} ${escapeHtml(this.config.unit||'Вт')}</strong></div>`;
    }).join('');
    const tooltip=this.shadowRoot.querySelector('.tooltip');tooltip.innerHTML=`<div class="tip-time">${new Date(time).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>${rows}${this._tracks?.length?'<div class="row">'+escapeHtml(this._trackText(time))+'</div>':''}`;tooltip.style.display='block';tooltip.style.left=fraction>.5?'50px':'auto';tooltip.style.right=fraction>.5?'auto':'10px';
    const cross=this.shadowRoot.querySelector('.cross');cross.setAttribute('x1',relative);cross.setAttribute('x2',relative);cross.setAttribute('visibility','visible');
  }
}
if(!customElements.get('energetika-history-card'))customElements.define('energetika-history-card',EnergetikaHistoryCard);

/* Use the same chart, palette and gestures when a flow tile opens its history. */
class EnergetikaHistoryDialog extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});}
  connectedCallback(){
    if(this.shadowRoot.firstChild)return;
    this.shadowRoot.innerHTML=`<style>
      :host{display:contents}*{box-sizing:border-box}dialog{width:min(1080px,calc(100vw - 20px));max-width:none;max-height:94dvh;margin:auto;padding:0;border:1px solid #35576e;border-radius:22px;color:#dbe9f5;background:#081522;box-shadow:0 24px 80px #0009;overflow:auto}dialog::backdrop{background:#030a12c9;backdrop-filter:blur(7px)}header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 17px 0;color:#87a8bc;font:11px system-ui,sans-serif;letter-spacing:1px}button{cursor:pointer;border:1px solid #335164;border-radius:10px;width:34px;height:34px;background:#102b3d;color:#b3d3df;font:25px system-ui,sans-serif}button:focus-visible{outline:2px solid #6cd8ef;outline-offset:2px}.content{padding:0 7px 6px}energetika-history-card{display:block}@media(max-height:500px){dialog{max-height:98dvh}header{padding-top:5px}}
    </style><dialog aria-label="История показателя"><header><span>ЭНЕРГЕТИКА / ИСТОРИЯ</span><button aria-label="Закрыть график">×</button></header><div class="content"></div></dialog>`;
    const dialog=this.shadowRoot.querySelector('dialog');
    this.shadowRoot.querySelector('button').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{this.shadowRoot.querySelector('.content').replaceChildren();this._chart=null;if(this._opener?.isConnected)this._opener.focus();});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
  }
  set hass(value){if(this._chart)this._chart.hass=value;}
  open(hass,config,opener){
    if(!this.shadowRoot.firstChild)this.connectedCallback();
    this._opener=opener;
    const chart=document.createElement('energetika-history-card');
    chart.setConfig({...config,date_selector:false});chart.hass=hass;this._chart=chart;
    const dialog=this.shadowRoot.querySelector('dialog');dialog.setAttribute('aria-label',config.title);
    this.shadowRoot.querySelector('.content').replaceChildren(chart);
    if(!dialog.open)dialog.showModal();
  }
  disconnectedCallback(){this.shadowRoot.querySelector('.content')?.replaceChildren();this._chart=null;}
}
if(!customElements.get('energetika-history-dialog'))customElements.define('energetika-history-dialog',EnergetikaHistoryDialog);
window.customCards=window.customCards||[];
window.customCards.push({type:'energetika-history-card',name:'Энергетика · История',description:'Графики потоков с масштабированием и фильтрацией телеметрии',preview:false});
