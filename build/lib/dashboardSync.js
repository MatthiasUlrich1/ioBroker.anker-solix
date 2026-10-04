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
var dashboardSync_exports = {};
__export(dashboardSync_exports, {
  syncHtmlDashboards: () => syncHtmlDashboards
});
module.exports = __toCommonJS(dashboardSync_exports);
var import_htmlDashboards = require("./htmlDashboards");
const TYPE_LABELS = {
  solarbank: "Solarbank",
  combiner_box: "Power Dock / Combiner",
  smartmeter: "Smart Meter",
  smartplug: "Smart Plug",
  ev_charger: "EV-Lader",
  system: "System",
  site: "Site",
  pps: "Power Station",
  inverter: "Wechselrichter",
  hes: "Home Energy System",
  powerpanel: "Power Panel",
  vehicle: "Fahrzeug"
};
function siteKey(siteId) {
  const id = siteId.trim();
  return id.length > 8 ? id.slice(0, 8) : id || "default";
}
function entityNum(dev, key) {
  return dev ? (0, import_htmlDashboards.numEntity)(dev.entities, key) : 0;
}
function pickPrimarySolarbank(devices) {
  const banks = devices.filter((d) => d.info.type === "solarbank");
  if (!banks.length) {
    return void 0;
  }
  return banks.sort((a, b) => {
    var _a, _b;
    return ((_a = b.info.generation) != null ? _a : 0) - ((_b = a.info.generation) != null ? _b : 0);
  })[0];
}
function pickCombiner(devices) {
  return devices.find((d) => d.info.type === "combiner_box");
}
function pickSmartmeter(devices) {
  return devices.find((d) => d.info.type === "smartmeter");
}
function pickSystem(devices) {
  return devices.find((d) => d.info.type === "system" || d.info.type === "site");
}
function powerSource(devices) {
  const combiner = pickCombiner(devices);
  const bank = pickPrimarySolarbank(devices);
  const primary = combiner || bank;
  return { solar: primary, home: primary, soc: primary || combiner || bank };
}
function statsSource(devices) {
  const combiner = pickCombiner(devices);
  if (combiner == null ? void 0 : combiner.hasStatistics) {
    return combiner;
  }
  const bank = pickPrimarySolarbank(devices);
  if (bank == null ? void 0 : bank.hasStatistics) {
    return bank;
  }
  return devices.find((d) => d.hasStatistics);
}
function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}
function calcAutarky(home, gridImport) {
  if (home === null || gridImport === null || home <= 0) {
    return null;
  }
  return Math.round(clampPercent((home - gridImport) / home * 100) * 10) / 10;
}
function calcSelfConsumption(solar, gridExport) {
  if (solar === null || gridExport === null || solar <= 0) {
    return null;
  }
  return Math.round(clampPercent((solar - gridExport) / solar * 100) * 10) / 10;
}
function buildSiteSnapshot(siteId, devices) {
  var _a, _b, _c, _d, _e;
  const { solar: solarDev, home: homeDev, soc: socDev } = powerSource(devices);
  const bank = pickPrimarySolarbank(devices);
  const meter = pickSmartmeter(devices);
  const system = pickSystem(devices);
  const stats = statsSource(devices);
  const settingsDev = pickCombiner(devices) || bank;
  const solarPower = Math.max(
    entityNum(solarDev, "total_pv_power"),
    entityNum(solarDev, "input_power"),
    entityNum(solarDev, "output_power_total")
  );
  const homePower = entityNum(homeDev, "home_power") || entityNum(homeDev, "home_load_power");
  const gridImport = entityNum(homeDev, "grid_to_home_power");
  const gridExport = entityNum(homeDev, "photovoltaic_to_grid_power");
  const batteryCharge = entityNum(socDev, "bat_charge_power");
  const batteryDischarge = entityNum(socDev, "bat_discharge_power");
  const soc = entityNum(socDev, "total_state_of_charge") || entityNum(socDev, "state_of_charge") || entityNum(bank, "state_of_charge");
  const deviceRows = devices.filter((d) => !["system", "site"].includes(d.info.type)).map((d) => ({
    type: d.info.type,
    typeLabel: TYPE_LABELS[d.info.type] || d.info.type,
    name: d.info.name || d.info.id,
    model: d.info.model || d.info.device_pn || "\u2013",
    online: (0, import_htmlDashboards.cloudOnline)(d.entities),
    key: d.info.id
  }));
  const energySolar = stats ? (0, import_htmlDashboards.optionalNum)(stats.entities, "daily_solar_production") : null;
  const energyHome = stats ? (0, import_htmlDashboards.optionalNum)(stats.entities, "daily_home_usage") : null;
  const energyImport = stats ? (0, import_htmlDashboards.optionalNum)(stats.entities, "daily_grid_import") : null;
  const energyExport = stats ? (_a = (0, import_htmlDashboards.optionalNum)(stats.entities, "daily_grid_export")) != null ? _a : (0, import_htmlDashboards.optionalNum)(stats.entities, "daily_solar_to_grid") : null;
  const energyCharge = stats ? (_b = (0, import_htmlDashboards.optionalNum)(stats.entities, "daily_charge_energy")) != null ? _b : (0, import_htmlDashboards.optionalNum)(stats.entities, "daily_solar_to_battery") : null;
  const energyDischarge = stats ? (0, import_htmlDashboards.optionalNum)(stats.entities, "daily_discharge_energy") : null;
  const mqttDev = devices.find((d) => d.entities.mqtt_connection !== void 0) || bank || pickCombiner(devices);
  const mqttVal = mqttDev ? (0, import_htmlDashboards.optionalBool)(mqttDev.entities, "mqtt_connection") : null;
  return {
    siteId,
    siteKey: siteKey(siteId),
    siteName: (system == null ? void 0 : system.info.name) || ((system == null ? void 0 : system.entities.site_name) !== void 0 ? String(system.entities.site_name) : "") || siteId || "Anker SOLIX",
    solar: solarPower,
    home: homePower,
    gridImport,
    gridExport,
    batteryCharge,
    batteryDischarge,
    soc,
    batteryTemp: socDev ? (0, import_htmlDashboards.optionalNum)(socDev.entities, "device_temperature") : null,
    mqttConnected: mqttVal,
    solarbankName: (bank == null ? void 0 : bank.info.name) || "Solarbank",
    solarbankModel: (bank == null ? void 0 : bank.info.model) || (bank == null ? void 0 : bank.info.device_pn) || "\u2013",
    solarbankOnline: bank ? (0, import_htmlDashboards.cloudOnline)(bank.entities) : null,
    smartmeterOnline: meter ? (0, import_htmlDashboards.cloudOnline)(meter.entities) : null,
    devices: deviceRows,
    settings: {
      appOutputPower: settingsDev ? (0, import_htmlDashboards.optionalNum)(settingsDev.entities, "ac_output_limit") : null,
      homeLoadPreset: settingsDev ? (0, import_htmlDashboards.optionalNum)(settingsDev.entities, "set_output_power") : null,
      chargeUpperLimit: settingsDev ? (_c = (0, import_htmlDashboards.optionalNum)(settingsDev.entities, "charge_upper_limit")) != null ? _c : (0, import_htmlDashboards.optionalNum)(settingsDev.entities, "max_soc") : null,
      dischargeLowerLimit: settingsDev ? (_d = (0, import_htmlDashboards.optionalNum)(settingsDev.entities, "discharge_lower_limit")) != null ? _d : (0, import_htmlDashboards.optionalNum)(settingsDev.entities, "min_soc") : null,
      allowGridExport: settingsDev ? (0, import_htmlDashboards.optionalBool)(settingsDev.entities, "allow_grid_export") : null,
      acInputLimit: settingsDev ? (0, import_htmlDashboards.optionalNum)(settingsDev.entities, "ac_input_power") : null,
      operatingMode: ((_e = settingsDev == null ? void 0 : settingsDev.entities.preset_usage_mode) == null ? void 0 : _e.toString()) || "\u2013"
    },
    energy: {
      solar: energySolar,
      home: energyHome,
      gridImport: energyImport,
      gridExport: energyExport,
      batteryCharge: energyCharge,
      batteryDischarge: energyDischarge,
      autarky: calcAutarky(energyHome, energyImport),
      selfConsumption: calcSelfConsumption(energySolar, energyExport)
    },
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function ensureHtmlState(adapter, id, name) {
  await adapter.setObjectNotExistsAsync(id, {
    type: "state",
    common: {
      name,
      type: "string",
      role: "html",
      read: true,
      write: false
    },
    native: {}
  });
}
async function setHtml(adapter, id, html) {
  await adapter.setState(id, html, true);
}
async function syncHtmlDashboards(adapter, devices) {
  if (!devices.length) {
    return;
  }
  const bySite = /* @__PURE__ */ new Map();
  for (const dev of devices) {
    const sid = dev.info.site_id || dev.info.id;
    if (!sid) {
      continue;
    }
    const list = bySite.get(sid) || [];
    list.push(dev);
    bySite.set(sid, list);
  }
  const snapshots = [];
  for (const [siteId, siteDevices] of bySite) {
    const snap = buildSiteSnapshot(siteId, siteDevices);
    snapshots.push(snap);
    const base = `${adapter.namespace}.dashboard.sites.${snap.siteKey}`;
    await adapter.setObjectNotExistsAsync(`${adapter.namespace}.dashboard`, {
      type: "channel",
      common: { name: "HTML dashboards (solix4-style)" },
      native: {}
    });
    await adapter.setObjectNotExistsAsync(`${adapter.namespace}.dashboard.sites`, {
      type: "channel",
      common: { name: "Sites" },
      native: {}
    });
    await adapter.setObjectNotExistsAsync(base, {
      type: "device",
      common: { name: snap.siteName },
      native: { siteId }
    });
    const pages = [
      ["live", "Live energy flow", (0, import_htmlDashboards.buildLiveWidgetHtml)(snap)],
      ["energy", "Daily energy (kWh)", (0, import_htmlDashboards.buildEnergyWidgetHtml)(snap)],
      ["settings", "Settings & limits", (0, import_htmlDashboards.buildSettingsWidgetHtml)(snap)],
      ["dashboard", "Combined dashboard", (0, import_htmlDashboards.buildDashboardWidgetHtml)(snap)],
      ["diagnosis", "Diagnosis", (0, import_htmlDashboards.buildDiagnosisWidgetHtml)(snap)],
      ["devices", "Device inventory", (0, import_htmlDashboards.buildDeviceInventoryHtml)(snap)]
    ];
    for (const [suffix, label, html] of pages) {
      const stateId = `${base}.${suffix}.html`;
      await ensureHtmlState(adapter, stateId, `${snap.siteName} \u2014 ${label}`);
      await setHtml(adapter, stateId, html);
    }
  }
  if (snapshots.length) {
    const overviewId = `${adapter.namespace}.dashboard.overview.html`;
    await ensureHtmlState(adapter, overviewId, "Multi-site overview");
    await setHtml(adapter, overviewId, (0, import_htmlDashboards.buildOverviewHtml)(snapshots));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  syncHtmlDashboards
});
//# sourceMappingURL=dashboardSync.js.map
