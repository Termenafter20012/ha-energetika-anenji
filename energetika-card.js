import './energetika-history.js?v=2.16.1';
import './energetika-settings.js?v=2.15.0';
import './energetika-automation.js?v=2.16.1';
import './energetika-data.js?v=2.13.0.1';
import './energetika-alerts.js?v=2.8.0';

export function formatRuntime(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  const total=Math.floor(minutes);
  return total===0?'0 мин':`${Math.floor(total/60)} ч ${String(total%60).padStart(2,'0')} мин`;
}
/* Energetika 2.16.1 — local Home Assistant card, no external dependencies. */
const ROOT = 'sensor.anenji_4200_protocol_1_';
const SOURCE_MODES = [
  {code:'UTI', option:'Utility First (UTI)', description:'Сеть в приоритете'},
  {code:'SOL', option:'Solar First (SOL)', description:'Солнце в приоритете'},
  {code:'SBU', option:'Solar-Battery-Utility (SBU)', description:'Солнце → АКБ → сеть'},
  {code:'SUB', option:'Solar-Utility-Battery (SUB)', description:'Солнце → сеть → АКБ'},
  {code:'SUF', option:'Solar-Utility-Feed (SUF)', description:'Солнце + сеть · возможна отдача в сеть'},
];
const escapeHtml = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ENTITIES = {
  grid_voltage: ROOT + 'grid_voltage', grid_current: 'sensor.energetika_grid_current_estimate',
  grid_present: 'binary_sensor.energetika_grid_present', dtek_status: 'sensor.energetika_dtek_status',
  solar_voltage: ROOT + 'pv_voltage', solar_current: ROOT + 'pv_current',
  load_voltage: ROOT + 'output_voltage', load_current: ROOT + 'output_current',
  runtime: 'sensor.energetika_battery_runtime_to_reserve',
  mode_select: 'select.anenji_4200_protocol_1_output_source_priority',
  output_priority: ROOT + 'output_source_priority', control_mode: ROOT + 'control_mode',
  grid: ROOT + 'grid_power', solar: ROOT + 'pv_power', load: ROOT + 'load_power',
  battery: 'sensor.energetika_battery_remaining', battery_energy: 'sensor.energetika_battery_remaining', percent: 'sensor.energetika_battery_percent_energy',
  voltage: ROOT + 'battery_voltage', voltage_min: ROOT + 'battery_under_voltage_off_grid',
  percent_voltage: 'sensor.energetika_battery_percent_voltage', inverter_percent: ROOT + 'battery_percent',
  inverter_energy: 'sensor.energetika_battery_remaining_inverter',
  pv_battery: ROOT + 'pv_to_battery_power', pv_load: ROOT + 'pv_to_home_power',
  grid_battery: ROOT + 'grid_to_battery_power', grid_load: ROOT + 'grid_to_home_power',
  battery_load: ROOT + 'battery_to_home_power', charge: 'sensor.zariadka_akb',
  discharge: 'sensor.razriadka_akb', battery_power: ROOT + 'battery_power',
  current: ROOT + 'battery_current', used: 'sensor.energetika_battery_used',
  calibration_status: 'sensor.energetika_battery_calibration_status',
};
const ICONS = {
  sun: '<circle cx="24" cy="24" r="9"/><path d="M24 2v7m0 30v7M2 24h7m30 0h7M8.5 8.5l5 5m21 21 5 5m0-31-5 5m-21 21-5 5"/>',
  grid: '<path d="M21 3h6l9 42M21 3 12 45M17 18h14M14 31h20M8 18h32M4 31h40M19 10l10 8-14 13 19 14M29 10l-10 8 14 13-19 14M9 18v7m30-7v7M5 31v6m38-6v6"/>',
  battery: '<rect x="11" y="8" width="26" height="36" rx="4"/><path d="M19 8V3h10v5M17 18h14m-14 9h14m-14 9h14"/>',
  home: '<path d="m3 23 21-19 21 19M9 20v24h12V30h8v14h10V20M33 12V5h6v13"/>',
  down: '<path d="M24 5v36M9 26l15 15 15-15"/>',
  up: '<path d="M24 43V7M9 22 24 7l15 15"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.battery}</svg>`;
const value = (key, unit = 'Вт') => `<span data-value="${key}">—</span><span class="unit">${unit}</span>`;
// Both views use the same elements, live values and graph handlers.
const VISUAL_LAYOUTS = {
  minimal:{
    size:[440,300],
    nodes:{grid:[8,0,164],solar:[268,0,164],battery:[8,154,164],load:[268,154,164]},
    flows:{grid_battery:['M54 114V154',54,134],pv_battery:['M268 54H220V135H136V154',220,105],pv_load:['M350 114V154',350,134],grid_load:['M172 54H194V125C182 125 182 145 194 145V174H268',230,174],battery_load:['M172 211H268',220,211]},
    crossing:'M194 125C182 125 182 145 194 145',
  },

};

class EnergetikaCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._entities = ENTITIES;
    this._batteryMode = 'energy';
    this._visualMode = 'minimal';
    try { this._batteryMode = localStorage.getItem('energetika.battery-mode') === 'voltage' ? 'voltage' : 'energy'; } catch {}
    try { this._visualMode = localStorage.getItem('energetika.visual-mode') === 'home' ? 'home' : 'minimal'; } catch {}
  }
  setConfig(config) {
    this.config = {...config};
    this._entities = {...ENTITIES, ...(config.entities || {})};
    if(!config.entities?.battery_energy)this._entities.battery_energy=this._entities.battery;
    this._render();
  }
  getCardSize() { return 12; }
  getGridOptions() { return {columns: 12, min_columns: 6}; }
  set hass(hass) { this._hass = hass; this._update(); }
  connectedCallback() { if (!this.shadowRoot.firstChild) this._render(); clearInterval(this._gridClock); this._gridClock=setInterval(()=>this._updateGrid(),15000); }
  disconnectedCallback() { clearTimeout(this._modeTimeout); clearInterval(this._gridClock); }
  _node(key, name, ic, x, y, w, color, unit = 'Вт') {
    const voltage=key==='battery'?'voltage':key+'_voltage',current=key==='battery'?'current':key+'_current';
    return `<div class="node ${color}" data-key="${key}" role="button" tabindex="0" aria-label="${name}: открыть историю" style="left:${x/440*100}%;top:${y/300*100}%;width:${w/440*100}%;height:38%">
      <div class="node-heading"><span class="node-symbol">${icon(ic)}${key==='grid'?'<svg class="grid-cross" viewBox="0 0 48 48" aria-hidden="true"><path d="M6 6 42 42M42 6 6 42"/></svg>':''}</span><span class="node-name">${name}</span><span class="node-chevron" aria-hidden="true">›</span></div>
      <div class="node-reading"><strong class="node-value" data-value="${key}">—</strong><span class="node-unit">${unit}</span></div>
      <div class="node-metrics"><button data-key="${voltage}" aria-label="${name}: напряжение"><span data-value="${voltage}">—</span> В</button><button data-key="${current}" aria-label="${name}: ток">${key==='grid'?'≈ ':''}<span data-value="${current}">—</span> А</button></div>
      ${key==='battery'?'<div class="node-runtime" data-runtime>До 20% · —</div>':''}${key==='grid'?'<button class="grid-timer" data-grid-timer aria-label="График отключений ДТЭК" title="Открыть график ДТЭК"><span data-grid-countdown>Срок не указан</span></button>':''}
    </div>`;
  }
  _flow(key, d, color) {
    return `<g class="flow ${color}" data-flow="${key}">${key==='grid_load'?'<path class="crossing-gap" d="M194 125C182 125 182 145 194 145"/>':''}<path class="track" d="${d}"/><path class="wire" d="${d}"/><path class="moving" d="${d}" marker-end="url(#arrow-${color})"/></g>`;
  }
  _flowLabel(key, x, y, color, label) {
    return `<button class="flow-label ${color}" data-flow="${key}" data-key="${key}" title="${label} · открыть историю" aria-label="${label}: открыть историю" style="left:${x/440*100}%;top:${y/300*100}%"><span data-value="${key}">—</span><span class="flow-unit"> Вт</span></button>`;
  }
  _tile(key, title, subtitle, ic, color) {
    return `<button class="tile ${color}" data-key="${key}" title="Открыть историю: ${title}">${icon(ic)}<span class="tile-body"><span class="tile-title">${title}</span><strong>${value(key)}</strong><small>${subtitle}</small></span><span class="arrow">›</span></button>`;
  }
  _homeNode(key, name, ic, x, y, w, color, unit = 'Вт') {
    return `<g class="node ${color}" data-key="${key}" role="button" tabindex="0" aria-label="${name}: открыть историю" transform="translate(${x} ${y})">
      <rect class="node-bg" width="${w}" height="${['battery','grid'].includes(key) ? 132 : 112}" rx="16"/>
      <svg x="12" y="22" width="38" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[ic]}</svg>
      ${key==='grid'?'<g class="grid-cross" aria-hidden="true"><path d="M10 20 53 68M53 20 10 68"/></g>':''}
      <text class="node-name" x="60" y="29">${name}</text>
      <text class="node-value" x="60" y="59" data-value="${key}">—</text>
      <text class="node-unit" x="60" y="79">${unit}</text>
      <text class="node-metrics" x="12" y="100"><tspan data-key="${key==='battery'?'voltage':key+'_voltage'}" role="button" tabindex="0" aria-label="${name}: напряжение"><tspan data-value="${key==='battery'?'voltage':key+'_voltage'}">—</tspan> В</tspan><tspan dx="13" data-key="${key==='battery'?'current':key+'_current'}" role="button" tabindex="0" aria-label="${name}: ток">${key==='grid'?'≈ ':''}<tspan data-value="${key==='battery'?'current':key+'_current'}">—</tspan> А</tspan></text>
      ${key==='battery'?'<text class="node-runtime" x="12" y="121" data-runtime>До 20% · —</text>':''}${key==='grid'?'<g class="grid-timer" data-grid-timer role="button" tabindex="0" aria-label="График отключений ДТЭК"><title data-grid-timer-title>Открыть график ДТЭК</title><rect x="8" y="108" width="158" height="18" rx="5"/><text x="14" y="121" data-grid-countdown>Срок не указан</text></g>':''}<path class="chev" d="m${w-18} 41 5 5-5 5"/>
    </g>`;
  }
  _homeFlow(key, d, x, y, color, label) {
    return `<g class="flow ${color}" data-flow="${key}"><path class="track" d="${d}"/><path class="wire" d="${d}"/><path class="moving" d="${d}" marker-end="url(#home-arrow-${color})"/>
      <g class="flow-label" data-key="${key}" role="button" tabindex="0" aria-label="${label}: открыть историю" transform="translate(${x} ${y})"><rect x="-48" y="-19" width="96" height="38" rx="12"/><text y="7" text-anchor="middle"><tspan data-value="${key}">—</tspan><tspan class="flow-unit"> Вт</tspan></text></g></g>`;
  }
  _originalHomeDiagram() {
    return `<svg class="house-diagram" viewBox="0 0 720 500" aria-label="Схема потоков энергии">
      <defs>${['solar','grid','battery'].map(c=>`<marker id="home-arrow-${c}" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 5 2.5 0 5Z" fill="var(--${c})"/></marker>`).join('')}
      <linearGradient id="roof" x2="1" y2="1"><stop stop-color="#284361"/><stop offset="1" stop-color="#0c1829"/></linearGradient><linearGradient id="window" x2="0" y2="1"><stop stop-color="#ffc65e"/><stop offset="1" stop-color="#8e5b21"/></linearGradient><radialGradient id="halo"><stop stop-color="#22a891" stop-opacity=".12"/><stop offset="1" stop-color="#081421" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="365" cy="280" rx="280" ry="150" fill="url(#halo)"/>
      <g class="scene"><path d="M170 237 348 132 552 237 518 255 348 170 205 256Z" fill="url(#roof)" stroke="#3a5871"/><path d="M207 255v118h308V254L348 170Z" fill="#102232" stroke="#2e4b61"/><path d="M210 373h315" stroke="#46616b"/><path d="m287 195 63-35 111 57-64 36Z" fill="#12314a" stroke="#487896"/><path d="m310 182 109 58m-84-72 109 59m-132-19 61-35m-33 50 62-35" stroke="#36637f" stroke-width="2"/><rect x="222" y="279" width="47" height="58" rx="2" fill="url(#window)"/><path d="M245 279v58m-23-27h47" stroke="#233e4b" stroke-width="4"/><rect x="451" y="279" width="43" height="58" rx="2" fill="url(#window)"/><path d="M472 279v58m-21-27h43" stroke="#233e4b" stroke-width="4"/><path d="M179 374h366" stroke="#2a4c50" stroke-width="3"/></g>
      ${this._homeFlow('pv_battery','M428 146V198H323V274',323,230,'solar','Солнце → АКБ')}
      ${this._homeFlow('pv_load','M540 146V218H625V274',625,238,'solar','Солнце → нагрузка')}
      ${this._homeFlow('grid_battery','M104 262V330H236',170,330,'grid','Сеть → АКБ')}
      ${this._homeFlow('grid_load','M104 262V454H616V386',357,454,'grid','Сеть → нагрузка, байпас')}
      ${this._homeFlow('battery_load','M408 330H531',469.5,330,'battery','АКБ → нагрузка')}
      <text x="357" y="489" class="route-caption">СЕТЬ → ДОМ · БАЙПАС</text>
      ${this._homeNode('grid','Сеть','grid',18,130,174,'grid')}
      ${this._homeNode('solar','Солнце','sun',395,34,205,'solar')}
      ${this._homeNode('battery','АКБ','battery',236,274,172,'battery','Вт·ч осталось')}
      ${this._homeNode('load','Нагрузка','home',531,274,174,'home')}
    </svg>`;
  }
  _applyVisualMode() {
    const r=this.shadowRoot,layout=VISUAL_LAYOUTS.minimal;
    const [boxWidth,boxHeight]=layout.size;
    r.querySelector('.shell').dataset.visual=this._visualMode;
    r.querySelector('svg.diagram').setAttribute('viewBox',`0 0 ${boxWidth} ${boxHeight}`);
    r.querySelectorAll('[data-visual-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.visualMode===this._visualMode)));
    for(const [key,[x,y,width,height=114]] of Object.entries(layout.nodes)){
      const node=r.querySelector(`.diagram-stage>.node[data-key="${key}"]`);
      node.style.left=x/boxWidth*100+'%';node.style.top=y/boxHeight*100+'%';node.style.width=width/boxWidth*100+'%';
      node.style.height=height/boxHeight*100+'%';node.style.setProperty('--node-height',height/boxHeight*100+'%');
    }
    for(const [key,[path,x,y]] of Object.entries(layout.flows)){
      const flow=r.querySelector(`svg.diagram>g.flow[data-flow="${key}"]`);
      flow.querySelectorAll('.track,.wire,.moving').forEach(line=>line.setAttribute('d',path));
      const label=r.querySelector(`.diagram-stage>.flow-label[data-flow="${key}"]`);label.style.left=x/boxWidth*100+'%';label.style.top=y/boxHeight*100+'%';
    }
    r.querySelector('.crossing-gap').setAttribute('d',layout.crossing);
  }
  _render() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>
      :host{display:block;color:#f2f6fc;font-family:var(--paper-font-body1_-_font-family,Inter,system-ui,sans-serif);--solar:#ffd65a;--grid:#38bfff;--battery:#17e6b3;--home:#bc7bff}
      *{box-sizing:border-box}button{font:inherit}button,[role=button]{-webkit-tap-highlight-color:transparent;cursor:pointer}button:focus-visible,[role=button]:focus-visible{outline:3px solid #fff;outline-offset:3px}button{color:inherit} .solar{--tone:var(--solar);color:var(--solar)}.grid{--tone:var(--grid);color:var(--grid)}.battery{--tone:var(--battery);color:var(--battery)}.home{--tone:var(--home);color:var(--home)}
      .shell{max-width:1100px;margin:8px auto 18px;border-radius:28px;padding:26px;background:radial-gradient(ellipse at 75% 8%,#15233e 0,transparent 55%),linear-gradient(145deg,#0a1524,#060e18 70%);border:1px solid #223449;box-shadow:0 12px 40px #0003;overflow:hidden}
      header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 4px 8px}h1{font-size:27px;letter-spacing:-.7px;margin:0 0 5px;font-weight:700}.eyebrow{font-size:10px;font-weight:700;color:#6989a5;letter-spacing:2px;margin-bottom:7px}.sub{color:#91a6bb;font-size:12px}.live{display:flex;align-items:center;gap:7px;border:1px solid #1e514d;background:#10312f88;border-radius:30px;padding:7px 11px;color:#64ecc9;font-size:11px;white-space:nowrap}.dot{width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}.live.offline{color:#f6c66a;border-color:#67542d;background:#3c301c88}
      .diagram{width:100%;max-width:900px;display:block;margin:auto;overflow:visible}.scene{opacity:.36}.node-bg{fill:#081522;stroke:currentColor;stroke-width:1.6}.node{filter:drop-shadow(0 0 8px color-mix(in srgb,currentColor 15%,transparent));transition:filter .2s}.node:hover{filter:drop-shadow(0 0 10px currentColor)}.node-name{font-size:17px;fill:#c2cfde;font-weight:500}.node-value{font-size:26px;fill:#f6faff;font-weight:750;font-variant-numeric:tabular-nums;letter-spacing:-.5px}.node-unit{font-size:13px;fill:#7f99ad}.chev{fill:none;stroke:currentColor;stroke-width:2;opacity:.75}.crossing-gap{fill:none;stroke:#0b1727;stroke-width:8;stroke-linecap:round}.track{fill:none;stroke:currentColor;stroke-width:3;opacity:.1;stroke-linejoin:round}.wire{fill:none;stroke:currentColor;stroke-width:2;opacity:.22;stroke-linejoin:round}.moving{fill:none;stroke:currentColor;stroke-width:3;stroke-dasharray:5 16;stroke-linecap:round;stroke-linejoin:round;opacity:0}.flow.active .wire{opacity:.7;filter:drop-shadow(0 0 5px currentColor)}.flow.active .moving{opacity:1;animation:current 1.6s linear infinite}.flow-label rect{fill:#0b1725;stroke:currentColor;stroke-opacity:.4;stroke-width:1.2}.flow-label text{fill:#c8d5e4;font-size:19px;font-weight:650;font-variant-numeric:tabular-nums}.flow.active .flow-label rect{stroke-opacity:.8}.flow.active .flow-label text{fill:#f6faff}.flow-unit{font-size:13px}.flow-label:hover rect{fill:#1b3041}.flow-label{outline:none}.route-caption{font-size:12px;fill:#68869d;letter-spacing:2px;text-anchor:middle}.section-label{font-size:10px;color:#6d8ba3;letter-spacing:1.6px;font-weight:700;margin:4px 4px 12px}.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.tile{border:1px solid color-mix(in srgb,var(--tone) 40%,#142333);border-radius:16px;background:linear-gradient(120deg,color-mix(in srgb,var(--tone) 7%,#0a1522),#0b1521);padding:16px 13px;display:flex;align-items:center;gap:11px;text-align:left;min-height:105px;transition:border-color .2s,background .2s,transform .2s}.tile:hover{border-color:var(--tone);background:color-mix(in srgb,var(--tone) 12%,#0a1522);transform:translateY(-1px)}.icon{width:32px;height:36px;flex-shrink:0;filter:drop-shadow(0 0 5px color-mix(in srgb,currentColor 30%,transparent))}.tile-body{display:flex;flex:1;min-width:0;flex-direction:column;gap:4px}.tile-title{color:#b4c7d8;font-size:12px;line-height:1.35}.tile strong{font-size:24px;line-height:1.1;color:#f4f7fd;font-weight:700;letter-spacing:-.6px;white-space:nowrap;font-variant-numeric:tabular-nums}.unit{font-size:.53em;font-weight:500;color:#97adc1;margin-left:4px;letter-spacing:0}.tile small{color:#6c849a;font-size:10px}.arrow{font-size:22px;opacity:.6}.battery-summary{display:block;cursor:default;padding:15px}.battery-title{display:flex;align-items:center;gap:8px;font-size:12px;color:#b7d1d4;margin-bottom:10px}.battery-title .icon{width:20px;height:24px}.battery-main{display:flex;align-items:baseline;justify-content:space-between;gap:6px}.plain-value{border:0;background:none;padding:0;text-align:left}.plain-value strong{font-size:25px}.capacity{font-size:10px;color:#72919d}.bar{height:4px;background:#20353c;border-radius:4px;overflow:hidden;margin:11px 0}.bar span{display:block;height:100%;width:0;background:var(--battery);transition:width 1s}.mini-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.mini{display:flex;flex-direction:column;align-items:flex-start;gap:3px;border:0;background:none;padding:0}.mini>span{font-size:9px;color:#7796a5}.mini strong{font-size:14px;letter-spacing:0;white-space:nowrap}.mini:hover strong,.plain-value:hover strong{text-decoration:underline;text-underline-offset:4px}.battery-summary{grid-column:span 1}.note{font-size:11px;line-height:1.6;color:#7690a8;margin:15px 3px 0}.calibration{display:none;padding:10px 13px;background:#49391b55;border:1px solid #6b512f;border-radius:12px;color:#ebcd93;font-size:11px;line-height:1.5;margin-top:12px}.calibration.visible{display:block}details{border-top:1px solid #213143;margin-top:16px;padding-top:12px;font-size:11px;color:#819bb0}summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;color:#90adc1}summary::after{content:'+';font-size:18px}details[open] summary::after{content:'−'}details p{line-height:1.7;max-width:780px}.calibrate{border:1px solid #2c6e60;border-radius:10px;background:#10392f;color:#74e9c3;padding:9px 13px;font-size:11px}.calibrate:disabled{opacity:.5;cursor:wait}.last-full{font-size:10px;color:#6c899d;margin-left:10px}.toast{font-size:11px;color:#a5dece;margin-top:8px;min-height:14px}footer{display:flex;justify-content:space-between;gap:10px;color:#4f6c83;font-size:9px;margin-top:16px;letter-spacing:.5px}.battery-extra{display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:9px;color:#6e909d}.battery-extra button{background:none;border:0;padding:0;color:#a0bbca;font-size:10px}.battery-extra button:hover{text-decoration:underline}
      .charge-tile>.tile{width:100%;height:100%}.flow[data-flow=battery_load] .flow-label text{font-size:16px}
      .node-metrics{font-size:11px;fill:#9bb2c7;font-variant-numeric:tabular-nums}.node-runtime{font-size:10px;fill:#60d6b7;font-variant-numeric:tabular-nums}.node-metrics [role=button]:hover{fill:white}.runtime{display:block;border:0;background:transparent;color:#67cbb3;font-size:10px;padding:7px 0 0;text-align:left;font-variant-numeric:tabular-nums}.runtime:hover{text-decoration:underline}.battery-main{flex-wrap:wrap}.runtime{grid-column:1;grid-row:3}.battery-summary .bar{grid-row:4}.battery-summary .mini-row{grid-row:2/5}.battery-summary .battery-extra{grid-row:5}
      @keyframes current{to{stroke-dashoffset:-42}}@media(prefers-reduced-motion:reduce){.flow.active .moving{animation:none}.tile,.bar span{transition:none}}
      .shell{display:block}.battery-summary{grid-column:1/-1;grid-row:4;padding:14px 17px}.battery-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.battery-title{margin:0;white-space:nowrap}.nameplate{color:#72999f;font-size:10px;margin-left:5px}.mode-switch{display:flex;border:1px solid #23534f;border-radius:8px;padding:2px;gap:2px}.mode-switch button{border:0;border-radius:5px;background:none;color:#7b9caa;padding:4px 9px;font-size:10px;white-space:nowrap}.mode-switch button[aria-pressed=true]{background:#123e38;color:#66edd0}.battery-layout{display:grid;grid-template-columns:1.4fr .8fr .8fr;gap:12px;align-items:center}.battery-main{display:block}.battery-main .plain-value strong{font-size:30px}.battery-main .capacity{display:block;font-size:10px;margin-top:2px}.battery-layout .mini strong{font-size:20px}.battery-layout .mini>span{font-size:10px}.voltage-limits{display:flex;align-items:center;gap:9px;margin-top:10px;font-size:10px;white-space:nowrap}.voltage-limits button{border:0;padding:0;background:none;font:inherit}.voltage-min{color:#ff8689}.voltage-max{color:#56e5ad}.voltage-limits .bar{flex:1;margin:0;height:5px}.battery-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:10px;color:#71929f}.battery-bottom .runtime{padding:0;font-size:10px}.battery-spec{white-space:nowrap}.battery-extra{display:none}.calibration{margin-top:8px;padding:6px 9px;font-size:10px}.note{margin:10px 0}.section-label span{display:none}details{margin-top:10px;padding-top:8px}footer{margin-top:8px}.tile small{display:none}.tile{min-height:85px}.mode-note{color:#b4bc8a}.main-status{font-size:9px;color:#b4bc8a;margin-left:auto}.battery-layout .secondary-energy{display:none}
      @media(max-width:750px){.shell{padding:15px 12px;border-radius:22px;margin:3px auto 10px}.tiles{gap:7px}.tile{padding:10px;gap:7px;min-height:73px}.tile .icon{width:23px;height:27px}.tile-title{font-size:10px}.tile strong{font-size:22px}.arrow{display:none}header{padding:0 2px 3px}h1{font-size:23px;margin:0}.sub{display:none}.eyebrow{font-size:8px;margin-bottom:4px}.live{font-size:9px;padding:6px 8px}.battery-title{font-size:11px}.nameplate{font-size:9px}.battery-summary{padding:12px}.battery-main .plain-value strong{font-size:28px}.battery-layout .mini strong{font-size:19px}}
      @media(max-width:520px){.shell{padding:11px 9px 8px;border-radius:19px}.tiles{grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.tile{position:relative;padding:7px 6px;min-height:59px;border-radius:12px;display:block}.tile>.icon{position:absolute;width:18px;height:21px;left:7px;bottom:9px}.tile-body{gap:6px}.tile-title{font-size:9px;line-height:1.2;white-space:nowrap;color:#adc4d3}.tile-body strong{font-size:20px;padding-left:22px;line-height:1.1}.tile-body strong.long-value{font-size:16px}.unit{margin-left:2px}.diagram{margin:0 auto;width:100%;max-height:255px}.section-label{font-size:8px;margin:1px 2px 6px;letter-spacing:1.3px}h1{font-size:21px}.eyebrow{font-size:7px;letter-spacing:1.5px}.live{font-size:9px}.battery-summary{display:block;grid-column:1/-1;grid-row:4;padding:9px 10px;border-radius:13px;min-height:0}.battery-top{margin-bottom:6px;gap:4px}.battery-title{font-size:11px;gap:4px}.battery-title .icon{width:15px;height:19px}.nameplate{font-size:8px;margin-left:2px}.mode-switch button{font-size:9px;padding:4px 6px}.battery-layout{grid-template-columns:1.35fr .75fr .8fr;gap:8px}.battery-main .plain-value strong{font-size:26px}.battery-main .capacity{font-size:8px;margin-top:1px}.battery-layout .mini>span{font-size:8px}.battery-layout .mini strong{font-size:18px}.voltage-limits{margin-top:7px;font-size:9px;gap:7px}.battery-bottom{margin-top:6px;font-size:8px;gap:4px}.battery-bottom .runtime{font-size:9px}.battery-spec{font-size:8px}.note{display:none}details{margin-top:7px;padding-top:4px;font-size:10px}summary::after{font-size:15px}footer{display:none}.calibration{font-size:9px;line-height:1.3;padding:4px 7px;margin-top:5px}.last-full{display:block;margin:8px 0}.main-status{font-size:8px}}
      @media(max-width:365px){.shell{padding:8px 7px}.tile-title{font-size:8px}.tile-body strong{font-size:18px}.tile{min-height:55px}.diagram{max-height:225px}.nameplate{font-size:7px}.mode-switch button{padding:4px;font-size:8px}.battery-main .plain-value strong{font-size:23px}.battery-layout .mini strong{font-size:16px}.battery-title{font-size:10px}.battery-spec{font-size:7px}.battery-layout{gap:5px}.battery-bottom .runtime{font-size:8px}}
      @media(max-width:520px) and (max-height:740px){.shell{padding-top:8px}.diagram{max-height:200px}.tile{min-height:52px;padding:6px}.tile-body{gap:4px}.battery-summary{padding:8px 9px}.battery-top{margin-bottom:4px}.voltage-limits{margin-top:5px}.battery-bottom{margin-top:4px}.calibration{font-size:8px}}
      .diagram-wrap{position:relative}.inverter-mode{position:absolute;left:5px;top:8px;z-index:4}.source-trigger{display:flex;align-items:center;gap:9px;border:1px solid #2b5972;background:#0b2032ed;border-radius:10px;padding:8px 11px;font-size:12px;color:#89a7bb;min-height:33px;box-shadow:0 3px 14px #0003}.source-trigger strong{color:#bde9ff;font-size:13px}.source-trigger .caret{color:#51b9df}.source-trigger[aria-expanded=true]{border-color:#38bfff}.mode-popover{position:absolute;left:0;top:42px;width:min(310px,calc(100vw - 36px));padding:13px;border:1px solid #335c75;border-radius:17px;background:#0b1929fa;box-shadow:0 15px 45px #000a;color:#d8e7f3;backdrop-filter:blur(16px)}.mode-popover[hidden]{display:none}.mode-heading{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:650;margin-bottom:10px}.mode-close{background:none;border:0;color:#93adbf;font-size:21px;padding:0 4px}.source-options{display:grid;gap:5px}.source-option{display:grid;grid-template-columns:44px 1fr 12px;align-items:center;gap:8px;border:1px solid #263e52;background:#101f31;border-radius:9px;padding:9px 10px;text-align:left;color:#abc1d2;font-size:11px;min-height:41px}.source-option strong{color:#e6f4ff;font-size:13px}.source-option[aria-selected=true]{border-color:#29c8c5;background:#123c3e}.source-option:disabled{cursor:default;opacity:.6}.source-option .check{color:#36dfb8}.mode-message{font-size:10px;line-height:1.5;color:#8eabbf;margin:9px 0;min-height:15px}.mode-message.error{color:#f1a094}.mode-message.success{color:#65dfb8}.mode-apply{width:100%;border:1px solid #298d9c;background:#12434e;color:#a1eff4;border-radius:9px;padding:9px;font-size:11px;font-weight:600}.mode-apply:disabled{opacity:.4;cursor:default}.mode-note{font-size:10px;line-height:1.4;color:#a6b9c7;margin:0 0 8px}.source-option small{font-size:10px;color:#83a3b7}.mode-message:empty{display:none}
      @media(max-width:520px){.inverter-mode{left:3px;top:5px}.source-trigger{font-size:10px;padding:5px 9px;gap:6px;min-height:28px;border-radius:8px}.source-trigger strong{font-size:11px}.mode-popover{top:34px;padding:11px}.source-option{padding:8px 9px;font-size:10px;min-height:39px}.mode-heading{font-size:12px}.mode-message{font-size:10px}}
      .settings-gear{position:absolute;right:5px;top:8px;z-index:3;width:34px;height:34px;display:grid;place-items:center;padding:7px;border:1px solid #33546d;border-radius:10px;background:#102439dc;color:#92b4cc;box-shadow:0 3px 14px #0003}.settings-gear:hover{color:#90e7df;border-color:#41aaa6}.settings-gear svg{width:20px;height:20px}.source-row{display:flex;align-items:center;gap:5px}.source-row .source-option{flex:1;min-width:0}.source-info{width:25px;height:25px;flex-shrink:0;padding:0;border:1px solid #3a6177;border-radius:50%;background:#153144;color:#87cddd;font:bold 14px Georgia,serif}.mode-setting-link{display:block;margin-top:9px;width:100%;padding:6px;background:none;border:0;color:#7ba9c1;font-size:10px}@media(max-width:520px){.settings-gear{right:3px;top:5px;width:29px;height:29px;padding:5px;border-radius:8px}.settings-gear svg{width:18px;height:18px}}
      energetika-alerts-panel{position:absolute;left:28%;top:8px;z-index:3}@media(max-width:520px){energetika-alerts-panel{left:34%;top:5px}}
      .grid-cross{display:none;fill:none;stroke:#ff4263;stroke-width:6;stroke-linecap:round;filter:drop-shadow(0 0 4px #ff1744)}.grid-absent .grid-cross{display:block}.grid-absent .node-bg{fill:#2c101d;stroke:#ff526f;stroke-width:2.6}.grid-absent .node-unit{fill:#ff8ca1;font-weight:750}.grid-absent .node-name{fill:#ffb4c1}
      .grid-timer rect{fill:#102432;stroke:#315367;stroke-width:.7}.grid-timer text{fill:#8ba7b9;font-size:10px;font-weight:600;font-variant-numeric:tabular-nums}.grid-timer.scheduled rect{fill:#302a16;stroke:#796232}.grid-timer.scheduled text{fill:#f0d58b}.grid-absent .grid-timer rect{fill:#401b2a;stroke:#8d4055}.grid-absent .grid-timer text{fill:#ffb5c3}.grid-timer:hover rect{stroke:#c5e3ef}
      .battery-layout{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)}.battery-summary [hidden],details [data-energy-only][hidden],details [data-voltage-only][hidden]{display:none!important}.battery-layout .mini{min-width:0}.battery-layout .mini>span{white-space:nowrap}.battery-main .plain-value strong,.battery-layout .mini strong{font-variant-numeric:tabular-nums}.battery-estimate{font-size:9px;color:#829eac}.bar.no-data{opacity:.35}

      /* Text stays in CSS pixels; only the animated wires scale with the diagram. */
      .diagram-wrap{padding-top:42px}.diagram-stage{position:relative;width:100%;max-width:620px;max-height:340px;aspect-ratio:440/300;margin:0 auto 4px}
      .diagram-stage>.diagram{position:absolute;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;pointer-events:none}
      .diagram-stage>.node{position:absolute;display:flex;flex-direction:column;gap:4px;padding:10px;border:1px solid color-mix(in srgb,var(--tone) 70%,#243b50);border-radius:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--tone) 6%,#091624),#0a1726);filter:none;box-shadow:0 4px 16px #0002;overflow:hidden;min-width:0}
      .node-heading{display:flex;align-items:center;gap:7px;min-height:22px}.node-symbol{position:relative;display:inline-flex;flex-shrink:0}.node-symbol>.icon,.node-symbol>.grid-cross{width:22px;height:22px}.node-symbol>.grid-cross{position:absolute;inset:0}
      .node-heading .node-name{color:#d8e7f2;font-size:15px;font-weight:600;line-height:1.1}.node-chevron{margin-left:auto;color:var(--tone);font-size:22px;line-height:1}
      .node-reading{display:flex;align-items:baseline;gap:5px;min-width:0}.node-reading .node-value{font-size:30px;font-weight:750;letter-spacing:-.6px;line-height:1.05;color:#f4f9ff;white-space:nowrap}.node-reading .node-unit{font-size:12px;color:#aac2d5;white-space:nowrap}
      .node>.node-metrics{display:flex;gap:10px;font-size:14px;line-height:1.25;font-weight:550;font-variant-numeric:tabular-nums}.node-metrics>button{padding:0;border:0;background:transparent;color:#b4cbdc;font:inherit;white-space:nowrap}.node-metrics>button:hover{color:#fff;text-decoration:underline}
      .node>.node-runtime{font-size:13px;color:#8ce2ca;line-height:1.2;white-space:nowrap;font-variant-numeric:tabular-nums;margin-top:auto}
      .node>.grid-timer{display:block;margin-top:auto;padding:3px 4px;border:1px solid #36566c;border-radius:6px;background:#102737;color:#b3cbdc;font-size:12px;font-weight:600;line-height:1.2;text-align:left;white-space:nowrap;min-width:0;font-variant-numeric:tabular-nums}
      .node>.grid-timer.scheduled{background:#302914;border-color:#826c36;color:#ffe09a}.diagram-stage>.node.grid-absent{border-color:#ff607d;background:linear-gradient(135deg,#311526,#1e1424);box-shadow:0 0 14px #ff426318}.grid-absent .node-name{color:#ffd2dd}.grid-absent .node-reading .node-unit{color:#ff9eb4;font-size:11px;font-weight:650}.grid-absent>.grid-timer{background:#3c1a2b;border-color:#95465c;color:#ffd1de}
      .diagram-stage>.flow-label{position:absolute;transform:translate(-50%,-50%);min-width:45px;max-width:22%;padding:4px 6px;border:1px solid color-mix(in srgb,var(--tone) 50%,#20384d);border-radius:8px;background:#0c1c2a;color:#b9cbd9;font-size:13px;font-weight:650;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;box-shadow:0 2px 7px #0004}
      .diagram-stage>.flow-label.active{color:#f5fbff;border-color:var(--tone);background:color-mix(in srgb,var(--tone) 10%,#0a1925)}.diagram-stage>.flow-label .flow-unit{font-size:10px;color:#a9becd;font-weight:500}
      energetika-alerts-panel{left:50%;transform:translateX(-50%)}
      @media(max-width:750px){.diagram-wrap{padding-top:36px}.diagram-stage{max-width:500px;min-height:270px}.diagram-stage>.node{padding:6px;gap:2px;border-radius:13px}.node-heading{gap:5px;min-height:18px}.node-heading .node-name{font-size:13px}.node-symbol>.icon,.node-symbol>.grid-cross{width:18px;height:18px}.node-reading .node-value{font-size:25px}.node-reading .node-unit{font-size:11px}.node>.node-metrics{font-size:14px;gap:6px}.node>.node-runtime{font-size:13px}.node>.grid-timer{font-size:12px;padding:2px 3px}.diagram-stage>.flow-label{font-size:12px;padding:4px 5px}.grid-absent .node-reading .node-unit{font-size:10px}}
      @media(max-width:390px){.diagram-stage>.node{padding:5px;gap:2px}.node-heading .node-name{font-size:12px}.node-reading .node-value{font-size:23px}.node>.node-metrics{font-size:13px;gap:6px}.node>.node-runtime{font-size:12px}.node>.grid-timer{font-size:11.5px}.node-symbol>.icon,.node-symbol>.grid-cross{width:18px;height:18px}.diagram-stage>.flow-label{min-width:41px;padding:4px;font-size:11px}}
      .node.grid-absent>.grid-timer.scheduled{background:#3c1a2b;border-color:#95465c;color:#ffd1de}
      .shell>header,.first-screen>header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin:0;text-align:left}.energy-heading{position:static;display:flex;flex-direction:column;align-items:flex-start;min-width:0;text-align:left}.energy-heading h1{margin-left:0;transform:none;white-space:nowrap}.energy-heading .eyebrow{margin-left:0;transform:none}

      /* Keep the portrait arrangement; give wider screens their own two-column layout. */
      .diagram-wrap{padding-top:0}.diagram-toolbar{position:relative;height:42px}.first-screen,.overview,.flow-panel{min-width:0}.flow-panel{margin:0}.overview>.battery-summary{margin-top:10px}.overview-actions{min-width:0}
      @media(max-width:750px){.diagram-toolbar{height:36px}.overview>.battery-summary{margin-top:5px}}
      @media(min-width:800px), (orientation:landscape) and (min-width:640px) and (max-height:600px){
        .shell{position:relative;max-width:none;margin:4px 8px 12px;padding:14px;border-radius:22px}.shell>header,.first-screen>header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:0 2px 8px;margin:0}.first-screen>header h1{font-size:25px;line-height:1.1;margin:0}.first-screen>header .eyebrow{font-size:8px;line-height:1.2;margin-bottom:4px}.first-screen>header .sub{display:none}
        .overview{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);grid-template-rows:auto auto;gap:10px 16px;align-items:stretch}.overview>.diagram-wrap{grid-column:1;grid-row:1;min-width:0;min-height:0}.diagram-toolbar{height:36px}.diagram-toolbar .inverter-mode,.diagram-toolbar .settings-gear,.diagram-toolbar energetika-alerts-panel{top:0}.diagram-stage{height:clamp(280px,38dvh,340px);min-height:0;max-height:none;max-width:none;aspect-ratio:auto;margin-bottom:0}
        .diagram-stage>.node{padding:8px;gap:3px}.node-heading{min-height:20px}.node-reading .node-value{font-size:28px}.node>.node-metrics{font-size:14px;gap:9px}.node>.node-runtime{font-size:13px}.node>.grid-timer{font-size:12px}
        .flow-panel{grid-column:2;grid-row:1;display:flex;flex-direction:column;min-height:0}.flow-panel>.section-label{font-size:10px;margin:8px 0 8px;line-height:20px}.flow-panel>.tiles{flex:1;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(0,1fr);gap:7px;min-height:0}.flow-panel .tile{min-height:0;padding:9px 10px;gap:9px;border-radius:13px}.flow-panel .tile>.icon{width:24px;height:28px}.flow-panel .tile-title{font-size:12px;white-space:normal}.flow-panel .tile strong{font-size:27px;line-height:1.1;padding-left:0}.flow-panel .tile-body{gap:4px}.flow-panel .tile .arrow{display:none}
        .overview>.battery-summary{grid-column:1/-1;grid-row:2;margin:0;padding:10px 14px}.battery-top{margin-bottom:6px}.battery-main .plain-value strong{font-size:30px}.battery-layout{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)}.battery-layout .mini strong{font-size:23px}.voltage-limits{margin-top:7px}.battery-bottom{margin-top:6px}
        .note,footer{display:none}.overview-actions{display:flex;align-items:flex-start;gap:12px;margin-top:8px}.overview-actions>details{flex:1;min-width:0;margin:0;padding-top:6px}.overview-actions>energetika-automation-panel,.overview-actions>energetika-data-panel{flex:1;min-width:0;margin-top:0}
      }
      @media(min-width:1400px) and (min-height:601px){.flow-panel>.tiles{grid-template-columns:repeat(3,minmax(0,1fr))}.flow-panel .tile strong{font-size:32px}.flow-panel .tile-title{font-size:13px}.overview{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:12px 20px}.shell{padding:18px}}
      @media(min-width:800px) and (max-height:760px) and (min-height:601px){.shell{padding:10px 12px}.diagram-stage>.node{padding:6px;gap:2px}.node-heading{min-height:18px}.node-symbol>.icon,.node-symbol>.grid-cross{width:18px;height:18px}.node-heading .node-name{font-size:13px}.node-reading .node-value{font-size:25px}.flow-panel .tile{padding:7px 9px}.flow-panel .tile-title{font-size:11px}.flow-panel .tile strong{font-size:24px}.first-screen>header h1{font-size:23px}}
      @media(orientation:landscape) and (min-width:640px) and (max-height:600px){
        .shell{margin:3px 5px 10px;padding:6px 8px;border-radius:15px;overflow:visible}.first-screen{height:calc(100dvh - 72px);min-height:296px;display:flex;flex-direction:column;gap:5px}.first-screen>header{display:block;min-height:26px;padding:0 310px 0 1px}.first-screen>header h1{font-size:19px;line-height:26px}.first-screen>header .eyebrow,.first-screen>header .live{display:none}
        .overview{flex:1;min-height:0;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) 72px;gap:6px 12px}.overview>.diagram-wrap{position:static}.diagram-toolbar{position:absolute;right:8px;top:5px;width:300px;height:28px;z-index:5}.diagram-toolbar .inverter-mode{left:0;top:0}.diagram-toolbar .settings-gear{right:0;top:0;width:28px;height:28px;padding:5px}.diagram-toolbar energetika-alerts-panel{top:0}.diagram-toolbar .source-trigger{min-height:28px;padding:5px 8px;font-size:10px}.diagram-toolbar .source-trigger strong{font-size:11px}.diagram-toolbar .mode-popover{top:32px}
        .diagram-stage{height:100%;min-height:0;max-height:none;max-width:none;aspect-ratio:auto}.diagram-stage>.node{height:42%!important;padding:4px;gap:1px;border-radius:10px}.node-heading{min-height:16px;gap:4px}.node-heading .node-name{font-size:12px}.node-symbol>.icon,.node-symbol>.grid-cross{width:16px;height:16px}.node-reading{gap:3px}.node-reading .node-value{font-size:22px;line-height:1.05}.node-reading .node-unit{font-size:10px}.node>.node-metrics{font-size:13px;line-height:1.15;gap:6px}.node>.node-runtime{font-size:11.5px;line-height:1.15}.node>.grid-timer{font-size:11px;line-height:1.15;padding:1px 3px}.diagram-stage>.flow-label{min-width:39px;padding:3px 4px;font-size:11px;border-radius:6px}.diagram-stage>.flow-label .flow-unit{font-size:9px}
        .flow-panel>.section-label{font-size:8px;letter-spacing:1px;line-height:12px;margin:0 0 3px}.flow-panel>.tiles{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));grid-auto-rows:auto;gap:4px}.flow-panel .tile{display:block;position:relative;padding:4px 5px;border-radius:9px}.flow-panel .tile>.icon{position:absolute;left:5px;bottom:6px;width:16px;height:18px}.flow-panel .tile-body{height:100%;justify-content:space-between;gap:2px}.flow-panel .tile-title{font-size:10px;line-height:1.1;white-space:normal}.flow-panel .tile strong{font-size:21px;padding-left:20px;line-height:1.05}.flow-panel .tile strong.long-value{font-size:17px}
        .overview>.battery-summary{padding:5px 8px;display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1.4fr) minmax(170px,1fr);grid-template-rows:minmax(0,1fr) auto;gap:2px 10px;border-radius:11px;min-height:0;line-height:1.1}.battery-main .plain-value{display:block;line-height:1}.battery-top{grid-column:1;grid-row:1/3;flex-direction:column;align-items:flex-start;justify-content:center;gap:3px;margin:0}.battery-title{font-size:11px;gap:4px}.battery-title .icon{width:16px;height:18px}.nameplate{font-size:8px;margin-left:2px}.mode-switch{padding:1px}.mode-switch button{font-size:9px;padding:3px 6px}.battery-layout{grid-column:2;grid-row:1;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:7px;align-items:center}.battery-main .plain-value strong{font-size:25px;line-height:1}.battery-main .capacity{font-size:8px;margin-top:1px}.battery-layout .mini>span{font-size:8px}.battery-layout .mini strong{font-size:18px}.voltage-limits{grid-column:2;grid-row:2;font-size:8px;gap:5px;margin:0}.voltage-limits .bar{height:4px}.battery-bottom{grid-column:3;grid-row:1/3;flex-direction:column;align-items:flex-end;justify-content:center;gap:4px;margin:0;font-size:8px}.battery-bottom .runtime{font-size:11px}.battery-spec{font-size:8px}.battery-estimate{font-size:9px;text-align:right}.overview-actions{margin-top:8px;gap:10px}.overview-actions>details{font-size:10px}.note,footer{display:none}
      }
      @media(orientation:landscape) and (min-width:640px) and (max-height:380px){.first-screen{height:calc(100dvh - 68px);min-height:280px;gap:4px}.overview{grid-template-rows:minmax(0,1fr) 66px;gap:4px 10px}.first-screen>header{min-height:24px}.first-screen>header h1{font-size:18px;line-height:24px}.diagram-stage>.node{padding:3px}.node-heading{min-height:14px}.node-symbol>.icon,.node-symbol>.grid-cross{width:14px;height:14px}.node-heading .node-name{font-size:11px}.node-reading .node-value{font-size:21px}.node>.node-metrics{font-size:12px}.node>.node-runtime{font-size:11px}.node>.grid-timer{font-size:10.5px}.flow-panel .tile-title{font-size:9px}.flow-panel .tile strong{font-size:19px}.overview>.battery-summary{padding:4px 7px}.battery-main .plain-value strong{font-size:23px}.battery-top{gap:2px}.mode-switch button{padding:2px 5px}}
      .header-tools{display:flex;align-items:center;justify-content:flex-end;gap:10px;min-width:0}.visual-switch{display:flex;gap:2px;padding:3px;border:1px solid #2c4b61;border-radius:10px;background:#091a29;flex-shrink:0}.visual-switch button{display:flex;align-items:center;justify-content:center;gap:5px;min-height:29px;padding:4px 10px;border:0;border-radius:7px;background:transparent;color:#89a8bc;font-size:11px;white-space:nowrap;touch-action:manipulation}.visual-switch button svg{width:14px;height:14px;flex-shrink:0}.visual-switch button[aria-pressed=true]{color:#d9fff4;background:#17443f;box-shadow:inset 0 0 0 1px #2a7968}.visual-switch button:hover{color:#e2fff6}
      @media(max-width:750px){.header-tools{gap:6px}.header-tools .live{width:19px;height:19px;justify-content:center;padding:0}.header-tools [data-live-text]{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.visual-switch{padding:2px;border-radius:8px}.visual-switch button{min-height:27px;padding:3px 7px;font-size:10px;gap:4px}.visual-switch button svg{width:12px;height:12px}}
      @media(max-width:390px){.header-tools{gap:4px}.visual-switch button{padding:3px 5px;gap:3px}.visual-switch button svg{display:none}}
      @media(orientation:landscape) and (min-width:640px) and (max-height:600px){.header-tools{position:absolute;top:5px;left:145px;right:auto;gap:0}.header-tools .live{display:none}.visual-switch{padding:1px;border-radius:7px}.visual-switch button{min-height:24px;padding:2px 7px;font-size:10px;gap:4px}.visual-switch button svg{width:12px;height:12px}}
      .original-home-stage{display:none;position:absolute;inset:0}.house-diagram{display:block;width:100%;height:100%;overflow:visible}.shell[data-visual=home] .original-home-stage{display:block}.shell[data-visual=home] .diagram-stage>.diagram,.shell[data-visual=home] .diagram-stage>.node,.shell[data-visual=home] .diagram-stage>.flow-label,.shell[data-visual=home] .house-scene{display:none}.shell[data-visual=home] .diagram-stage{height:auto;min-height:0;aspect-ratio:720/500;background:none}.house-diagram .node-name{font-size:17px}.house-diagram .node-value{font-size:26px}.house-diagram .node-unit{font-size:13px}.house-diagram .node-metrics{font-size:11px}.house-diagram .node-runtime{font-size:10px}.house-diagram .flow-label text{font-size:19px}.house-diagram .flow-unit{font-size:13px}
      .shell[data-visual=home] .house-diagram .node>.node-metrics{display:inline;font-size:11px}.shell[data-visual=home] .house-diagram .node>.node-runtime{font-size:10px}.shell[data-visual=home] .house-diagram .grid-timer{display:inline}.shell[data-visual=home] .house-diagram .flow-label .flow-unit{font-size:13px}
      @media(min-width:800px){.shell[data-visual=home] .diagram-stage{height:clamp(280px,38dvh,340px);aspect-ratio:auto}}
      @media(orientation:landscape) and (min-width:640px) and (max-height:600px){.shell[data-visual=home] .diagram-stage{height:100%;min-height:0;aspect-ratio:auto}}
    </style>
    <ha-card class="shell"><div class="first-screen"><header><div class="energy-heading"><div class="eyebrow">МОЙ ДОМ · ANENJI 4200</div><h1>Энергетика</h1><div class="sub">Солнце, сеть и энергия вашего дома</div></div><div class="header-tools"><div class="visual-switch" role="group" aria-label="Вид энергомониторинга"><button data-visual-mode="minimal" aria-pressed="true" title="Крупные плитки и простая схема"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="2" y="2" width="4" height="4" rx="1"/><rect x="10" y="2" width="4" height="4" rx="1"/><rect x="2" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/></svg>Минимализм</button><button data-visual-mode="home" aria-pressed="false" title="Дом и анимированные потоки энергии"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="m1 7 7-6 7 6M3 6v9h4v-5h3v5h3V6"/></svg>Дом</button></div><span class="live" data-live><span class="dot"></span><span data-live-text>Подключение</span></span></div></header>
    <div class="overview">
    <div class="diagram-wrap"><div class="diagram-toolbar"><energetika-alerts-panel></energetika-alerts-panel><button class="settings-gear" data-settings-open aria-label="Настройки инвертора" title="Настройки инвертора"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 3-.6 2.1-1.5.9-2.1-.5-2 3.5 1.5 1.6v1.8L2.8 14l2 3.5 2.1-.5 1.5.9L9 20h4l.6-2.1 1.5-.9 2.1.5 2-3.5-1.5-1.6v-1.8L19.2 9l-2-3.5-2.1.5-1.5-.9L13 3Z"/><circle cx="11" cy="11.5" r="3.2"/></svg></button><div class="inverter-mode"><button class="source-trigger" data-source-open aria-haspopup="dialog" aria-expanded="false"><span>Режим</span><strong data-source-current>—</strong><span class="caret">⌄</span></button><div class="mode-popover" data-source-popover role="dialog" aria-label="Режим питания инвертора" hidden><div class="mode-heading">Приоритет питания<button class="mode-close" data-source-close aria-label="Закрыть выбор режима">×</button></div><div class="source-options" data-source-options role="group" aria-label="Доступные режимы"></div><div class="mode-message" data-source-message role="status"></div><p class="mode-note" data-source-note hidden>Переключение изменит источник питания дома.</p><button class="mode-apply" data-source-apply disabled>Применить режим</button><button class="mode-setting-link" data-settings-link>Все настройки инвертора →</button></div></div>
    </div><div class="diagram-stage">
    <div class="original-home-stage">${this._originalHomeDiagram()}</div>
    <svg class="diagram" viewBox="0 0 440 300" preserveAspectRatio="none" aria-label="Направления потоков энергии">
      <defs>${['solar','grid','battery'].map(c=>`<marker id="arrow-${c}" markerWidth="4" markerHeight="4" refX="3.5" refY="2" orient="auto"><path d="M0 0 4 2 0 4Z" fill="var(--${c})"/></marker>`).join('')}</defs>
      ${this._flow('grid_battery','M54 114V154','grid')}
      ${this._flow('pv_battery','M268 54H220V135H136V154','solar')}
      ${this._flow('pv_load','M350 114V154','solar')}
      ${this._flow('grid_load','M172 54H194V125C182 125 182 145 194 145V174H268','grid')}
      ${this._flow('battery_load','M172 211H268','battery')}
    </svg>
      ${this._node('grid','Сеть','grid',8,0,164,'grid')}
      ${this._node('solar','Солнце','sun',268,0,164,'solar')}
      ${this._node('battery','АКБ','battery',8,154,164,'battery','Вт·ч')}
      ${this._node('load','Нагрузка','home',268,154,164,'home')}
      ${this._flowLabel('grid_battery',54,134,'grid','Сеть → АКБ')}
      ${this._flowLabel('pv_battery',220,105,'solar','Солнце → АКБ')}
      ${this._flowLabel('pv_load',350,134,'solar','Солнце → нагрузка')}
      ${this._flowLabel('battery_load',220,211,'battery','АКБ → нагрузка')}
      ${this._flowLabel('grid_load',230,174,'grid','Сеть → нагрузка, байпас')}
    </div></div>
    <section class="flow-panel"><div class="section-label">ПОТОКИ МОЩНОСТИ <span style="color:#3f5e76">/ НАЖМИТЕ НА ЧИСЛО ДЛЯ ИСТОРИИ</span></div>
    <div class="tiles">
      ${this._tile('load','Нагрузка · всего','Потребление дома','home','home')}
      ${this._tile('pv_load','Солнце → нагрузка','Солнечная энергия для дома','sun','solar')}
      ${this._tile('pv_battery','Солнце → АКБ','Заряд от солнечных панелей','sun','solar')}
      ${this._tile('grid','Сеть · всего','Общий забор из сети','grid','grid')}
      ${this._tile('grid_load','Сеть → нагрузка','Питание через байпас','grid','grid')}
      ${this._tile('grid_battery','Сеть → АКБ','Заряд от электросети','up','grid')}
      <button class="tile battery" data-key="voltage" title="История напряжения аккумулятора">${icon('battery')}<span class="tile-body"><span class="tile-title">Напряжение АКБ</span><strong>${value('voltage','В')}</strong></span></button>
      ${this._tile('battery_load','АКБ → нагрузка','Разряд аккумулятора в дом','down','battery')}
      ${this._tile('charge','Заряд АКБ · всего','Сеть + солнце','up','battery')}
    </div></section>
      <div class="tile battery battery-summary">
        <div class="battery-top"><div class="battery-title">${icon('battery')}АКБ <span class="nameplate" data-battery-nameplate>2560 Вт·ч</span></div><div class="mode-switch" role="group" aria-label="Способ оценки заряда"><button data-mode="energy" aria-pressed="true">Энергия</button><button data-mode="voltage" aria-pressed="false">По напряжению</button></div></div>
        <div class="battery-layout"><div class="battery-main"><button class="plain-value" data-primary data-key="battery" title="История оставшейся энергии"><strong><span data-primary-value>—</span><span class="unit" data-primary-unit>Вт·ч</span></strong></button><span class="capacity" data-mode-caption>из 2560 Вт·ч</span></div><button class="mini" data-secondary data-key="percent"><span data-secondary-label>По энергии</span><strong><span data-secondary-value>—</span><span class="unit">%</span></strong></button></div>
        <div class="voltage-limits"><button data-limit-min data-key="battery" title="История оставшейся энергии">0 Вт·ч</button><div class="bar" data-battery-meter role="meter" aria-label="Оставшаяся энергия АКБ" aria-valuemin="0" aria-valuemax="2560"><span data-battery-bar></span></div><button class="voltage-max" data-limit-max data-key="battery" title="Полная номинальная энергия АКБ">2560 Вт·ч</button></div>
        <div class="battery-bottom"><button class="runtime" data-key="runtime" data-energy-only title="По учёту энергии и текущему разряду АКБ"><span data-runtime>До 20% · —</span></button><span class="battery-estimate" data-voltage-only hidden>Линейная оценка · зависит от нагрузки</span><span class="battery-spec" data-battery-spec title="Подтверждённый предел разряда 100 А">Разряд ≤100 А · 2,56 кВт ном.</span></div>
      </div>
    </div></div>

    <div class="note">Стрелки движутся в направлении передачи энергии. Ток сети ≈ P/U (оценка активного тока). Таймер — по текущему разряду до резерва 20%, при смене нагрузки пересчитывается. Распределение потоков — расчёт интеграции инвертора; разница с нагрузкой может включать потери и собственное потребление.</div>
    <div class="overview-actions"><details><summary>Об аккумуляторе <span class="main-status" data-main-status></span></summary><div data-voltage-only hidden><p>В режиме «По напряжению» слева показано текущее напряжение АКБ, справа — линейная оценка заряда в процентах. Шкала заполняется от нижнего порога автономной работы из настроек инвертора до 29,0 В. Красная граница — нижний порог, зелёная — верхний.</p><p>Оценка зависит от нагрузки и не является точным показанием BMS. При недоступном напряжении или неверных границах процент не рассчитывается.</p><p>Штатная оценка инвертора: <button class="plain-value" data-key="inverter_percent"><span data-value="inverter_percent">—</span>%</button>.</p></div><div data-energy-only><div class="calibration" data-calibration></div><p>Режим «Энергия» — остаток по мощности и времени. Режим «По напряжению» — линейная оценка от нижнего порога автономной работы до 29,0 В: она зависит от нагрузки и не меняет счётчик Вт·ч. Выбор сохраняется на этом устройстве. Таймер в режиме «Энергия» рассчитан по учтённой энергии. Максимальный разряд АКБ — 100 А, номинально 2,56 кВт при 25,6 В; доступная мощность на выходе AC ниже из-за потерь.</p><p>Штатная оценка инвертора: <button class="plain-value" data-key="inverter_percent"><span data-value="inverter_percent">—</span>%</button> · <button class="plain-value" data-key="inverter_energy"><span data-value="inverter_energy">—</span> Вт·ч</button>.</p><p>Номинальная энергия — <b>2560 Вт·ч</b>. Счётчик складывает энергию заряда и вычитает энергию разряда: мощность × время. Например, 500 Вт в течение часа — 500 Вт·ч. Напряжение и процент инвертора показаны отдельно и не пересчитывают этот остаток. Значение сохраняется на сервере и считается при закрытой панели.</p><p>После подтверждённого полного заряда остаток устанавливается в 2560 Вт·ч. Автокалибровка: верхнее напряжение держалось минуту, затем малый чистый ток (до 2 А) и мощность по модулю до 60 Вт держатся 5 минут. Поддерживающее напряжение учитывается только после верхнего в том же цикле, без устойчивого разряда мощнее 60 Вт. Малый ток может быть положительным или отрицательным: например, −1,4 А и −39 Вт после заряда не сбрасывают ожидание. Потеря свежих данных более 2 минут, отключение АКБ или изменение Bulk/Float отменяют сохранённый признак. Один малый ток при 27,2 В не подтверждает полный заряд. В режиме «Энергия» шкала показывает оставшиеся Вт·ч из 2560; в режиме «По напряжению» — положение напряжения между нижним порогом и 29,0 В. Это оценка полного заряда, поскольку сигнала BMS нет. Кнопку используйте только когда уверены, что аккумулятор заряжен полностью.</p><button class="calibrate" data-calibrate>АКБ полностью заряжена</button><span class="last-full" data-last-full></span><p class="last-full" data-calibration-status role="status"></p><div class="toast" role="status" data-toast></div></div></details>
    <energetika-automation-panel></energetika-automation-panel><energetika-data-panel></energetika-data-panel></div><footer><span>ЛОКАЛЬНЫЙ МОНИТОРИНГ</span><span data-updated>Ожидание данных</span></footer><energetika-settings-panel></energetika-settings-panel><energetika-history-dialog></energetika-history-dialog></ha-card>`;
    root.querySelectorAll('[data-key]').forEach(el=>{
      const open = e=>{e.stopPropagation();this._moreInfo(el.dataset.key,el);};
      el.addEventListener('click',open);
      if (el.tagName.toLowerCase() !== 'button') el.addEventListener('keydown',e=>{if(e.target===el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open(e);}});
    });
    root.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
      this._batteryMode=button.dataset.mode;
      try { localStorage.setItem('energetika.battery-mode',this._batteryMode); } catch {}
      this._update();
    }));
    root.querySelectorAll('[data-visual-mode]').forEach(button=>button.addEventListener('click',()=>{
      this._visualMode=button.dataset.visualMode;
      try {localStorage.setItem('energetika.visual-mode',this._visualMode);} catch {}
      this._applyVisualMode();
      this._update();
    }));
    this._applyVisualMode();
    const openDtek=event=>{event.stopPropagation();const panel=root.querySelector('energetika-data-panel');panel.hass=this._hass;panel.open('dtek');};
    root.querySelectorAll('[data-grid-timer]').forEach(timer=>{
      timer.addEventListener('click',openDtek);
      if(timer.tagName.toLowerCase()!=='button')timer.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openDtek(event);}});
    });
    root.querySelector('energetika-alerts-panel').configure({entity:this.config?.alerts_entity,script:this.config?.alerts_script});
    const settings=root.querySelector('energetika-settings-panel');
    settings.configure({prefix:this.config?.settings_prefix||this._entities.mode_select.split('.')[1].replace(/output_source_priority$/,''),control:this._entities.control_mode});
    root.querySelectorAll('[data-settings-open],[data-settings-link]').forEach(button=>button.addEventListener('click',()=>{this._closeSourceMenu(false);settings.hass=this._hass;settings.open();}));
    settings.addEventListener('energetika-setting-pending',event=>{this._settingsPending=event.detail.pending;this._updateSourceMode();});
    root.querySelector('[data-source-open]').addEventListener('click',()=>this._toggleSourceMenu());
    root.querySelector('[data-source-close]').addEventListener('click',()=>this._closeSourceMenu());
    root.querySelector('[data-source-apply]').addEventListener('click',()=>this._applySourceMode());
    root.addEventListener('keydown',event=>{if(event.key==='Escape')this._closeSourceMenu();});
    root.addEventListener('click',event=>{if(!event.composedPath().includes(root.querySelector('.inverter-mode')))this._closeSourceMenu(false);},true);
    root.querySelector('[data-calibrate]').addEventListener('click',()=>this._calibrate());
    this._update();
  }
  _number(key) {
    const s = this._hass?.states[this._entities[key]];
    if (!s || ['unknown','unavailable',''].includes(s.state)) return null;
    const n = Number(s.state);
    const bounds={load:[0,8400],solar:[0,5400],grid:[-11000,11000],battery_power:[-8400,8400],charge:[0,8400],discharge:[0,8400],battery:[0,2560],percent:[0,100],percent_voltage:[0,100],voltage_min:[1,39],voltage:[0,40]};
    const limit=bounds[key]||(['pv_battery','pv_load','grid_battery','grid_load','battery_load'].includes(key)?[0,11000]:null);
    return Number.isFinite(n)&&(!limit||(n>=limit[0]&&n<=limit[1])) ? n : null;
  }
  _update() {
    if (!this._hass || !this.shadowRoot.firstChild) return;
    const r = this.shadowRoot, states = this._hass.states;
    r.querySelector('energetika-alerts-panel').hass=this._hass;
    r.querySelector('energetika-settings-panel').hass=this._hass;
    r.querySelector('energetika-automation-panel').hass=this._hass;
    r.querySelector('energetika-data-panel').hass=this._hass;
    r.querySelector('energetika-history-dialog').hass=this._hass;
    this._updateSourceMode();
    this._updateGrid();
    r.querySelectorAll('[data-value]').forEach(el=>{
      const key=el.dataset.value,n=this._number(key);
      const digits=/voltage|current|percent/.test(key)?1:0;
      const str=n===null?'—':n.toLocaleString('ru-RU',{minimumFractionDigits:/voltage|current/.test(key)?1:0,maximumFractionDigits:digits});
      if(el.textContent!==str)el.textContent=str;
      el.closest('.tile-body strong')?.classList.toggle('long-value',Math.abs(n??0)>=10000);
    });
    r.querySelectorAll('[data-flow]').forEach(el=>el.classList.toggle('active',(this._number(el.dataset.flow)??0)>3));
    const voltageMode=this._batteryMode==='voltage';
    r.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===this._batteryMode)));
    const remaining=this._number('battery'),voltage=this._number('voltage'),low=this._number('voltage_min'),high=29;
    const energyPct=remaining===null?null:remaining/2560*100;
    const voltagePct=voltage!==null&&low!==null&&low<high?Math.min(100,Math.max(0,(voltage-low)/(high-low)*100)):null;
    const primaryKey=voltageMode?'voltage':'battery_energy',secondaryKey=voltageMode?'percent_voltage':'percent';
    const primary=voltageMode?voltage:remaining,pct=voltageMode?voltagePct:energyPct;
    const format=(n,digits=0)=>n===null?'—':n.toLocaleString('ru-RU',{minimumFractionDigits:digits,maximumFractionDigits:digits});
    r.querySelector('[data-primary]').dataset.key=primaryKey;
    r.querySelector('[data-primary]').title=voltageMode?'История напряжения аккумулятора':'История оставшейся энергии';
    r.querySelector('[data-primary-value]').textContent=format(primary,voltageMode?1:0);
    r.querySelector('[data-primary-unit]').textContent=voltageMode?'В':'Вт·ч';
    r.querySelector('[data-mode-caption]').textContent=voltageMode?'Напряжение аккумулятора':'из 2560 Вт·ч';
    r.querySelector('[data-battery-nameplate]').textContent=voltageMode?'25,6 В · 100 А·ч':'2560 Вт·ч';
    r.querySelector('[data-secondary]').dataset.key=secondaryKey;
    r.querySelector('[data-secondary-label]').textContent=voltageMode?'По напряжению':'По энергии';
    r.querySelector('[data-secondary-value]').textContent=pct===null?'—':pct.toLocaleString('ru-RU',{maximumFractionDigits:1});
    r.querySelectorAll('[data-energy-only]').forEach(el=>el.hidden=voltageMode);
    r.querySelectorAll('[data-voltage-only]').forEach(el=>el.hidden=!voltageMode);
    r.querySelector('[data-main-status]').hidden=voltageMode;
    r.querySelector('[data-battery-spec]').textContent=voltageMode?'Разряд ≤100 А':'Разряд ≤100 А · 2,56 кВт ном.';
    const minimum=voltageMode?low:0,maximum=voltageMode?high:2560,unit=voltageMode?'В':'Вт·ч';
    const minLabel=r.querySelector('[data-limit-min]'),maxLabel=r.querySelector('[data-limit-max]');
    minLabel.textContent=`${format(minimum,voltageMode?1:0)} ${unit}`;
    maxLabel.textContent=`${format(maximum,voltageMode?1:0)} ${unit}`;
    minLabel.classList.toggle('voltage-min',voltageMode);
    minLabel.dataset.key=voltageMode?'voltage_min':'battery_energy';maxLabel.dataset.key=primaryKey;
    minLabel.title=voltageMode?'Нижний порог автономной работы · открыть историю':'Нулевая учтённая энергия · открыть историю';
    maxLabel.title=voltageMode?'Верхняя граница оценки: 29,0 В · история напряжения':'Полная номинальная энергия АКБ · открыть историю';
    r.querySelector('[data-battery-bar]').style.width=`${Math.min(100,Math.max(0,pct??0))}%`;
    const meter=r.querySelector('[data-battery-meter]');
    meter.classList.toggle('no-data',pct===null);
    meter.setAttribute('aria-label',voltageMode?'Оценка заряда АКБ по напряжению':'Оставшаяся энергия АКБ');
    meter.setAttribute('aria-valuemin',String(minimum!==null&&minimum<maximum?minimum:0));meter.setAttribute('aria-valuemax',String(maximum));
    if(pct===null)meter.removeAttribute('aria-valuenow');else meter.setAttribute('aria-valuenow',String(Math.min(maximum,Math.max(minimum,primary))));
    meter.setAttribute('aria-valuetext',pct===null?'Нет данных':`${format(primary,voltageMode?1:0)} ${unit} · ${pct.toFixed(1)}%`);
    meter.title=pct===null?'Нет данных для выбранного способа оценки':voltageMode?`Напряжение: ${format(voltage,1)} В · границы ${format(low,1)}–29,0 В · ${format(pct,1)}%`:`Остаток энергии: ${format(remaining)} Вт·ч · ${format(pct,1)}%`;
    const connected=this._hass.connected!==false && ['grid','solar','load','voltage'].every(k=>this._number(k)!==null);
    r.querySelector('[data-live]').classList.toggle('offline',!connected);
    r.querySelector('[data-live-text]').textContent=connected?'В реальном времени':'Нет данных';
    r.querySelector('[data-live]').title=connected?'Данные в реальном времени':'Нет свежих данных';
    const minutes=this._number('runtime');
    const power=this._number('battery_power');
    const timeText=minutes!==null?formatRuntime(minutes):power!==null&&power>5?'Идёт заряд':power!==null&&Math.abs(power)<=5?'Нет разряда':'Нет данных';
    r.querySelectorAll('[data-runtime]').forEach(el=>el.textContent=minutes!==null?`${this._visualMode==='home'&&el.closest('.node')?'20%':'До 20%'} · ${timeText}`:timeText);
    const energy=states[this._entities.battery],message=r.querySelector('[data-calibration]');
    const uncalibrated=this._number('battery')===null;
    const gap=energy?.attributes?.data_gap===true;
    message.classList.toggle('visible',uncalibrated||gap);
    r.querySelector('[data-main-status]').textContent=uncalibrated?'Нужен полный заряд':gap?'Есть перерыв в учёте':'';
    message.textContent=uncalibrated?'Счётчик Вт·ч ожидает первого полного заряда. Он запустится после автокалибровки; если АКБ уже полная, подтвердите это кнопкой ниже.':gap?'Во время учёта был перерыв в данных. Остаток сохранён, но может быть неточным до следующего полного заряда.':'';
    const last=energy?.attributes?.last_full;
    const calibration=states[this._entities.calibration_status]?.state;
    r.querySelector('[data-calibration-status]').textContent=calibration&&!['unknown','unavailable'].includes(calibration)?'Автокалибровка: '+calibration+'.':'';
    r.querySelector('[data-last-full]').textContent=last?`Последний полный заряд: ${new Date(last).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`:'Полный заряд ещё не подтверждён';
    const updated=states[this._entities.load]?.last_updated;
    r.querySelector('[data-updated]').textContent=updated?`Данные · ${new Date(updated).toLocaleTimeString('ru-RU')}`:'Ожидание данных';
  }
  _updateGrid() {
    if(!this._hass||!this.shadowRoot.firstChild)return;
    const r=this.shadowRoot,states=this._hass.states;
    const connected=this._hass.connected!==false,gridState=states[this._entities.grid_present]?.state;
    const gridKnown=connected&&this._number('grid_voltage')!==null&&['on','off'].includes(gridState),absent=gridKnown&&gridState==='off';
    r.querySelectorAll('.node[data-key="grid"]').forEach(grid=>{
      grid.classList.toggle('grid-absent',absent);grid.querySelector('.node-unit').textContent=absent?'СЕТИ НЕТ':'Вт';
      grid.setAttribute('aria-label',absent?'Сеть отсутствует: открыть историю':'Сеть: открыть историю');
    });
    const dtek=states[this._entities.dtek_status],a=dtek?.attributes||{},now=Date.now()/1000;
    const age=now-Number(a.last_success),fresh=connected&&a.fresh===true&&!a.error&&Number.isFinite(age)&&age>=0&&age<900&&!['unknown','unavailable','stale','not_configured'].includes(dtek?.state);
    const rawDeadline=Number(a[absent?'restoration_at':'next_outage_at']);
    const eligible=absent?dtek?.state==='outage':!a.emergency&&!a.multi_group;
    const deadline=fresh&&eligible&&Number.isFinite(rawDeadline)&&rawDeadline>0?rawDeadline:null;
    let label='Срок не указан',title='ДТЭК не указал срок. Открыть график отключений.';
    if(!gridKnown){label=connected?'Нет данных сети':'Нет соединения';title='Для таймера нужны свежие показания сети. Открыть ДТЭК.';}
    else if(a.configured&&!fresh){label='ДТЭК: данные устарели';title='Нет свежего ответа ДТЭК. Предыдущий срок не используется. Открыть ДТЭК.';}
    else if(deadline!==null){
      const at=new Date(deadline*1000).toLocaleString('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      if(deadline>now){const minutes=Math.ceil((deadline-now)/60);label=`До ${absent?'включения':'отключения'} ≈ ${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,'0')}`;}
      else label=absent?'Срок прошёл · ждём':'Отключение ожидается';
      title=`${absent?'Возвращение света по ориентиру ДТЭК':'Отключение по графику ДТЭК'}: ${at}. Время может измениться. Открыть график.`;
    }
    r.querySelectorAll('[data-grid-timer]').forEach(timer=>{
      timer.classList.toggle('scheduled',gridKnown&&deadline!==null);timer.setAttribute('aria-label',`${label}. Открыть график ДТЭК`);timer.title=title;
      timer.querySelector('[data-grid-countdown]').textContent=label;
      const svgTitle=timer.querySelector('[data-grid-timer-title]');if(svgTitle)svgTitle.textContent=title;
    });
  }
  _sourceContext() {
    const states=this._hass?.states||{},entity=this._entities.mode_select,native=states[entity];
    const available=native&&!['unknown','unavailable',''].includes(native.state);
    const current=available?native.state:states[this._entities.output_priority]?.state;
    const options=Array.isArray(native?.attributes?.options)?native.attributes.options.filter(v=>typeof v==='string'):[];
    let reason='';
    if(this._settingsPending)reason='Дождитесь завершения изменения в настройках.';
    else if(this._hass?.connected===false)reason='Нет соединения с Home Assistant.';
    else if(states[this._entities.control_mode]?.state==='read_only')reason='В EyeBond Local включён режим «Только чтение». Выбор пока недоступен.';
    else if(!available)reason='Управление режимом пока недоступно в интеграции.';
    else if(native.attributes?.editable===false||native.attributes?.policy_editable===false||native.attributes?.blocked_by_inverter)reason='Изменение сейчас заблокировано интеграцией или инвертором.';
    return {entity,current,options,reason,writable:!reason&&typeof this._hass?.callService==='function'};
  }
  _sourceCode(option) {
    const found=SOURCE_MODES.find(mode=>mode.option===option||mode.code===option);
    if(found)return found.code;
    const legacy={'Utility-PV-Battery':'UTI','PV-Utility-Battery':'SOL','PV-Battery-Utility':'SBU'};
    if(legacy[option])return legacy[option];
    const unknown=/^Unknown \((\d)\)$/.exec(option||'');
    if(unknown&&SOURCE_MODES[Number(unknown[1])])return SOURCE_MODES[Number(unknown[1])].code;
    return ['unknown','unavailable','',undefined].includes(option)?'Нет данных':option;
  }
  _toggleSourceMenu() {
    const popover=this.shadowRoot.querySelector('[data-source-popover]');
    if(!popover.hidden){this._closeSourceMenu();return;}
    this._sourceDraft=this._sourceContext().current;this._sourceFeedback=null;
    popover.hidden=false;this.shadowRoot.querySelector('[data-source-open]').setAttribute('aria-expanded','true');
    this._updateSourceMode();
    this.shadowRoot.querySelector('.source-option:not(:disabled)')?.focus();
  }
  _closeSourceMenu(focus=true) {
    const popover=this.shadowRoot.querySelector('[data-source-popover]');
    if(popover.hidden)return;
    popover.hidden=true;const button=this.shadowRoot.querySelector('[data-source-open]');button.setAttribute('aria-expanded','false');
    if(focus)button.focus();
  }
  _updateSourceMode() {
    const r=this.shadowRoot,context=this._sourceContext();
    r.querySelector('energetika-settings-panel').externalBusy=!!this._modePending;
    r.querySelector('[data-source-current]').textContent=this._modePending?'Переключение…':this._sourceCode(context.current);
    if(this._modePending&&context.current===this._modePending.option){
      clearTimeout(this._modeTimeout);this._modePending=null;this._sourceFeedback={kind:'success',text:'Инвертор подтвердил режим '+this._sourceCode(context.current)+'.'};
      r.querySelector('[data-source-current]').textContent=this._sourceCode(context.current);
    }
    if(r.querySelector('[data-source-popover]').hidden)return;
    const rows=SOURCE_MODES.map(mode=>({...mode,enabled:context.writable&&context.options.includes(mode.option)}));
    for(const option of context.options)if(!rows.some(row=>row.option===option))rows.push({code:this._sourceCode(option),option,description:option,enabled:context.writable});
    const signature=JSON.stringify([rows,this._sourceDraft,context.current,!!this._modePending]);
    if(signature!==this._modeRows){
      this._modeRows=signature;
      r.querySelector('[data-source-options]').innerHTML=rows.map((row,index)=>`<div class="source-row"><button class="source-option" data-source-index="${index}" aria-pressed="${row.option===this._sourceDraft}" aria-selected="${row.option===this._sourceDraft}" ${!row.enabled||this._modePending?'disabled':''}><strong>${escapeHtml(row.code)}</strong><span>${escapeHtml(row.description)}</span><span class="check">${row.option===context.current?'✓':''}</span></button><button class="source-info" data-source-info="${index}" aria-label="Справка о режиме ${escapeHtml(row.code)}">i</button></div>`).join('');
      r.querySelectorAll('[data-source-info]').forEach(button=>button.addEventListener('click',()=>r.querySelector('energetika-settings-panel').showInfo('output_source_priority',rows[Number(button.dataset.sourceInfo)].option)));
      r.querySelectorAll('[data-source-index]').forEach(button=>button.addEventListener('click',()=>{this._sourceDraft=rows[Number(button.dataset.sourceIndex)].option;this._sourceFeedback=null;this._updateSourceMode();}));
    }
    const message=r.querySelector('[data-source-message]');
    message.className='mode-message '+(this._sourceFeedback?.kind||'');
    message.textContent=this._modePending?'Ожидание подтверждения инвертора…':context.reason||this._sourceFeedback?.text||'';
    const note=r.querySelector('[data-source-note]');
    note.hidden=!context.writable||this._sourceDraft===context.current;
    note.textContent=this._sourceCode(this._sourceDraft)==='SUF'?'SUF допускает отдачу избытка энергии в сеть.':'Переключение изменит источник питания дома.';
    const apply=r.querySelector('[data-source-apply]');
    apply.disabled=!context.writable||!!this._modePending||!context.options.includes(this._sourceDraft)||this._sourceDraft===context.current;
    apply.textContent=this._modePending?'Переключение…':'Применить '+this._sourceCode(this._sourceDraft||context.current);
  }
  async _applySourceMode() {
    const context=this._sourceContext(),option=this._sourceDraft;
    if(!context.writable||this._modePending||!context.options.includes(option)||option===context.current)return;
    this._modePending={option};this._sourceFeedback=null;this._updateSourceMode();
    this._modeTimeout=setTimeout(()=>{if(!this._modePending)return;this._modePending=null;this._sourceFeedback={kind:'error',text:'Подтверждение не получено. Проверьте текущий режим перед повтором.'};this._updateSourceMode();},15000);
    try {
      if(this._hass.states['input_boolean.energetika_solar_auto']?.state==='on')
        await this._hass.callService('script','energetika_solar_pause',{});
      await this._hass.callService('select','select_option',{entity_id:context.entity,option});
      this._updateSourceMode();
    }catch(error){
      clearTimeout(this._modeTimeout);this._modePending=null;
      this._sourceFeedback={kind:'error',text:'Режим не подтверждён. '+String(error?.message||'Проверьте соединение с инвертором.')};
      this._updateSourceMode();
    }
  }
  _moreInfo(key,opener) {
    const palette={solar:'#ffd65a',grid:'#38bfff',load:'#bc7bff',battery:'#52b788',discharge:'#f9844a'};
    const definitions={
      grid:['Сеть · мощность','Вт','grid',-11000,11000],solar:['Солнце · мощность','Вт','solar',0,5400],load:['Нагрузка дома','Вт','load',0,8400],
      pv_battery:['Солнце → АКБ','Вт','solar',0,5400],pv_load:['Солнце → нагрузка','Вт','solar',0,5400],
      grid_battery:['Сеть → АКБ','Вт','grid',0,8400],grid_load:['Сеть → нагрузка','Вт','grid',0,11000],battery_load:['АКБ → нагрузка','Вт','discharge',0,8400],
      grid_voltage:['Напряжение сети','В','grid',0,300],grid_current:['Ток сети · оценка P/U','А','grid',-60,60],
      solar_voltage:['Напряжение панелей','В','solar',0,550],solar_current:['Ток панелей','А','solar',0,100],
      load_voltage:['Выходное напряжение','В','load',0,300],load_current:['Выходной ток','А','load',0,60],
      voltage:['Напряжение АКБ','В','battery',0,40],voltage_min:['Нижний порог АКБ','В','battery',0,40],current:['Ток АКБ','А','battery',-250,250],
      battery_energy:['Остаток энергии АКБ','Вт·ч','battery',0,2560],inverter_energy:['Энергия АКБ · оценка инвертора','Вт·ч','battery',0,2560],
      percent:['Заряд АКБ · по энергии','%','battery',0,100],percent_voltage:['Заряд АКБ · по напряжению','%','battery',0,100],inverter_percent:['Заряд АКБ · оценка инвертора','%','battery',0,100],
      runtime:['Время работы до 20%','мин','battery',0,100000],used:['Израсходованная энергия АКБ','Вт·ч','battery',0,2560],
    };
    let config;
    if(['battery','battery_power','charge','discharge'].includes(key)){
      config={title:'Заряд и разряд аккумулятора',unit:'Вт',entities:[{entity:this._entities.charge,name:'Зарядка АКБ',color:palette.battery,minimum:0,maximum:8400},{entity:this._entities.discharge,name:'Разрядка АКБ',color:palette.discharge,minimum:0,maximum:8400}]};
    }else{
      const definition=definitions[key],entity=this._entities[key];if(!entity)return;
      if(!definition){this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:entity},bubbles:true,composed:true}));return;}
      const [name,unit,tone,minimum,maximum]=definition;
      config={title:name,unit,entities:[{entity,name,color:palette[tone],minimum,maximum}]};
      if(key==='voltage')Object.assign(config,{y_min:24,y_max:30,y_step:1});
    }
    this.shadowRoot.querySelector('energetika-history-dialog').open(this._hass,config,opener);
  }
  async _calibrate() {
    if (!this._hass || !window.confirm('АКБ действительно полностью заряжена? Остаток будет установлен в 2560 Вт·ч, накопленный расход обнулится.')) return;
    const b=this.shadowRoot.querySelector('[data-calibrate]'),t=this.shadowRoot.querySelector('[data-toast]'); b.disabled=true;
    try { await this._hass.callService('input_button','press',{entity_id:'input_button.energetika_battery_full'}); t.textContent='Полный заряд подтверждён. Остаток обновляется.'; }
    catch { t.textContent='Не удалось выполнить калибровку. Проверьте соединение с Home Assistant.'; }
    finally { b.disabled=false; }
  }
}
if(!customElements.get('energetika-card'))customElements.define('energetika-card',EnergetikaCard);
window.customCards=window.customCards||[];
window.customCards.push({type:'energetika-card',name:'Энергетика',description:'Потоки энергии и остаток АКБ в Вт·ч',preview:false});
