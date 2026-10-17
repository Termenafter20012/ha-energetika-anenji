/* Shared calendar and Kyiv day boundaries. No segmented date inputs. */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const dayKey=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
export function shiftDay(day,amount){const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+amount);return date.toISOString().slice(0,10);}
export function dayStart(day){
  const target=Date.parse(day+'T00:00:00Z');let time=target;
  const format=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<3;i++){const parts=Object.fromEntries(format.formatToParts(new Date(time)).map(p=>[p.type,p.value]));const local=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);time+=target-local;}
  return time;
}
export const dayBounds=day=>({start:dayStart(day),end:dayStart(shiftDay(day,1))});
export const dateLabel=day=>new Date(day+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Kyiv'});

class EnergetikaDatePicker extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._value=dayKey(Date.now());}
  connectedCallback(){if(!this.shadowRoot.firstChild)this._render();this._sync();}
  set value(value){if(/^\d{4}-\d{2}-\d{2}$/.test(value||''))this._value=value;if(this.shadowRoot.firstChild)this._sync();}
  get value(){return this._value;}
  set limits(value){this._limits=value||{};if(this.shadowRoot.firstChild)this._sync();}
  _allowed(day){return (!this._limits?.min||day>=this._limits.min)&&(!this._limits?.max||day<=this._limits.max)&&(!this._limits?.days||this._limits.days.includes(day));}
  _render(){
    this.shadowRoot.innerHTML=`<style>
      :host{display:inline-block;min-width:0;color:#dcecf6;font-family:inherit}*{box-sizing:border-box}button{font:inherit;cursor:pointer;color:inherit;touch-action:manipulation}button:disabled{opacity:.28;cursor:default}button:focus-visible{outline:2px solid #58d7ed;outline-offset:2px}.trigger{display:flex;align-items:center;justify-content:center;gap:7px;min-height:34px;padding:7px 10px;border:1px solid #335368;border-radius:9px;background:#0b1d2c;font-size:11px;white-space:nowrap}.trigger svg{width:15px;height:15px;flex-shrink:0}.calendar{position:fixed;inset:auto;margin:0;width:294px;max-width:calc(100vw - 16px);padding:12px;background:#0c2132;color:#dcecf6;border:1px solid #3d657c;border-radius:15px;box-shadow:0 15px 60px #0009;font:12px system-ui,sans-serif}.month{display:grid;grid-template-columns:32px 1fr 32px;align-items:center;gap:7px;margin-bottom:9px}.month strong{text-align:center;font-size:13px;text-transform:capitalize}.month button,.days button,.today{border:1px solid transparent;border-radius:7px;background:none;min-height:32px}.month button{font-size:20px;background:#173347}.week,.days{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.week span{text-align:center;color:#85a9bd;font-size:10px;padding:5px 0}.days button{font-size:12px;padding:5px 0}.days button:hover:enabled{background:#21455c}.days .other{color:#64879d}.days .selected{color:#c3fff0;background:#155647;border-color:#2cbd9b}.days .current{border-color:#3d738e}.today{display:block;width:100%;margin-top:9px;color:#83dfd1;background:#153747;font-size:11px}.empty{font-size:10px;color:#85a9bd;margin:7px 0 0}
    </style><button class="trigger" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="4" width="16" height="14" rx="3"/><path d="M6 2v5m8-5v5M2 9h16M6 12h2m4 0h2m-8 3h2"/></svg><span></span></button><div class="calendar" popover="auto" role="dialog" aria-label="Выбор дня"><div class="month"><button data-month="-1" aria-label="Предыдущий месяц">‹</button><strong></strong><button data-month="1" aria-label="Следующий месяц">›</button></div><div class="week">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>`<span>${d}</span>`).join('')}</div><div class="days"></div><button class="today">Сегодня</button></div>`;
    const r=this.shadowRoot,pop=r.querySelector('.calendar');
    r.querySelector('.trigger').onclick=()=>{if(pop.matches(':popover-open'))pop.hidePopover();else{this._month=this._value.slice(0,7);this._draw();pop.showPopover();const box=r.querySelector('.trigger').getBoundingClientRect();pop.style.left=Math.max(8,Math.min(innerWidth-302,box.left))+'px';pop.style.top=Math.max(8,Math.min(innerHeight-pop.offsetHeight-8,box.bottom+6))+'px';}};
    pop.addEventListener('toggle',()=>r.querySelector('.trigger').setAttribute('aria-expanded',String(pop.matches(':popover-open'))));
    r.querySelectorAll('[data-month]').forEach(button=>button.onclick=()=>{const date=new Date(this._month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+Number(button.dataset.month));this._month=date.toISOString().slice(0,7);this._draw();});
    r.querySelector('.today').onclick=()=>this._choose(dayKey(Date.now()));
    pop.addEventListener('keydown',e=>{if(e.key==='Escape')pop.hidePopover();});
  }
  _choose(day){if(!this._allowed(day))return;this._value=day;this.shadowRoot.querySelector('.calendar').hidePopover();this._sync();this.dispatchEvent(new CustomEvent('change',{detail:{value:day},bubbles:true,composed:true}));this.shadowRoot.querySelector('.trigger').focus();}
  _sync(){const r=this.shadowRoot;r.querySelector('.trigger span').textContent=dateLabel(this._value);r.querySelector('.trigger').setAttribute('aria-label',`Выбрать день: ${dateLabel(this._value)}`);if(r.querySelector('.calendar').matches(':popover-open'))this._draw();}
  _draw(){
    const r=this.shadowRoot,first=this._month+'-01',date=new Date(first+'T12:00:00Z'),offset=(date.getUTCDay()+6)%7,today=dayKey(Date.now());
    r.querySelector('.month strong').textContent=date.toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'});
    r.querySelector('.days').innerHTML=Array.from({length:42},(_,i)=>{const day=shiftDay(first,i-offset);return `<button data-date="${day}" aria-label="${esc(dateLabel(day))}" ${this._allowed(day)?'':'disabled'} ${day===this._value?'aria-current="date"':''} class="${day.slice(0,7)!==this._month?'other ':''}${day===this._value?'selected ':''}${day===today?'current':''}">${Number(day.slice(-2))}</button>`;}).join('');
    r.querySelectorAll('[data-date]').forEach(button=>button.onclick=()=>this._choose(button.dataset.date));r.querySelector('.today').disabled=!this._allowed(today);
    for(const button of r.querySelectorAll('[data-month]')){const next=new Date(first+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+Number(button.dataset.month));const month=next.toISOString().slice(0,7);button.disabled=!!(this._limits?.min&&month<this._limits.min.slice(0,7)||this._limits?.max&&month>this._limits.max.slice(0,7));}
  }
}
if(!customElements.get('energetika-date-picker'))customElements.define('energetika-date-picker',EnergetikaDatePicker);
