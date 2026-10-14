/**
 * Sync HTML dashboard states (solix4-inspired layout for anker-solix).
 *
 * @see https://github.com/michihorn64/ioBroker.solix4
 */

import type { BridgeDevice } from "./types";
import {
	buildDashboardWidgetHtml,
	buildDeviceInventoryHtml,
	buildDiagnosisWidgetHtml,
	buildEnergyWidgetHtml,
	buildLiveWidgetHtml,
	buildOverviewHtml,
	buildSettingsWidgetHtml,
	cloudOnline,
	numEntity,
	optionalBool,
	optionalNum,
	type DashboardDeviceRow,
	type DashboardSiteSnapshot,
} from "./htmlDashboards";

const TYPE_LABELS: Record<string, string> = {
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
	vehicle: "Fahrzeug",
};

function siteKey(siteId: string): string {
	const id = siteId.trim();
	return id.length > 8 ? id.slice(0, 8) : id || "default";
}

function entityNum(dev: BridgeDevice | undefined, key: string): number {
	return dev ? numEntity(dev.entities, key) : 0;
}

function pickPrimarySolarbank(devices: BridgeDevice[]): BridgeDevice | undefined {
	const banks = devices.filter(d => d.info.type === "solarbank");
	if (!banks.length) {
		return undefined;
	}
	return banks.sort((a, b) => (b.info.generation ?? 0) - (a.info.generation ?? 0))[0];
}

function pickCombiner(devices: BridgeDevice[]): BridgeDevice | undefined {
	return devices.find(d => d.info.type === "combiner_box");
}

function pickSmartmeter(devices: BridgeDevice[]): BridgeDevice | undefined {
	return devices.find(d => d.info.type === "smartmeter");
}

function pickSystem(devices: BridgeDevice[]): BridgeDevice | undefined {
	return devices.find(d => d.info.type === "system" || d.info.type === "site");
}

function powerSource(devices: BridgeDevice[]): {
	solar: BridgeDevice | undefined;
	home: BridgeDevice | undefined;
	soc: BridgeDevice | undefined;
} {
	const combiner = pickCombiner(devices);
	const bank = pickPrimarySolarbank(devices);
	const primary = combiner || bank;
	return { solar: primary, home: primary, soc: primary || combiner || bank };
}

function statsSource(devices: BridgeDevice[]): BridgeDevice | undefined {
	const combiner = pickCombiner(devices);
	if (combiner?.hasStatistics) {
		return combiner;
	}
	const bank = pickPrimarySolarbank(devices);
	if (bank?.hasStatistics) {
		return bank;
	}
	return devices.find(d => d.hasStatistics);
}

function clampPercent(value: number): number {
	return Math.max(0, Math.min(100, value));
}

function calcAutarky(home: number | null, gridImport: number | null): number | null {
	if (home === null || gridImport === null || home <= 0) {
		return null;
	}
	return Math.round(clampPercent(((home - gridImport) / home) * 100) * 10) / 10;
}

function calcSelfConsumption(solar: number | null, gridExport: number | null): number | null {
	if (solar === null || gridExport === null || solar <= 0) {
		return null;
	}
	return Math.round(clampPercent(((solar - gridExport) / solar) * 100) * 10) / 10;
}

