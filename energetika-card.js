import './energetika-history.js?v=2.4.2';
import './energetika-settings.js?v=2.4.2';

export function formatRuntime(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  const total=Math.floor(minutes);
  return total===0?'0 мин':`${Math.floor(total/60)} ч ${String(total%60).padStart(2,'0')} мин`;
}
/* Energetika 2.4 — local Home Assistant card, no external dependencies. */
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
  solar_voltage: ROOT + 'pv_voltage', solar_current: ROOT + 'pv_current',
  load_voltage: ROOT + 'output_voltage', load_current: ROOT + 'output_current',
  runtime: 'sensor.energetika_battery_runtime_to_reserve',
  mode_select: 'select.anenji_4200_protocol_1_output_source_priority',
  output_priority: ROOT + 'output_source_priority', control_mode: ROOT + 'control_mode',
  grid: ROOT + 'grid_power', solar: ROOT + 'pv_power', load: ROOT + 'load_power',
  battery: 'sensor.energetika_battery_remaining', percent: 'sensor.energetika_battery_percent_energy',
  voltage: ROOT + 'battery_voltage', voltage_min: ROOT + 'battery_under_voltage_off_grid',
  percent_voltage: 'sensor.energetika_battery_percent_voltage', inverter_percent: ROOT + 'battery_percent',
  inverter_energy: 'sensor.energetika_battery_remaining_inverter',
  pv_battery: ROOT + 'pv_to_battery_power', pv_load: ROOT + 'pv_to_home_power',
  grid_battery: ROOT + 'grid_to_battery_power', grid_load: ROOT + 'grid_to_home_power',
  battery_load: ROOT + 'battery_to_home_power', charge: 'sensor.zariadka_akb',
  discharge: 'sensor.razriadka_akb', battery_power: ROOT + 'battery_power',
  current: ROOT + 'battery_current', used: 'sensor.energetika_battery_used',
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
const mini = (key, label, unit) => `<button class="mini" data-key="${key}" title="История: ${label}"><span>${label}</span><strong>${value(key, unit)}</strong></button>`;

class EnergetikaCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._entities = ENTITIES;
    this._batteryMode = 'energy';
    try { this._batteryMode = localStorage.getItem('energetika.battery-mode') === 'voltage' ? 'voltage' : 'energy'; } catch {}
  }
  setConfig(config) {
    this.config = {...config};
    this._entities = {...ENTITIES, ...(config.entities || {})};
    this._render();
  }
  getCardSize() { return 12; }
  getGridOptions() { return {columns: 12, min_columns: 6}; }
  set hass(hass) { this._hass = hass; this._update(); }
  connectedCallback() { if (!this.shadowRoot.firstChild) this._render(); }
  disconnectedCallback() { clearTimeout(this._modeTimeout); }
  _node(key, name, ic, x, y, w, color, unit = 'Вт') {
    return `<g class="node ${color}" data-key="${key}" role="button" tabindex="0" aria-label="${name}: открыть историю" transform="translate(${x} ${y})">
      <rect class="node-bg" width="${w}" height="${key === 'battery' ? 132 : 112}" rx="16"/>
      <svg x="12" y="22" width="38" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[ic]}</svg>
      <text class="node-name" x="60" y="29">${name}</text>
      <text class="node-value" x="60" y="59" data-value="${key}">—</text>
      <text class="node-unit" x="60" y="79">${unit}</text>
      <text class="node-metrics" x="12" y="100"><tspan data-key="${key==='battery'?'voltage':key+'_voltage'}" role="button" tabindex="0" aria-label="${name}: напряжение"><tspan data-value="${key==='battery'?'voltage':key+'_voltage'}">—</tspan> В</tspan><tspan dx="13" data-key="${key==='battery'?'current':key+'_current'}" role="button" tabindex="0" aria-label="${name}: ток">${key==='grid'?'≈ ':''}<tspan data-value="${key==='battery'?'current':key+'_current'}">—</tspan> А</tspan></text>
      ${key==='battery'?'<text class="node-runtime" x="12" y="121" data-runtime>До 20% · —</text>':''}<path class="chev" d="m${w-18} 41 5 5-5 5"/>
    </g>`;
  }
  _flow(key, d, x, y, color, label) {
    return `<g class="flow ${color}" data-flow="${key}"><path class="track" d="${d}"/><path class="wire" d="${d}"/><path class="moving" d="${d}" marker-end="url(#arrow-${color})"/>
      <g class="flow-label" data-key="${key}" role="button" tabindex="0" aria-label="${label}: открыть историю" transform="translate(${x} ${y})"><rect x="${key === 'battery_load' ? -36 : -48}" y="-19" width="${key === 'battery_load' ? 72 : 96}" height="38" rx="12"/><text y="7" text-anchor="middle"><tspan data-value="${key}">—</tspan><tspan class="flow-unit"> Вт</tspan></text></g></g>`;
  }
  _tile(key, title, subtitle, ic, color) {
    return `<button class="tile ${color}" data-key="${key}" title="Открыть историю: ${title}">${icon(ic)}<span class="tile-body"><span class="tile-title">${title}</span><strong>${value(key)}</strong><small>${subtitle}</small></span><span class="arrow">›</span></button>`;
  }
  _render() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>
      :host{display:block;color:#f2f6fc;font-family:var(--paper-font-body1_-_font-family,Inter,system-ui,sans-serif);--solar:#ffd65a;--grid:#38bfff;--battery:#17e6b3;--home:#bc7bff}
      *{box-sizing:border-box}button{font:inherit}button,[role=button]{-webkit-tap-highlight-color:transparent;cursor:pointer}button:focus-visible,[role=button]:focus-visible{outline:3px solid #fff;outline-offset:3px}button{color:inherit} .solar{--tone:var(--solar);color:var(--solar)}.grid{--tone:var(--grid);color:var(--grid)}.battery{--tone:var(--battery);color:var(--battery)}.home{--tone:var(--home);color:var(--home)}
      .shell{max-width:1100px;margin:8px auto 18px;border-radius:28px;padding:26px;background:radial-gradient(ellipse at 75% 8%,#15233e 0,transparent 55%),linear-gradient(145deg,#0a1524,#060e18 70%);border:1px solid #223449;box-shadow:0 12px 40px #0003;overflow:hidden}
      header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 4px 8px}h1{font-size:27px;letter-spacing:-.7px;margin:0 0 5px;font-weight:700}.eyebrow{font-size:10px;font-weight:700;color:#6989a5;letter-spacing:2px;margin-bottom:7px}.sub{color:#91a6bb;font-size:12px}.live{display:flex;align-items:center;gap:7px;border:1px solid #1e514d;background:#10312f88;border-radius:30px;padding:7px 11px;color:#64ecc9;font-size:11px;white-space:nowrap}.dot{width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}.live.offline{color:#f6c66a;border-color:#67542d;background:#3c301c88}
      .diagram{width:100%;max-width:900px;display:block;margin:auto;overflow:visible}.scene{opacity:.36}.node-bg{fill:#081522;stroke:currentColor;stroke-width:1.6}.node{filter:drop-shadow(0 0 8px color-mix(in srgb,currentColor 15%,transparent));transition:filter .2s}.node:hover{filter:drop-shadow(0 0 10px currentColor)}.node-name{font-size:17px;fill:#c2cfde;font-weight:500}.node-value{font-size:26px;fill:#f6faff;font-weight:750;font-variant-numeric:tabular-nums;letter-spacing:-.5px}.node-unit{font-size:13px;fill:#7f99ad}.chev{fill:none;stroke:currentColor;stroke-width:2;opacity:.75}.track{fill:none;stroke:currentColor;stroke-width:3;opacity:.1;stroke-linejoin:round}.wire{fill:none;stroke:currentColor;stroke-width:2;opacity:.22;stroke-linejoin:round}.moving{fill:none;stroke:currentColor;stroke-width:3;stroke-dasharray:5 16;stroke-linecap:round;stroke-linejoin:round;opacity:0}.flow.active .wire{opacity:.7;filter:drop-shadow(0 0 5px currentColor)}.flow.active .moving{opacity:1;animation:current 1.6s linear infinite}.flow-label rect{fill:#0b1725;stroke:currentColor;stroke-opacity:.4;stroke-width:1.2}.flow-label text{fill:#c8d5e4;font-size:19px;font-weight:650;font-variant-numeric:tabular-nums}.flow.active .flow-label rect{stroke-opacity:.8}.flow.active .flow-label text{fill:#f6faff}.flow-unit{font-size:13px}.flow-label:hover rect{fill:#1b3041}.flow-label{outline:none}.route-caption{font-size:12px;fill:#68869d;letter-spacing:2px;text-anchor:middle}.section-label{font-size:10px;color:#6d8ba3;letter-spacing:1.6px;font-weight:700;margin:4px 4px 12px}.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.tile{border:1px solid color-mix(in srgb,var(--tone) 40%,#142333);border-radius:16px;background:linear-gradient(120deg,color-mix(in srgb,var(--tone) 7%,#0a1522),#0b1521);padding:16px 13px;display:flex;align-items:center;gap:11px;text-align:left;min-height:105px;transition:border-color .2s,background .2s,transform .2s}.tile:hover{border-color:var(--tone);background:color-mix(in srgb,var(--tone) 12%,#0a1522);transform:translateY(-1px)}.icon{width:32px;height:36px;flex-shrink:0;filter:drop-shadow(0 0 5px color-mix(in srgb,currentColor 30%,transparent))}.tile-body{display:flex;flex:1;min-width:0;flex-direction:column;gap:4px}.tile-title{color:#b4c7d8;font-size:12px;line-height:1.35}.tile strong{font-size:24px;line-height:1.1;color:#f4f7fd;font-weight:700;letter-spacing:-.6px;white-space:nowrap;font-variant-numeric:tabular-nums}.unit{font-size:.53em;font-weight:500;color:#97adc1;margin-left:4px;letter-spacing:0}.tile small{color:#6c849a;font-size:10px}.arrow{font-size:22px;opacity:.6}.battery-summary{display:block;cursor:default;padding:15px}.battery-title{display:flex;align-items:center;gap:8px;font-size:12px;color:#b7d1d4;margin-bottom:10px}.battery-title .icon{width:20px;height:24px}.battery-main{display:flex;align-items:baseline;justify-content:space-between;gap:6px}.plain-value{border:0;background:none;padding:0;text-align:left}.plain-value strong{font-size:25px}.capacity{font-size:10px;color:#72919d}.bar{height:4px;background:#20353c;border-radius:4px;overflow:hidden;margin:11px 0}.bar span{display:block;height:100%;width:0;background:var(--battery);transition:width 1s}.mini-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.mini{display:flex;flex-direction:column;align-items:flex-start;gap:3px;border:0;background:none;padding:0}.mini>span{font-size:9px;color:#7796a5}.mini strong{font-size:14px;letter-spacing:0;white-space:nowrap}.mini:hover strong,.plain-value:hover strong{text-decoration:underline;text-underline-offset:4px}.battery-summary{grid-column:span 1}.charge-tile{grid-column:span 1}.note{font-size:11px;line-height:1.6;color:#7690a8;margin:15px 3px 0}.calibration{display:none;padding:10px 13px;background:#49391b55;border:1px solid #6b512f;border-radius:12px;color:#ebcd93;font-size:11px;line-height:1.5;margin-top:12px}.calibration.visible{display:block}details{border-top:1px solid #213143;margin-top:16px;padding-top:12px;font-size:11px;color:#819bb0}summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;color:#90adc1}summary::after{content:'+';font-size:18px}details[open] summary::after{content:'−'}details p{line-height:1.7;max-width:780px}.calibrate{border:1px solid #2c6e60;border-radius:10px;background:#10392f;color:#74e9c3;padding:9px 13px;font-size:11px}.calibrate:disabled{opacity:.5;cursor:wait}.last-full{font-size:10px;color:#6c899d;margin-left:10px}.toast{font-size:11px;color:#a5dece;margin-top:8px;min-height:14px}footer{display:flex;justify-content:space-between;gap:10px;color:#4f6c83;font-size:9px;margin-top:16px;letter-spacing:.5px}.battery-extra{display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:9px;color:#6e909d}.battery-extra button{background:none;border:0;padding:0;color:#a0bbca;font-size:10px}.battery-extra button:hover{text-decoration:underline}
      .charge-tile>.tile{width:100%;height:100%}.flow[data-flow=battery_load] .flow-label text{font-size:16px}
      .node-metrics{font-size:11px;fill:#9bb2c7;font-variant-numeric:tabular-nums}.node-runtime{font-size:10px;fill:#60d6b7;font-variant-numeric:tabular-nums}.node-metrics [role=button]:hover{fill:white}.runtime{display:block;border:0;background:transparent;color:#67cbb3;font-size:10px;padding:7px 0 0;text-align:left;font-variant-numeric:tabular-nums}.runtime:hover{text-decoration:underline}.battery-main{flex-wrap:wrap}.runtime{grid-column:1;grid-row:3}.battery-summary .bar{grid-row:4}.battery-summary .mini-row{grid-row:2/5}.battery-summary .battery-extra{grid-row:5}
      @keyframes current{to{stroke-dashoffset:-42}}@media(prefers-reduced-motion:reduce){.flow.active .moving{animation:none}.tile,.bar span{transition:none}}
      .shell{display:block}.battery-summary{grid-column:1/-1;grid-row:4;padding:14px 17px}.battery-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.battery-title{margin:0;white-space:nowrap}.nameplate{color:#72999f;font-size:10px;margin-left:5px}.mode-switch{display:flex;border:1px solid #23534f;border-radius:8px;padding:2px;gap:2px}.mode-switch button{border:0;border-radius:5px;background:none;color:#7b9caa;padding:4px 9px;font-size:10px;white-space:nowrap}.mode-switch button[aria-pressed=true]{background:#123e38;color:#66edd0}.battery-layout{display:grid;grid-template-columns:1.4fr .8fr .8fr;gap:12px;align-items:center}.battery-main{display:block}.battery-main .plain-value strong{font-size:30px}.battery-main .capacity{display:block;font-size:10px;margin-top:2px}.battery-layout .mini strong{font-size:20px}.battery-layout .mini>span{font-size:10px}.voltage-limits{display:flex;align-items:center;gap:9px;margin-top:10px;font-size:10px;white-space:nowrap}.voltage-limits button{border:0;padding:0;background:none;font:inherit}.voltage-min{color:#ff8689}.voltage-max{color:#56e5ad}.voltage-limits .bar{flex:1;margin:0;height:5px}.battery-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:10px;color:#71929f}.battery-bottom .runtime{padding:0;font-size:10px}.battery-spec{white-space:nowrap}.battery-extra{display:none}.calibration{margin-top:8px;padding:6px 9px;font-size:10px}.note{margin:10px 0}.section-label span{display:none}details{margin-top:10px;padding-top:8px}footer{margin-top:8px}.tile small{display:none}.tile{min-height:85px}.mode-note{color:#b4bc8a}.main-status{font-size:9px;color:#b4bc8a;margin-left:auto}.charge-tile{grid-column:auto;grid-row:3}.battery-layout .secondary-energy{display:none}
      @media(max-width:750px){.shell{padding:15px 12px;border-radius:22px;margin:3px auto 10px}.tiles{gap:7px}.tile{padding:10px;gap:7px;min-height:73px}.tile .icon{width:23px;height:27px}.tile-title{font-size:10px}.tile strong{font-size:22px}.arrow{display:none}header{padding:0 2px 3px}h1{font-size:23px;margin:0}.sub{display:none}.eyebrow{font-size:8px;margin-bottom:4px}.live{font-size:9px;padding:6px 8px}.battery-title{font-size:11px}.nameplate{font-size:9px}.battery-summary{padding:12px}.battery-main .plain-value strong{font-size:28px}.battery-layout .mini strong{font-size:19px}}
      @media(max-width:520px){.shell{padding:11px 9px 8px;border-radius:19px}.tiles{grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.tile{position:relative;padding:7px 6px;min-height:59px;border-radius:12px;display:block}.tile>.icon{position:absolute;width:18px;height:21px;left:7px;bottom:9px}.tile-body{gap:6px}.tile-title{font-size:9px;line-height:1.2;white-space:nowrap;color:#adc4d3}.tile-body strong{font-size:20px;padding-left:22px;line-height:1.1}.tile-body strong.long-value{font-size:16px}.unit{margin-left:2px}.diagram{margin:0 auto;width:100%;max-height:255px}.section-label{font-size:8px;margin:1px 2px 6px;letter-spacing:1.3px}h1{font-size:21px}.eyebrow{font-size:7px;letter-spacing:1.5px}.live{font-size:9px}.battery-summary{display:block;grid-column:1/-1;grid-row:4;padding:9px 10px;border-radius:13px;min-height:0}.battery-top{margin-bottom:6px;gap:4px}.battery-title{font-size:11px;gap:4px}.battery-title .icon{width:15px;height:19px}.nameplate{font-size:8px;margin-left:2px}.mode-switch button{font-size:9px;padding:4px 6px}.battery-layout{grid-template-columns:1.35fr .75fr .8fr;gap:8px}.battery-main .plain-value strong{font-size:26px}.battery-main .capacity{font-size:8px;margin-top:1px}.battery-layout .mini>span{font-size:8px}.battery-layout .mini strong{font-size:18px}.voltage-limits{margin-top:7px;font-size:9px;gap:7px}.battery-bottom{margin-top:6px;font-size:8px;gap:4px}.battery-bottom .runtime{font-size:9px}.battery-spec{font-size:8px}.note{display:none}details{margin-top:7px;padding-top:4px;font-size:10px}summary::after{font-size:15px}footer{display:none}.calibration{font-size:9px;line-height:1.3;padding:4px 7px;margin-top:5px}.last-full{display:block;margin:8px 0}.main-status{font-size:8px}}
      @media(max-width:365px){.shell{padding:8px 7px}.tile-title{font-size:8px}.tile-body strong{font-size:18px}.tile{min-height:55px}.diagram{max-height:225px}.nameplate{font-size:7px}.mode-switch button{padding:4px;font-size:8px}.battery-main .plain-value strong{font-size:23px}.battery-layout .mini strong{font-size:16px}.battery-title{font-size:10px}.battery-spec{font-size:7px}.battery-layout{gap:5px}.battery-bottom .runtime{font-size:8px}}
      @media(max-width:520px) and (max-height:740px){.shell{padding-top:8px}.diagram{max-height:200px}.tile{min-height:52px;padding:6px}.tile-body{gap:4px}.battery-summary{padding:8px 9px}.battery-top{margin-bottom:4px}.voltage-limits{margin-top:5px}.battery-bottom{margin-top:4px}.calibration{font-size:8px}}
      .diagram-wrap{position:relative}.inverter-mode{position:absolute;left:5px;top:8px;z-index:4}.source-trigger{display:flex;align-items:center;gap:9px;border:1px solid #2b5972;background:#0b2032ed;border-radius:10px;padding:8px 11px;font-size:12px;color:#89a7bb;min-height:33px;box-shadow:0 3px 14px #0003}.source-trigger strong{color:#bde9ff;font-size:13px}.source-trigger .caret{color:#51b9df}.source-trigger[aria-expanded=true]{border-color:#38bfff}.mode-popover{position:absolute;left:0;top:42px;width:min(310px,calc(100vw - 36px));padding:13px;border:1px solid #335c75;border-radius:17px;background:#0b1929fa;box-shadow:0 15px 45px #000a;color:#d8e7f3;backdrop-filter:blur(16px)}.mode-popover[hidden]{display:none}.mode-heading{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:650;margin-bottom:10px}.mode-close{background:none;border:0;color:#93adbf;font-size:21px;padding:0 4px}.source-options{display:grid;gap:5px}.source-option{display:grid;grid-template-columns:44px 1fr 12px;align-items:center;gap:8px;border:1px solid #263e52;background:#101f31;border-radius:9px;padding:9px 10px;text-align:left;color:#abc1d2;font-size:11px;min-height:41px}.source-option strong{color:#e6f4ff;font-size:13px}.source-option[aria-selected=true]{border-color:#29c8c5;background:#123c3e}.source-option:disabled{cursor:default;opacity:.6}.source-option .check{color:#36dfb8}.mode-message{font-size:10px;line-height:1.5;color:#8eabbf;margin:9px 0;min-height:15px}.mode-message.error{color:#f1a094}.mode-message.success{color:#65dfb8}.mode-apply{width:100%;border:1px solid #298d9c;background:#12434e;color:#a1eff4;border-radius:9px;padding:9px;font-size:11px;font-weight:600}.mode-apply:disabled{opacity:.4;cursor:default}.mode-note{font-size:10px;line-height:1.4;color:#a6b9c7;margin:0 0 8px}.source-option small{font-size:10px;color:#83a3b7}.mode-message:empty{display:none}
      @media(max-width:520px){.inverter-mode{left:3px;top:5px}.source-trigger{font-size:10px;padding:5px 9px;gap:6px;min-height:28px;border-radius:8px}.source-trigger strong{font-size:11px}.mode-popover{top:34px;padding:11px}.source-option{padding:8px 9px;font-size:10px;min-height:39px}.mode-heading{font-size:12px}.mode-message{font-size:10px}}
      .settings-gear{position:absolute;right:5px;top:8px;z-index:3;width:34px;height:34px;display:grid;place-items:center;padding:7px;border:1px solid #33546d;border-radius:10px;background:#102439dc;color:#92b4cc;box-shadow:0 3px 14px #0003}.settings-gear:hover{color:#90e7df;border-color:#41aaa6}.settings-gear svg{width:20px;height:20px}.source-row{display:flex;align-items:center;gap:5px}.source-row .source-option{flex:1;min-width:0}.source-info{width:25px;height:25px;flex-shrink:0;padding:0;border:1px solid #3a6177;border-radius:50%;background:#153144;color:#87cddd;font:bold 14px Georgia,serif}.mode-setting-link{display:block;margin-top:9px;width:100%;padding:6px;background:none;border:0;color:#7ba9c1;font-size:10px}@media(max-width:520px){.settings-gear{right:3px;top:5px;width:29px;height:29px;padding:5px;border-radius:8px}.settings-gear svg{width:18px;height:18px}}
    </style>
    <ha-card class="shell"><header><div><div class="eyebrow">МОЙ ДОМ · ANENJI 4200</div><h1>Энергетика</h1><div class="sub">Солнце, сеть и энергия вашего дома</div></div><span class="live" data-live><span class="dot"></span><span data-live-text>Подключение</span></span></header>
    <div class="diagram-wrap"><button class="settings-gear" data-settings-open aria-label="Настройки инвертора" title="Настройки инвертора"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 3-.6 2.1-1.5.9-2.1-.5-2 3.5 1.5 1.6v1.8L2.8 14l2 3.5 2.1-.5 1.5.9L9 20h4l.6-2.1 1.5-.9 2.1.5 2-3.5-1.5-1.6v-1.8L19.2 9l-2-3.5-2.1.5-1.5-.9L13 3Z"/><circle cx="11" cy="11.5" r="3.2"/></svg></button><div class="inverter-mode"><button class="source-trigger" data-source-open aria-haspopup="dialog" aria-expanded="false"><span>Режим</span><strong data-source-current>—</strong><span class="caret">⌄</span></button><div class="mode-popover" data-source-popover role="dialog" aria-label="Режим питания инвертора" hidden><div class="mode-heading">Приоритет питания<button class="mode-close" data-source-close aria-label="Закрыть выбор режима">×</button></div><div class="source-options" data-source-options role="group" aria-label="Доступные режимы"></div><div class="mode-message" data-source-message role="status"></div><p class="mode-note" data-source-note hidden>Переключение изменит источник питания дома.</p><button class="mode-apply" data-source-apply disabled>Применить режим</button><button class="mode-setting-link" data-settings-link>Все настройки инвертора →</button></div></div>
    <svg class="diagram" viewBox="0 0 720 500" aria-label="Схема потоков энергии">
      <defs>${['solar','grid','battery'].map(c=>`<marker id="arrow-${c}" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 5 2.5 0 5Z" fill="var(--${c})"/></marker>`).join('')}
      <linearGradient id="roof" x2="1" y2="1"><stop stop-color="#284361"/><stop offset="1" stop-color="#0c1829"/></linearGradient><linearGradient id="window" x2="0" y2="1"><stop stop-color="#ffc65e"/><stop offset="1" stop-color="#8e5b21"/></linearGradient><radialGradient id="halo"><stop stop-color="#22a891" stop-opacity=".12"/><stop offset="1" stop-color="#081421" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="365" cy="280" rx="280" ry="150" fill="url(#halo)"/>
      <g class="scene"><path d="M170 237 348 132 552 237 518 255 348 170 205 256Z" fill="url(#roof)" stroke="#3a5871"/><path d="M207 255v118h308V254L348 170Z" fill="#102232" stroke="#2e4b61"/><path d="M210 373h315" stroke="#46616b"/><path d="m287 195 63-35 111 57-64 36Z" fill="#12314a" stroke="#487896"/><path d="m310 182 109 58m-84-72 109 59m-132-19 61-35m-33 50 62-35" stroke="#36637f" stroke-width="2"/><rect x="222" y="279" width="47" height="58" rx="2" fill="url(#window)"/><path d="M245 279v58m-23-27h47" stroke="#233e4b" stroke-width="4"/><rect x="451" y="279" width="43" height="58" rx="2" fill="url(#window)"/><path d="M472 279v58m-21-27h43" stroke="#233e4b" stroke-width="4"/><path d="M179 374h366" stroke="#2a4c50" stroke-width="3"/></g>
      ${this._flow('pv_battery','M428 146V198H357V274',357,230,'solar','Солнце → АКБ')}
      ${this._flow('pv_load','M540 146V218H625V274',625,238,'solar','Солнце → нагрузка')}
      ${this._flow('grid_battery','M104 242V330H278',193,330,'grid','Сеть → АКБ')}
      ${this._flow('grid_load','M104 242V454H616V386',357,454,'grid','Сеть → нагрузка, байпас')}
      ${this._flow('battery_load','M450 330H531',491,330,'battery','АКБ → нагрузка')}
      <text x="357" y="489" class="route-caption">СЕТЬ → ДОМ · БАЙПАС</text>
      ${this._node('grid','Сеть','grid',18,130,174,'grid')}
      ${this._node('solar','Солнце','sun',395,34,205,'solar')}
      ${this._node('battery','АКБ','battery',278,274,172,'battery','Вт·ч осталось')}
      ${this._node('load','Нагрузка','home',531,274,174,'home')}
    </svg></div>
    <div class="section-label">ПОТОКИ МОЩНОСТИ <span style="color:#3f5e76">/ НАЖМИТЕ НА ЧИСЛО ДЛЯ ИСТОРИИ</span></div>
    <div class="tiles">
      ${this._tile('pv_battery','Солнце → АКБ','Заряд от солнечных панелей','sun','solar')}
      ${this._tile('pv_load','Солнце → нагрузка','Солнечная энергия для дома','sun','solar')}
      ${this._tile('grid','Сеть · всего','Общий забор из сети','grid','grid')}
      ${this._tile('grid_battery','Сеть → АКБ','Заряд от электросети','up','grid')}
      ${this._tile('grid_load','Сеть → нагрузка','Питание через байпас','grid','grid')}
      ${this._tile('battery_load','АКБ → нагрузка','Разряд аккумулятора в дом','down','battery')}
      ${this._tile('load','Нагрузка · всего','Потребление дома','home','home')}
      <button class="tile battery" data-key="voltage" title="История напряжения аккумулятора">${icon('battery')}<span class="tile-body"><span class="tile-title">Напряжение АКБ</span><strong>${value('voltage','В')}</strong></span></button>
      <div class="tile battery battery-summary">
        <div class="battery-top"><div class="battery-title">${icon('battery')}АКБ <span class="nameplate">25,6 В · 100 А·ч</span></div><div class="mode-switch" role="group" aria-label="Способ оценки заряда"><button data-mode="energy" aria-pressed="true">Энергия</button><button data-mode="voltage" aria-pressed="false">По напряжению</button></div></div>
        <div class="battery-layout"><div class="battery-main"><button class="plain-value" data-primary data-key="battery" title="История оставшейся энергии"><strong><span data-primary-value>—</span><span class="unit" data-primary-unit>Вт·ч</span></strong></button><span class="capacity" data-mode-caption>из 2560 Вт·ч</span></div><button class="mini" data-secondary data-key="percent"><span data-secondary-label>По энергии</span><strong><span data-secondary-value>—</span><span class="unit" data-secondary-unit>%</span></strong></button>${mini('voltage','Напряжение','В')}</div>
        <div class="voltage-limits"><button class="voltage-min" data-key="voltage_min" title="Нижний порог автономной работы из настроек инвертора"><span data-value="voltage_min">—</span> В</button><div class="bar" title="Напряжение АКБ между нижним и верхним пределами"><span data-battery-bar></span></div><span class="voltage-max" title="Верхний предел оценки по напряжению">29,0 В</span></div>
        <div class="battery-bottom"><button class="runtime" data-key="runtime" title="По учёту энергии и текущему разряду АКБ"><span data-runtime>До 20% · —</span></button><span class="battery-spec" title="Подтверждённый предел разряда 100 А. При номинальных 25,6 В — 2560 Вт на стороне АКБ; мощность AC зависит от потерь.">Разряд ≤100 А · 2,56 кВт ном.</span></div>
      </div>
      <div class="charge-tile">${this._tile('charge','Заряд АКБ · всего','Сеть + солнце','up','battery')}</div>
    </div>

    <div class="note">Стрелки движутся в направлении передачи энергии. Ток сети ≈ P/U (оценка активного тока). Таймер — по текущему разряду до резерва 20%, при смене нагрузки пересчитывается. Распределение потоков — расчёт интеграции инвертора; разница с нагрузкой может включать потери и собственное потребление.</div>
    <details><summary>Об аккумуляторе <span class="main-status" data-main-status></span></summary><div class="calibration" data-calibration></div><p>Режим «Энергия» — остаток по мощности и времени. Режим «По напряжению» — линейная оценка от нижнего порога автономной работы до 29,0 В: она зависит от нагрузки и не меняет счётчик Вт·ч. Выбор сохраняется на этом устройстве. Таймер в обоих режимах рассчитан по учтённой энергии. Максимальный разряд АКБ — 100 А, номинально 2,56 кВт при 25,6 В; доступная мощность на выходе AC ниже из-за потерь.</p><p>Штатная оценка инвертора: <button class="plain-value" data-key="inverter_percent"><span data-value="inverter_percent">—</span>%</button> · <button class="plain-value" data-key="inverter_energy"><span data-value="inverter_energy">—</span> Вт·ч</button>.</p><p>Номинальная энергия — <b>2560 Вт·ч</b>. Счётчик складывает энергию заряда и вычитает энергию разряда: мощность × время. Например, 500 Вт в течение часа — 500 Вт·ч. Напряжение и процент инвертора показаны отдельно и не пересчитывают этот остаток. Значение сохраняется на сервере и считается при закрытой панели.</p><p>После подтверждённого полного заряда остаток устанавливается в 2560 Вт·ч. Автокалибровка: напряжение достигло настройки заряда инвертора (с допуском 0,2 В), ток заряда не выше 2 А и мощность АКБ по модулю не выше 60 Вт в течение 5 минут. Это оценка полного заряда, поскольку сигнала BMS нет. Кнопку используйте только когда уверены, что аккумулятор заряжен полностью.</p><button class="calibrate" data-calibrate>АКБ полностью заряжена</button><span class="last-full" data-last-full></span><div class="toast" role="status" data-toast></div></details>
    <footer><span>ЛОКАЛЬНЫЙ МОНИТОРИНГ</span><span data-updated>Ожидание данных</span></footer><energetika-settings-panel></energetika-settings-panel></ha-card>`;
    root.querySelectorAll('[data-key]').forEach(el=>{
      const open = e=>{e.stopPropagation();this._moreInfo(el.dataset.key);};
      el.addEventListener('click',open);
      if (el.tagName.toLowerCase() !== 'button') el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(e);}});
    });
    root.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
      this._batteryMode=button.dataset.mode;
      try { localStorage.setItem('energetika.battery-mode',this._batteryMode); } catch {}
      this._update();
    }));
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
    r.querySelector('energetika-settings-panel').hass=this._hass;
    this._updateSourceMode();
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
    const primaryKey=voltageMode?'percent_voltage':'battery',secondaryKey=voltageMode?'battery':'percent';
    const primary=this._number(primaryKey),secondary=this._number(secondaryKey);
    r.querySelector('[data-primary]').dataset.key=primaryKey;
    r.querySelector('[data-primary]').title=voltageMode?'История оценки по напряжению':'История оставшейся энергии';
    r.querySelector('[data-primary-value]').textContent=primary===null?'—':primary.toLocaleString('ru-RU',{maximumFractionDigits:voltageMode?1:0});
    r.querySelector('[data-primary-unit]').textContent=voltageMode?'%':'Вт·ч';
    r.querySelector('[data-mode-caption]').textContent=voltageMode?'Оценка по напряжению':'из 2560 Вт·ч';
    r.querySelector('[data-mode-caption]').classList.toggle('mode-note',voltageMode);
    r.querySelector('[data-secondary]').dataset.key=secondaryKey;
    r.querySelector('[data-secondary-label]').textContent=voltageMode?'Учтено энергии':'По энергии';
    r.querySelector('[data-secondary-value]').textContent=secondary===null?'—':secondary.toLocaleString('ru-RU',{maximumFractionDigits:voltageMode?0:1});
    r.querySelector('[data-secondary-unit]').textContent=voltageMode?'Вт·ч':'%';
    const pct=this._number('percent_voltage');r.querySelector('[data-battery-bar]').style.width=`${Math.min(100,Math.max(0,pct??0))}%`;
    const connected=this._hass.connected!==false && ['grid','solar','load','voltage'].every(k=>this._number(k)!==null);
    r.querySelector('[data-live]').classList.toggle('offline',!connected);
    r.querySelector('[data-live-text]').textContent=connected?'В реальном времени':'Нет данных';
    const minutes=this._number('runtime');
    const power=this._number('battery_power');
    const timeText=minutes!==null?formatRuntime(minutes):power!==null&&power>5?'Идёт заряд':power!==null&&Math.abs(power)<=5?'Нет разряда':'Нет данных';
    r.querySelectorAll('[data-runtime]').forEach(el=>el.textContent=`До 20% · ${timeText}`);
    const energy=states[this._entities.battery],message=r.querySelector('[data-calibration]');
    const uncalibrated=this._number('battery')===null;
    const gap=energy?.attributes?.data_gap===true;
    message.classList.toggle('visible',uncalibrated||gap);
    r.querySelector('[data-main-status]').textContent=uncalibrated?'Нужен полный заряд':gap?'Есть перерыв в учёте':'';
    message.textContent=uncalibrated?'Счётчик Вт·ч ожидает первого полного заряда. Он запустится после автокалибровки; если АКБ уже полная, подтвердите это кнопкой ниже.':gap?'Во время учёта был перерыв в данных. Остаток сохранён, но может быть неточным до следующего полного заряда.':'';
    const last=energy?.attributes?.last_full;
    r.querySelector('[data-last-full]').textContent=last?`Последний полный заряд: ${new Date(last).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`:'Полный заряд ещё не подтверждён';
    const updated=states[this._entities.load]?.last_updated;
    r.querySelector('[data-updated]').textContent=updated?`Данные · ${new Date(updated).toLocaleTimeString('ru-RU')}`:'Ожидание данных';
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
      await this._hass.callService('select','select_option',{entity_id:context.entity,option});
      this._updateSourceMode();
    }catch(error){
      clearTimeout(this._modeTimeout);this._modePending=null;
      this._sourceFeedback={kind:'error',text:'Режим не подтверждён. '+String(error?.message||'Проверьте соединение с инвертором.')};
      this._updateSourceMode();
    }
  }
  _moreInfo(key) {
    const entityId=this._entities[key];if(!entityId)return;
    this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId},bubbles:true,composed:true}));
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
