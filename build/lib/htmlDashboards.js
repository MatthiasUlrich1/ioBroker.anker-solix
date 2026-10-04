"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var htmlDashboards_exports = {};
__export(htmlDashboards_exports, {
  buildDashboardWidgetHtml: () => buildDashboardWidgetHtml,
  buildDeviceInventoryHtml: () => buildDeviceInventoryHtml,
  buildDiagnosisWidgetHtml: () => buildDiagnosisWidgetHtml,
  buildEnergyWidgetHtml: () => buildEnergyWidgetHtml,
  buildLiveWidgetHtml: () => buildLiveWidgetHtml,
  buildOverviewHtml: () => buildOverviewHtml,
  buildSettingsWidgetHtml: () => buildSettingsWidgetHtml,
  cloudOnline: () => cloudOnline,
  escapeHtml: () => escapeHtml,
  numEntity: () => numEntity,
  optionalBool: () => optionalBool,
  optionalNum: () => optionalNum
});
module.exports = __toCommonJS(htmlDashboards_exports);
function escapeHtml(value) {
  const text = typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : value === null || value === void 0 ? "" : JSON.stringify(value);
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function watts(value) {
  return `${Math.round(value)} W`;
}
function kwh(value) {
  return value !== null && Number.isFinite(value) ? `${value.toFixed(2)} kWh` : "\u2013";
}
function percent(value) {
  return value !== null && Number.isFinite(value) ? `${Math.round(value)} %` : "\u2013";
}
function temp(value) {
  return value !== null && Number.isFinite(value) ? `${value.toFixed(1)} \xB0C` : "\u2013";
}
function dot(ok) {
  if (ok === true) {
    return "good";
  }
  if (ok === false) {
    return "bad";
  }
  return "unknown";
}
function evaluateWarnings(site) {
  const warnings = [];
  if (site.mqttConnected === false) {
    warnings.push("MQTT getrennt");
  }
  if (site.solarbankOnline === false) {
    warnings.push("Solarbank offline");
  }
  if (site.smartmeterOnline === false) {
    warnings.push("Smart Meter offline");
  }
  const offline = site.devices.filter((d) => d.online === false).length;
  if (offline > 0) {
    warnings.push(`${offline} Ger\xE4t(e) offline`);
  }
  if (site.soc <= 15) {
    warnings.push("Akkustand kritisch");
  } else if (site.soc <= 25) {
    warnings.push("Akkustand niedrig");
  }
  if (site.batteryTemp !== null && site.batteryTemp >= 50) {
    warnings.push("Batterietemperatur hoch");
  } else if (site.batteryTemp !== null && site.batteryTemp >= 45) {
    warnings.push("Batterietemperatur erh\xF6ht");
  }
  const healthClass = warnings.some(
    (w) => w.includes("offline") || w.includes("kritisch") || w.includes("hoch") || w.includes("getrennt")
  ) ? "bad" : warnings.length ? "warn" : "good";
  return { healthClass, healthText: warnings.length ? warnings.join(" \xB7 ") : "Alles OK", warnings };
}
const BASE_STYLE = `
font-family:Arial,sans-serif;color:#fff;background:linear-gradient(145deg,#07111d,#0e1b29);
padding:18px;border-radius:16px;border:1px solid rgba(255,255,255,.08);box-sizing:border-box
`;
function buildLiveWidgetHtml(site) {
  const charge = site.batteryCharge;
  const discharge = site.batteryDischarge;
  const batteryMode = charge > 0 ? "L\xE4dt" : discharge > 0 ? "Entl\xE4dt" : "Bereit";
  const batteryPower = charge > 0 ? charge : discharge > 0 ? discharge : 0;
  const batteryArrow = charge > 0 ? "\u2193" : discharge > 0 ? "\u2191" : "\u2022";
  const batteryClass = charge > 0 ? "charge" : discharge > 0 ? "discharge" : "idle";
  const gridLabel = site.gridImport > 0 ? "Netzbezug" : site.gridExport > 0 ? "Einspeisung" : "Netz";
  const gridPower = Math.max(site.gridImport, site.gridExport);
  const gridArrow = site.gridImport > 0 ? "\u2190" : site.gridExport > 0 ? "\u2192" : "\u2022";
  const gridClass = site.gridImport > 0 ? "import" : site.gridExport > 0 ? "export" : "idle";
  const soc = Math.max(0, Math.min(100, site.soc));
  const onlineDevices = site.devices.filter((d) => d.online === true).length;
  const offlineDevices = site.devices.filter((d) => d.online === false).length;
  const { healthClass, healthText } = evaluateWarnings(site);
  const updated = new Date(site.updatedAt).toLocaleString("de-DE");
  return `
<style>
.solix-live{${BASE_STYLE};border-radius:18px;box-shadow:0 12px 28px rgba(0,0,0,.35)}
.solix-live *{box-sizing:border-box}.sl-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}.sl-title-wrap{display:flex;align-items:center;gap:12px}.sl-logo{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06);font-size:29px}.sl-title{font-size:30px;font-weight:900;line-height:1}.sl-subtitle{font-size:15px;color:#bdc7d3;margin-top:6px}.sl-health{padding:8px 12px;border-radius:10px;font-size:15px;font-weight:900}.sl-health.good{color:#52d273;border:1px solid #1a8e43;background:rgba(0,120,45,.14)}.sl-health.warn{color:#ffbb33;border:1px solid #c58b18;background:rgba(180,120,0,.13)}.sl-health.bad{color:#ff6b6b;border:1px solid #c04444;background:rgba(170,40,40,.13)}
.sl-flow{display:grid;grid-template-columns:minmax(185px,1fr) 64px minmax(230px,1.16fr) 64px minmax(185px,1fr);grid-template-rows:170px 30px 138px;gap:8px;align-items:center}.sl-card{height:100%;border-radius:14px;padding:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.11)}.sl-card.solar{grid-column:1;grid-row:1;border-color:#e7bd00}.sl-card.home{grid-column:3;grid-row:1;border-color:#178fd6}.sl-card.grid{grid-column:5;grid-row:1}.sl-card.grid.import{border-color:#e96f00}.sl-card.grid.export{border-color:#1eaa55}.sl-card.battery{grid-column:2/5;grid-row:3;justify-self:center;width:min(460px,88%);display:grid;grid-template-columns:78px minmax(0,1fr);gap:16px;text-align:left;padding:14px 18px;align-items:center;overflow:hidden}.sl-icon{font-size:44px;margin-bottom:5px}.sl-name{font-size:19px;font-weight:900}.sl-value{font-size:36px;font-weight:900;line-height:1.05;margin-top:6px}.sl-card.solar .sl-value{color:#ffc928}.sl-card.home .sl-value{color:#3299ff}.sl-card.grid.import .sl-value{color:#ff7c16}.sl-card.grid.export .sl-value{color:#52d273}.sl-card.battery.charge .sl-battery-value{color:#52d273}.sl-card.battery.discharge .sl-battery-value{color:#70d63d}.sl-secondary{font-size:14px;color:#b9c3cf;margin-top:5px}
.sl-arrow{display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:38px;font-weight:900;line-height:1}.sl-arrow small{font-size:14px;margin-top:7px;white-space:nowrap}.sl-arrow.solar{grid-column:2;grid-row:1;color:#42dc4c}.sl-arrow.grid{grid-column:4;grid-row:1;color:#ff8a18}.sl-arrow.battery{grid-column:3;grid-row:2;color:#61d938;font-size:28px}.sl-battery-shell{position:relative;width:58px;height:96px;padding:6px;border:4px solid #d7dde3;border-radius:8px;background:linear-gradient(90deg,#6e747a,#f0f2f4 18%,#9ca2a8 45%,#eceff1 72%,#676d73);box-shadow:inset 0 0 0 2px #30363c,0 4px 12px rgba(0,0,0,.35)}.sl-battery-shell:before{content:'';position:absolute;top:-10px;left:17px;width:18px;height:8px;border:3px solid #cfd4d8;border-bottom:0;border-radius:4px 4px 0 0;background:#8d9398}.sl-battery-inner{width:100%;height:100%;padding:3px;display:flex;flex-direction:column-reverse;gap:3px;border-radius:3px;background:#10171e}.sl-battery-segment{flex:1;border-radius:2px;background:linear-gradient(90deg,#2fae18,#8bf34a 48%,#42c521)}.sl-battery-segment.empty{background:#162029}.sl-battery-name{font-size:19px;font-weight:900;white-space:nowrap}.sl-battery-value{font-size:29px;font-weight:900;margin-top:4px;white-space:nowrap}.sl-bar{height:16px;border:2px solid #dce5ee;border-radius:8px;padding:2px;background:rgba(0,0,0,.35);margin-top:8px;width:100%;overflow:hidden}.sl-bar-fill{height:100%;border-radius:4px;min-width:2px;max-width:100%}
.sl-status{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:24px}.sl-status-card{padding:10px 12px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.025)}.sl-status-line{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:900}.sl-dot{width:10px;height:10px;border-radius:50%}.sl-dot.good{background:#43d15c}.sl-dot.bad{background:#ff6262}.sl-dot.unknown{background:#7a8794}.sl-status-sub{font-size:12px;color:#b5bfcb;margin-top:4px;margin-left:18px}.sl-footer{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;color:#aeb8c5}.sl-credit{margin-top:8px;font-size:11px;color:#7f8b98;text-align:center}
@media(max-width:720px){.sl-flow{grid-template-columns:1fr;grid-template-rows:auto}.sl-card.solar,.sl-card.home,.sl-card.grid,.sl-card.battery,.sl-arrow.solar,.sl-arrow.grid,.sl-arrow.battery{grid-column:1;grid-row:auto;width:100%}.sl-status{grid-template-columns:1fr}.sl-footer{grid-template-columns:1fr}}
</style>
<div class="solix-live">
<div class="sl-head"><div class="sl-title-wrap"><div class="sl-logo">\u2600\uFE0F</div><div><div class="sl-title">${escapeHtml(site.siteName)}</div><div class="sl-subtitle">${escapeHtml(site.solarbankName)} \xB7 ${escapeHtml(site.solarbankModel)}</div></div></div><div class="sl-health ${healthClass}">${escapeHtml(healthText)}</div></div>
<div class="sl-flow">
<div class="sl-card solar"><div class="sl-icon">\u2600\uFE0F</div><div class="sl-name">SOLAR</div><div class="sl-value">${watts(site.solar)}</div></div>
<div class="sl-arrow solar">\u2192<small>${watts(site.solar)}</small></div>
<div class="sl-card home"><div class="sl-icon">\u{1F3E0}</div><div class="sl-name">HAUSVERBRAUCH</div><div class="sl-value">${watts(site.home)}</div><div class="sl-secondary">Jetzt</div></div>
<div class="sl-arrow grid">${gridArrow}<small>${watts(gridPower)}</small></div>
<div class="sl-card grid ${gridClass}"><div class="sl-icon">\u26A1</div><div class="sl-name">${escapeHtml(gridLabel.toUpperCase())}</div><div class="sl-value">${watts(gridPower)}</div></div>
<div class="sl-arrow battery">${batteryArrow}</div>
<div class="sl-card battery ${batteryClass}">
<div class="sl-battery-shell"><div class="sl-battery-inner">
<span class="sl-battery-segment ${soc < 1 ? "empty" : ""}"></span>
<span class="sl-battery-segment ${soc < 26 ? "empty" : ""}"></span>
<span class="sl-battery-segment ${soc < 51 ? "empty" : ""}"></span>
<span class="sl-battery-segment ${soc < 76 ? "empty" : ""}"></span>
</div></div>
<div><div class="sl-battery-name">AKKU \xB7 ${batteryMode.toUpperCase()}</div><div class="sl-battery-value">${soc.toFixed(0)} % \xB7 ${watts(batteryPower)}</div><div class="sl-secondary">${temp(site.batteryTemp)}</div><div class="sl-bar"><div class="sl-bar-fill" style="width:${soc}%;background:${soc >= 60 ? "#4bd14e" : soc >= 25 ? "#ffbb33" : "#ff5b5b"}"></div></div></div>
</div></div>
<div class="sl-status">
<div class="sl-status-card"><div class="sl-status-line"><span class="sl-dot ${dot(site.mqttConnected)}"></span>MQTT ${site.mqttConnected === true ? "VERBUNDEN" : site.mqttConnected === false ? "GETRENNT" : "\u2013"}</div><div class="sl-status-sub">anker-solix Cloud/MQTT</div></div>
<div class="sl-status-card"><div class="sl-status-line"><span class="sl-dot ${dot(site.solarbankOnline)}"></span>SOLARBANK ${site.solarbankOnline === true ? "ONLINE" : site.solarbankOnline === false ? "OFFLINE" : "\u2013"}</div><div class="sl-status-sub">${escapeHtml(site.solarbankModel || "\u2013")}</div></div>
<div class="sl-status-card"><div class="sl-status-line"><span class="sl-dot ${dot(site.smartmeterOnline)}"></span>SMART METER ${site.smartmeterOnline === true ? "ONLINE" : site.smartmeterOnline === false ? "OFFLINE" : "\u2013"}</div><div class="sl-status-sub">Cloud-Status</div></div>
</div>
<div class="sl-footer"><span>Ger\xE4te: ${onlineDevices}/${site.devices.length} online${offlineDevices ? ` \xB7 ${offlineDevices} offline` : ""}</span><span>Site: ${escapeHtml(site.siteKey)}</span><span>Aktualisiert: ${escapeHtml(updated)}</span></div>
<p class="sl-credit">Dashboard-Konzept: <a href="https://github.com/michihorn64/ioBroker.solix4" style="color:#56a8ff">ioBroker.solix4</a> (Michael Horn) \u2014 Danke!</p>
</div>`;
}
function buildSettingsWidgetHtml(site) {
  const s = site.settings;
  const tile = (icon, title, value, note, cls) => `<div class="ss-tile ${cls}"><div class="ss-tile-icon">${icon}</div><div class="ss-tile-title">${title.map((l) => `<span>${escapeHtml(l)}</span>`).join("")}</div><div class="ss-tile-value">${escapeHtml(value)}</div><div class="ss-tile-note">${escapeHtml(note)}</div></div>`;
  const exportText = s.allowGridExport === true ? "aktiv" : s.allowGridExport === false ? "deaktiviert" : "\u2013";
  return `
<style>
.solix-settings{${BASE_STYLE};border-radius:18px;box-shadow:0 12px 28px rgba(0,0,0,.35)}.solix-settings *{box-sizing:border-box}.ss-head{display:flex;align-items:center;gap:10px;margin-bottom:11px}.ss-head-icon{font-size:26px}.ss-head-title{font-size:23px;font-weight:900}.ss-groups{display:grid;grid-template-columns:1fr 1fr 1.55fr;gap:10px}.ss-group{border-radius:12px;padding:8px;border:1px solid}.ss-group.orange{border-color:#e96f00}.ss-group.green{border-color:#2f9f24}.ss-group.blue{border-color:#178fd6}.ss-group-title{font-size:18px;font-weight:900;padding:1px 4px 8px}.ss-group.orange .ss-group-title{color:#ff8a18}.ss-group.green .ss-group-title{color:#65d43b}.ss-group.blue .ss-group-title{color:#32a4ff}.ss-grid{display:grid;gap:7px}.ss-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.ss-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.ss-tile{min-height:140px;border-radius:10px;border:1px solid;padding:10px 7px;display:grid;grid-template-rows:44px 36px auto auto;align-items:center;justify-items:center;text-align:center;background:rgba(0,0,0,.14)}.ss-tile.orange{border-color:#d86c0b}.ss-tile.green{border-color:#379e2f}.ss-tile.blue{border-color:#178fd6}.ss-tile-icon{font-size:25px}.ss-tile-title{font-size:12px;line-height:1.05;font-weight:900;display:flex;flex-direction:column}.ss-tile-value{font-size:26px;font-weight:900;margin-top:4px}.ss-tile.orange .ss-tile-value{color:#ff8a18}.ss-tile.green .ss-tile-value{color:#61d63c}.ss-tile.blue .ss-tile-value{color:#32a4ff}.ss-tile-note{font-size:11px;color:#b8c1cc;margin-top:6px}
@media(max-width:760px){.ss-groups{grid-template-columns:1fr}}
</style>
<div class="solix-settings">
<div class="ss-head"><div class="ss-head-icon">\u2699\uFE0F</div><div class="ss-head-title">EINSTELLUNGEN UND GRENZWERTE</div></div>
<div class="ss-groups">
<div class="ss-group orange"><div class="ss-group-title">\u26A1 LEISTUNG</div><div class="ss-grid two">
${tile("\u26A1", ["AUSGANGS-", "LEISTUNG"], s.appOutputPower !== null ? watts(s.appOutputPower) : "\u2013", "ac_output_limit", "orange")}
${tile("\u{1F3E0}", ["HAUSLAST-", "ZIELWERT"], s.homeLoadPreset !== null ? watts(s.homeLoadPreset) : "\u2013", "set_output_power", "orange")}
</div></div>
<div class="ss-group green"><div class="ss-group-title">\u{1F50B} AKKU</div><div class="ss-grid two">
${tile("\u{1F50B}", ["LADEGRENZE", "OBEN"], percent(s.chargeUpperLimit), "charge_upper_limit", "green")}
${tile("\u{1F50B}", ["ENTLADEGRENZE", "UNTEN"], percent(s.dischargeLowerLimit), "discharge_lower_limit", "green")}
</div></div>
<div class="ss-group blue"><div class="ss-group-title">\u{1F310} NETZ</div><div class="ss-grid three">
${tile("\u21BB", ["NETZEIN-", "SPEISUNG"], exportText, "allow_grid_export", "blue")}
${tile("\u{1F50C}", ["AC-EINGANGS-", "GRENZE"], s.acInputLimit !== null ? watts(s.acInputLimit) : "\u2013", "ac_input_power", "blue")}
${tile("\u2699", ["BETRIEBS-", "MODUS"], s.operatingMode || "\u2013", "preset_usage_mode", "blue")}
</div></div>
</div></div>`;
}
function buildDashboardWidgetHtml(site) {
  const live = buildLiveWidgetHtml(site);
  const settings = buildSettingsWidgetHtml(site);
  const strip = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, "");
  const liveStyle = (live.match(/<style>[\s\S]*?<\/style>/) || [""])[0];
  const settingsStyle = (settings.match(/<style>[\s\S]*?<\/style>/) || [""])[0];
  return `${liveStyle}${settingsStyle}<style>.solix-dashboard{display:grid;gap:10px}</style><div class="solix-dashboard">${strip(live)}${strip(settings)}</div>`;
}
function buildEnergyWidgetHtml(site) {
  const e = site.energy;
  const tile = (icon, label, value, cls) => `<div class="se-tile ${cls}"><div class="se-icon">${icon}</div><div class="se-label">${escapeHtml(label)}</div><div class="se-value">${escapeHtml(value)}</div></div>`;
  return `
<style>
.solix-energy{${BASE_STYLE}}.solix-energy *{box-sizing:border-box}.se-head{display:flex;justify-content:space-between;gap:14px;margin-bottom:14px}.se-title{font-size:28px;font-weight:900}.se-subtitle{font-size:14px;color:#aeb8c5;margin-top:4px}.se-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.se-tile{min-height:120px;padding:14px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);text-align:center}.se-tile.solar{border-color:#d9b400}.se-tile.home{border-color:#178fd6}.se-tile.grid{border-color:#e96f00}.se-tile.export{border-color:#1eaa55}.se-tile.battery{border-color:#379e2f}.se-tile.metric{border-color:#8d63d8}.se-icon{font-size:28px;margin-bottom:6px}.se-label{font-size:14px;font-weight:800;color:#c4ccd5}.se-value{font-size:24px;font-weight:900;margin-top:6px}
@media(max-width:950px){.se-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
<div class="solix-energy">
<div class="se-head"><div><div class="se-title">Energie heute \xB7 ${escapeHtml(site.siteName)}</div><div class="se-subtitle">${escapeHtml(site.siteId)}</div></div></div>
<div class="se-grid">
${tile("\u2600\uFE0F", "Solarproduktion", kwh(e.solar), "solar")}
${tile("\u{1F3E0}", "Hausverbrauch", kwh(e.home), "home")}
${tile("\u26A1", "Netzbezug", kwh(e.gridImport), "grid")}
${tile("\u2197", "Einspeisung", kwh(e.gridExport), "export")}
${tile("\u{1F50B}", "Akku geladen", kwh(e.batteryCharge), "battery")}
${tile("\u{1F50B}", "Akku entladen", kwh(e.batteryDischarge), "battery")}
${tile("\u{1F6E1}\uFE0F", "Autarkie", e.autarky !== null ? `${e.autarky.toFixed(1)} %` : "\u2013", "metric")}
${tile("\u267B\uFE0F", "Eigenverbrauch", e.selfConsumption !== null ? `${e.selfConsumption.toFixed(1)} %` : "\u2013", "metric")}
</div></div>`;
}
function buildDiagnosisWidgetHtml(site) {
  const { warnings, healthText, healthClass } = evaluateWarnings(site);
  const severity = healthClass === "good" ? "ok" : healthClass === "warn" ? "warning" : "error";
  const warningCards = warnings.length > 0 ? warnings.map(
    (w) => `<div class="sd-warning ${w.includes("kritisch") || w.includes("offline") || w.includes("getrennt") ? "error" : "warning"}"><div class="sd-warning-title">${escapeHtml(w)}</div></div>`
  ).join("") : `<div class="sd-warning ok"><div class="sd-warning-title">\u{1F7E2} Keine Warnungen</div></div>`;
  const deviceRows = site.devices.map(
    (d) => `<tr><td><span class="sd-dot ${dot(d.online)}"></span></td><td>${escapeHtml(d.typeLabel)}</td><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.model)}</td></tr>`
  ).join("");
  return `
<style>
.solix-diagnosis{${BASE_STYLE}}.solix-diagnosis *{box-sizing:border-box}.sd-head{display:flex;justify-content:space-between;gap:14px;margin-bottom:15px}.sd-title{font-size:27px;font-weight:900}.sd-status{padding:9px 14px;border-radius:10px;font-size:17px;font-weight:900}.sd-status.ok{color:#52d273;border:1px solid #1a8e43}.sd-status.warning{color:#ffbb33;border:1px solid #c58b18}.sd-status.error{color:#ff6b6b;border:1px solid #c04444}.sd-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}.sd-card{padding:12px;border-radius:11px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}.sd-label{font-size:12px;color:#9eabb8}.sd-value{font-size:18px;font-weight:800;margin-top:4px}.sd-warning{padding:11px 13px;border-radius:10px;border:1px solid;margin-bottom:8px}.sd-warning.ok{border-color:#1a8e43}.sd-warning.warning{border-color:#c58b18}.sd-warning.error{border-color:#c04444}.sd-dot{display:inline-block;width:10px;height:10px;border-radius:50%}.sd-dot.good{background:#52d273}.sd-dot.bad{background:#ff6b6b}.sd-dot.unknown{background:#7a8794}
.solix-diagnosis table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}.solix-diagnosis th,.solix-diagnosis td{padding:8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}
</style>
<div class="solix-diagnosis">
<div class="sd-head"><div><div class="sd-title">Diagnose ${escapeHtml(site.siteName)}</div><div class="sd-subtitle">${escapeHtml(site.siteId)}</div></div><div class="sd-status ${severity}">${escapeHtml(healthText)}</div></div>
<div class="sd-grid">
<div class="sd-card"><div class="sd-label">MQTT</div><div class="sd-value">${site.mqttConnected === true ? "Verbunden" : site.mqttConnected === false ? "Getrennt" : "\u2013"}</div></div>
<div class="sd-card"><div class="sd-label">Solarbank</div><div class="sd-value">${site.solarbankOnline === true ? "Online" : site.solarbankOnline === false ? "Offline" : "\u2013"}</div></div>
<div class="sd-card"><div class="sd-label">Smart Meter</div><div class="sd-value">${site.smartmeterOnline === true ? "Online" : site.smartmeterOnline === false ? "Offline" : "\u2013"}</div></div>
<div class="sd-card"><div class="sd-label">Warnungen</div><div class="sd-value">${warnings.length}</div></div>
<div class="sd-card"><div class="sd-label">Ger\xE4te</div><div class="sd-value">${site.devices.length}</div></div>
<div class="sd-card"><div class="sd-label">SOC</div><div class="sd-value">${site.soc.toFixed(0)} %</div></div>
</div>
${warningCards}
<table><thead><tr><th>Status</th><th>Typ</th><th>Name</th><th>Modell</th></tr></thead><tbody>${deviceRows}</tbody></table>
</div>`;
}
function buildDeviceInventoryHtml(site) {
  const typeSummary = /* @__PURE__ */ new Map();
  for (const d of site.devices) {
    const item = typeSummary.get(d.type) || { label: d.typeLabel, count: 0, online: 0, offline: 0 };
    item.count += 1;
    if (d.online === true) {
      item.online += 1;
    } else if (d.online === false) {
      item.offline += 1;
    }
    typeSummary.set(d.type, item);
  }
  const typeCards = [...typeSummary.values()].map(
    (t) => `<div class="sdi-type"><div class="sdi-type-title">${escapeHtml(t.label)}</div><div class="sdi-type-count">${t.count}</div><div class="sdi-type-meta">${t.online} online \xB7 ${t.offline} offline</div></div>`
  ).join("");
  const rows = site.devices.map(
    (d) => `<tr><td><span class="sdi-dot ${dot(d.online)}"></span></td><td>${escapeHtml(d.typeLabel)}</td><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.model)}</td><td>${escapeHtml(d.key)}</td></tr>`
  ).join("");
  return `
<style>
.solix-device-inventory{${BASE_STYLE}}.solix-device-inventory *{box-sizing:border-box}.sdi-title{font-size:27px;font-weight:900}.sdi-types{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;margin:14px 0}.sdi-type{padding:12px;border-radius:11px;background:rgba(255,255,255,.04);border:1px solid #1a8e43}.sdi-type-title{font-size:14px;font-weight:800}.sdi-type-count{font-size:27px;font-weight:900;margin-top:5px}.sdi-dot{display:inline-block;width:10px;height:10px;border-radius:50%}.sdi-dot.good{background:#52d273}.sdi-dot.bad{background:#ff6b6b}.sdi-dot.unknown{background:#7a8794}
.solix-device-inventory table{width:100%;border-collapse:collapse;font-size:13px}.solix-device-inventory th,.solix-device-inventory td{padding:8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}
</style>
<div class="solix-device-inventory">
<div class="sdi-title">Ger\xE4te\xFCbersicht ${escapeHtml(site.siteName)}</div>
<div class="sdi-types">${typeCards || "Keine Ger\xE4te"}</div>
<table><thead><tr><th>Status</th><th>Typ</th><th>Name</th><th>Modell</th><th>ID</th></tr></thead><tbody>${rows}</tbody></table>
</div>`;
}
function buildOverviewHtml(sites) {
  const rows = sites.map((s) => {
    const offline = s.devices.filter((d) => d.online === false).length;
    return `<tr>
<td>${escapeHtml(s.siteName)}</td>
<td>${watts(s.solar)}</td>
<td>${watts(s.home)}</td>
<td>${watts(s.gridImport)}</td>
<td>${watts(s.gridExport)}</td>
<td>${s.soc.toFixed(0)} %</td>
<td>${s.mqttConnected === true ? "OK" : s.mqttConnected === false ? "\u2013" : "?"}</td>
<td>${s.devices.length - offline}/${s.devices.length}</td>
</tr>`;
  }).join("");
  return `
<style>
.solix-overview{${BASE_STYLE}}.solix-overview *{box-sizing:border-box}.so-title{font-size:28px;font-weight:900;margin-bottom:12px}
.solix-overview table{width:100%;border-collapse:collapse;font-size:13px}.solix-overview th,.solix-overview td{padding:8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}.solix-overview th{color:#aeb8c5}
</style>
<div class="solix-overview">
<div class="so-title">Anlagen-\xDCbersicht (${sites.length})</div>
<table><thead><tr><th>Site</th><th>Solar</th><th>Haus</th><th>Bezug</th><th>Einspeisung</th><th>SOC</th><th>MQTT</th><th>Online</th></tr></thead><tbody>${rows}</tbody></table>
<p style="font-size:11px;color:#7f8b98;margin-top:10px">Konzept: <a href="https://github.com/michihorn64/ioBroker.solix4" style="color:#56a8ff">ioBroker.solix4</a> (Michael Horn / michihorn64)</p>
</div>`;
}
function numEntity(entities, key) {
  return n(entities[key]);
}
function optionalNum(entities, key) {
  const v = entities[key];
  if (v === null || v === void 0 || v === "") {
    return null;
  }
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
}
function optionalBool(entities, key) {
  const v = entities[key];
  if (v === true || v === "true" || v === 1 || v === "1") {
    return true;
  }
  if (v === false || v === "false" || v === 0 || v === "0") {
    return false;
  }
  return null;
}
function cloudOnline(entities) {
  var _a;
  const raw = (_a = entities.cloud_state) != null ? _a : entities.mqtt_connection;
  if (raw === void 0 || raw === null || raw === "") {
    return null;
  }
  const text = typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? String(raw).toLowerCase() : "";
  if (text.includes("offline") || text.includes("disconnect") || text === "0" || text === "false") {
    return false;
  }
  if (text.includes("online") || text.includes("connect") || text === "1" || text === "true") {
    return true;
  }
  return null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildDashboardWidgetHtml,
  buildDeviceInventoryHtml,
  buildDiagnosisWidgetHtml,
  buildEnergyWidgetHtml,
  buildLiveWidgetHtml,
  buildOverviewHtml,
  buildSettingsWidgetHtml,
  cloudOnline,
  escapeHtml,
  numEntity,
  optionalBool,
  optionalNum
});
//# sourceMappingURL=htmlDashboards.js.map