function buildSiteSnapshot(siteId: string, devices: BridgeDevice[]): DashboardSiteSnapshot {
	const { solar: solarDev, home: homeDev, soc: socDev } = powerSource(devices);
	const bank = pickPrimarySolarbank(devices);
	const meter = pickSmartmeter(devices);
	const system = pickSystem(devices);
	const stats = statsSource(devices);
	const settingsDev = pickCombiner(devices) || bank;

	const solarPower = Math.max(
		entityNum(solarDev, "total_pv_power"),
		entityNum(solarDev, "input_power"),
		entityNum(solarDev, "output_power_total"),
	);
	const homePower = entityNum(homeDev, "home_power") || entityNum(homeDev, "home_load_power");
	const gridImport = entityNum(homeDev, "grid_to_home_power");
	const gridExport = entityNum(homeDev, "photovoltaic_to_grid_power");
	const batteryCharge = entityNum(socDev, "bat_charge_power");
	const batteryDischarge = entityNum(socDev, "bat_discharge_power");
	const soc =
		entityNum(socDev, "total_state_of_charge") ||
		entityNum(socDev, "state_of_charge") ||
		entityNum(bank, "state_of_charge");

	const deviceRows: DashboardDeviceRow[] = devices
		.filter(d => !["system", "site"].includes(d.info.type))
		.map(d => ({
			type: d.info.type,
			typeLabel: TYPE_LABELS[d.info.type] || d.info.type,
			name: d.info.name || d.info.id,
			model: d.info.model || d.info.device_pn || "–",
			online: cloudOnline(d.entities),
			key: d.info.id,
		}));

	const energySolar = stats ? optionalNum(stats.entities, "daily_solar_production") : null;
	const energyHome = stats ? optionalNum(stats.entities, "daily_home_usage") : null;
	const energyImport = stats ? optionalNum(stats.entities, "daily_grid_import") : null;
	const energyExport = stats
		? (optionalNum(stats.entities, "daily_grid_export") ?? optionalNum(stats.entities, "daily_solar_to_grid"))
		: null;
	const energyCharge = stats
		? (optionalNum(stats.entities, "daily_charge_energy") ?? optionalNum(stats.entities, "daily_solar_to_battery"))
		: null;
	const energyDischarge = stats ? optionalNum(stats.entities, "daily_discharge_energy") : null;

	const mqttDev = devices.find(d => d.entities.mqtt_connection !== undefined) || bank || pickCombiner(devices);
	const mqttVal = mqttDev ? optionalBool(mqttDev.entities, "mqtt_connection") : null;

	return {
		siteId,
		siteKey: siteKey(siteId),
		siteName:
			system?.info.name ||
			(system?.entities.site_name !== undefined ? String(system.entities.site_name) : "") ||
			siteId ||
			"Anker SOLIX",
		solar: solarPower,
		home: homePower,
		gridImport,
		gridExport,
		batteryCharge,
		batteryDischarge,
		soc,
		batteryTemp: socDev ? optionalNum(socDev.entities, "device_temperature") : null,
		mqttConnected: mqttVal,
		solarbankName: bank?.info.name || "Solarbank",
		solarbankModel: bank?.info.model || bank?.info.device_pn || "–",
		solarbankOnline: bank ? cloudOnline(bank.entities) : null,
		smartmeterOnline: meter ? cloudOnline(meter.entities) : null,
		devices: deviceRows,
		settings: {
			appOutputPower: settingsDev ? optionalNum(settingsDev.entities, "ac_output_limit") : null,
			homeLoadPreset: settingsDev ? optionalNum(settingsDev.entities, "set_output_power") : null,
			chargeUpperLimit: settingsDev
				? (optionalNum(settingsDev.entities, "charge_upper_limit") ??
					optionalNum(settingsDev.entities, "max_soc"))
				: null,
			dischargeLowerLimit: settingsDev
				? (optionalNum(settingsDev.entities, "discharge_lower_limit") ??
					optionalNum(settingsDev.entities, "min_soc"))
				: null,
			allowGridExport: settingsDev ? optionalBool(settingsDev.entities, "allow_grid_export") : null,
			acInputLimit: settingsDev ? optionalNum(settingsDev.entities, "ac_input_power") : null,
			operatingMode: settingsDev?.entities.preset_usage_mode?.toString() || "–",
		},
		energy: {
			solar: energySolar,
			home: energyHome,
			gridImport: energyImport,
			gridExport: energyExport,
			batteryCharge: energyCharge,
			batteryDischarge: energyDischarge,
			autarky: calcAutarky(energyHome, energyImport),
			selfConsumption: calcSelfConsumption(energySolar, energyExport),
		},
		updatedAt: new Date().toISOString(),
	};
}

async function ensureHtmlState(adapter: ioBroker.Adapter, id: string, name: string): Promise<void> {
	await adapter.setObjectNotExistsAsync(id, {
		type: "state",
		common: {
			name,
			type: "string",
			role: "html",
			read: true,
			write: false,
		},
		native: {},
	});
}

async function setHtml(adapter: ioBroker.Adapter, id: string, html: string): Promise<void> {
	await adapter.setState(id, html, true);
}

export async function syncHtmlDashboards(adapter: ioBroker.Adapter, devices: BridgeDevice[]): Promise<void> {
	if (!devices.length) {
		return;
	}

	const bySite = new Map<string, BridgeDevice[]>();
	for (const dev of devices) {
		const sid = dev.info.site_id || dev.info.id;
		if (!sid) {
			continue;
		}
		const list = bySite.get(sid) || [];
		list.push(dev);
		bySite.set(sid, list);
	}

	const snapshots: DashboardSiteSnapshot[] = [];
	for (const [siteId, siteDevices] of bySite) {
		const snap = buildSiteSnapshot(siteId, siteDevices);
		snapshots.push(snap);
		const base = `${adapter.namespace}.dashboard.sites.${snap.siteKey}`;
		await adapter.setObjectNotExistsAsync(`${adapter.namespace}.dashboard`, {
			type: "channel",
			common: { name: "HTML dashboards (solix4-style)" },
			native: {},
		});
		await adapter.setObjectNotExistsAsync(`${adapter.namespace}.dashboard.sites`, {
			type: "channel",
			common: { name: "Sites" },
			native: {},
		});
		await adapter.setObjectNotExistsAsync(base, {
			type: "device",
			common: { name: snap.siteName },
			native: { siteId },
		});

		const pages: Array<[string, string, string]> = [
			["live", "Live energy flow", buildLiveWidgetHtml(snap)],
			["energy", "Daily energy (kWh)", buildEnergyWidgetHtml(snap)],
			["settings", "Settings & limits", buildSettingsWidgetHtml(snap)],
			["dashboard", "Combined dashboard", buildDashboardWidgetHtml(snap)],
			["diagnosis", "Diagnosis", buildDiagnosisWidgetHtml(snap)],
			["devices", "Device inventory", buildDeviceInventoryHtml(snap)],
		];

		for (const [suffix, label, html] of pages) {
			const stateId = `${base}.${suffix}.html`;
			await ensureHtmlState(adapter, stateId, `${snap.siteName} — ${label}`);
			await setHtml(adapter, stateId, html);
		}
	}

	if (snapshots.length) {
		const overviewId = `${adapter.namespace}.dashboard.overview.html`;
		await ensureHtmlState(adapter, overviewId, "Multi-site overview");
		await setHtml(adapter, overviewId, buildOverviewHtml(snapshots));
	}
}
