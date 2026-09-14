import { modbusDeviceId, parseModbusControlStateId, parseModbusDevices, parseModbusScanInterval } from "./config";
import { encodeRegisterValues, resolveControlWrite, type ModbusControlSnapshot } from "./encode";
import { detectProfileFromPoints, pollProfile, probeProductCode } from "./poll";
import { getModbusProfile, matchProfileByProductCode, MODBUS_PROFILE_ORDER } from "./profiles";
import {
	applyControlSnapshot,
	controlValueFromPoints,
	ensureModbusControlObjects,
	ensureModbusObjects,
	operatingModeStatesFromPoints,
	writeModbusPoints,
} from "./states";
import { ModbusTcpClient } from "./tcpClient";
import {
	MODBUS_WRITE_GUARD_MS,
	type ModbusDecodedPoint,
	type ModbusDeviceConfig,
	type ModbusDeviceProfile,
} from "./types";

interface DeviceRuntime {
	id: string;
	config: ModbusDeviceConfig;
	client: ModbusTcpClient;
	profile: ModbusDeviceProfile | undefined;
	connected: boolean;
	pollInFlight: boolean;
	snapshot: ModbusControlSnapshot;
	writeGuardUntil: Map<string, number>;
}

export interface ModbusChannelHooks {
	onAliveChange?: (alive: boolean) => void;
}

export class ModbusChannel {
	private readonly devices: DeviceRuntime[] = [];
	private timer: ioBroker.Interval | undefined;
	private stopped = false;

	constructor(
		private readonly adapter: ioBroker.Adapter,
		private readonly hooks: ModbusChannelHooks = {},
	) {}

	async start(): Promise<void> {
		if (this.adapter.config.enableModbus !== true) {
			return;
		}
		const configs = parseModbusDevices(this.adapter.config.modbusDevices).filter(d => d.enabled);
		if (!configs.length) {
			this.adapter.log.info("Local Modbus channel enabled but no devices configured");
			this.notifyAlive();
			return;
		}
		const intervalSec = parseModbusScanInterval(this.adapter.config.modbusScanInterval);
		for (const config of configs) {
			const id = modbusDeviceId(config);
			const client = new ModbusTcpClient(config.host, config.port, config.unitId, undefined, this.adapter);
			const profile = config.profile === "auto" ? undefined : getModbusProfile(config.profile);
			this.devices.push({
				id,
				config,
				client,
				profile,
				connected: false,
				pollInFlight: false,
				snapshot: {},
				writeGuardUntil: new Map(),
			});
			await ensureModbusObjects(this.adapter, id, config.name || `${config.host}:${config.port}`);
			await this.adapter.setState(`modbus.${id}.info.connected`, false, true);
		}
		this.adapter.log.info(
			`Local Modbus channel started (${this.devices.length} device(s), poll every ${intervalSec}s)`,
		);
		await this.pollAll();
		this.timer = this.adapter.setInterval(() => {
			void this.pollAll();
		}, intervalSec * 1000);
	}

	stop(): void {
		this.stopped = true;
		if (this.timer) {
			this.adapter.clearInterval(this.timer);
			this.timer = undefined;
		}
		for (const device of this.devices) {
			device.client.close();
		}
		this.devices.length = 0;
	}

	async handleControl(stateId: string, state: ioBroker.State): Promise<void> {
		const parsed = parseModbusControlStateId(this.adapter.namespace, stateId);
		if (!parsed) {
			this.adapter.log.warn(`Ignored Modbus state change (not a control): ${stateId}`);
			return;
		}
		const device = this.devices.find(d => d.id === parsed.deviceId);
		if (!device?.profile) {
			this.adapter.log.warn(`Modbus control ${parsed.control}: device ${parsed.deviceId} not ready`);
			return;
		}
		const spec = device.profile.controls?.find(c => c.id === parsed.control);
		if (!spec) {
			this.adapter.log.warn(`Unknown Modbus control ${parsed.control} on ${parsed.deviceId}`);
			return;
		}
		const value = state.val;
		if (value === null || value === undefined) {
			return;
		}
		try {
			await this.refreshSnapshotFromStates(device);
			const resolved = resolveControlWrite(spec, value, device.snapshot);
			if ("error" in resolved) {
				this.adapter.log.warn(`Modbus ${parsed.deviceId}.${spec.id}: ${resolved.error}`);
				return;
			}
			if (spec.localOnly) {
				this.applyLocalSnapshot(device, spec.id, value);
				await this.adapter.setState(`modbus.${device.id}.control.${spec.id}`, { val: value, ack: true });
				return;
			}
			const writeValue =
				spec.writeGain && spec.writeGain !== 1 ? Math.round(resolved.value * spec.writeGain) : resolved.value;
			const registers = encodeRegisterValues(spec.dataType, writeValue, spec.wordOrder ?? "big");
			device.writeGuardUntil.set(spec.id, Date.now() + MODBUS_WRITE_GUARD_MS);
			try {
				await this.writeWithRetry(device, spec.address, registers);
			} catch (err) {
				device.writeGuardUntil.delete(spec.id);
				throw err;
			}
			this.applyLocalSnapshot(device, spec.id, value);
			await this.adapter.setState(`modbus.${device.id}.control.${spec.id}`, { val: value, ack: true });
			this.adapter.log.info(`Modbus wrote ${spec.id}=${String(value)} on ${device.config.host}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.adapter.log.error(`Modbus control ${parsed.deviceId}.${spec.id} failed: ${message}`);
			if (!this.stopped) {
				await this.adapter.setState(`modbus.${device.id}.info.lastError`, message, true);
			}
		}
	}

	private async writeWithRetry(device: DeviceRuntime, address: number, values: number[]): Promise<void> {
		try {
			await device.client.writeRegisters(address, values);
		} catch (err) {
			device.client.close();
			this.adapter.log.warn(
				`Modbus write retry ${device.config.host}:${device.config.port}: ${err instanceof Error ? err.message : String(err)}`,
			);
			await device.client.writeRegisters(address, values);
		}
	}

	private applyLocalSnapshot(device: DeviceRuntime, id: string, raw: string | number | boolean): void {
		switch (id) {
			case "operating_mode":
				device.snapshot.operating_mode = String(raw);
				break;
			case "battery_power_direction":
				device.snapshot.battery_power_direction = String(raw);
				break;
			case "charging_limit_soc":
				device.snapshot.charging_limit_soc = Number(raw);
				break;
			case "discharge_limit_soc":
				device.snapshot.discharge_limit_soc = Number(raw);
				break;
			case "backup_reserve_soc":
				device.snapshot.backup_reserve_soc = Number(raw);
				break;
			case "backup_soc_enable":
				device.snapshot.backup_soc_enable = raw;
				break;
			default:
				break;
		}
	}

	private async refreshSnapshotFromStates(device: DeviceRuntime): Promise<void> {
		const ids = [
			"operating_mode",
			"battery_power_direction",
			"charging_limit_soc",
			"discharge_limit_soc",
			"backup_reserve_soc",
			"backup_soc_enable",
		] as const;
		for (const id of ids) {
			const st = await this.adapter.getStateAsync(`modbus.${device.id}.control.${id}`);
			if (st?.val === null || st?.val === undefined) {
				continue;
			}
			this.applyLocalSnapshot(device, id, st.val);
		}
	}

	private notifyAlive(): void {
		if (this.stopped || !this.hooks.onAliveChange) {
			return;
		}
		this.hooks.onAliveChange(this.devices.some(d => d.connected));
	}

	private async pollAll(): Promise<void> {
		if (this.stopped) {
			return;
		}
		await Promise.all(this.devices.map(device => this.pollDevice(device)));
		this.notifyAlive();
	}

	private async pollDevice(device: DeviceRuntime): Promise<void> {
		if (device.pollInFlight || this.stopped) {
			return;
		}
		device.pollInFlight = true;
		try {
			const profile = device.profile ?? (await this.detectProfile(device));
			if (!profile) {
				throw new Error("Could not auto-detect Modbus profile");
			}
			device.profile = profile;
			const points = await pollProfile(device.client, profile);
			if (this.stopped) {
				return;
			}
			await writeModbusPoints(this.adapter, device.id, points);
			applyControlSnapshot(device.snapshot, points);
			const modeStates = operatingModeStatesFromPoints(points, profile);
			await ensureModbusControlObjects(this.adapter, device.id, profile, modeStates);
			await this.publishControlStates(device, profile, points);
			device.connected = true;
			await this.adapter.setState(`modbus.${device.id}.info.connected`, true, true);
			await this.adapter.setState(`modbus.${device.id}.info.profile`, profile.id, true);
			await this.adapter.setState(`modbus.${device.id}.info.lastError`, "", true);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.adapter.log.warn(`Modbus ${device.config.host}:${device.config.port}: ${message}`);
			device.client.close();
			device.connected = false;
			if (!this.stopped) {
				await this.adapter.setState(`modbus.${device.id}.info.connected`, false, true);
				await this.adapter.setState(`modbus.${device.id}.info.lastError`, message, true);
			}
		} finally {
			device.pollInFlight = false;
		}
	}

	private async publishControlStates(
		device: DeviceRuntime,
		profile: ModbusDeviceProfile,
		points: ModbusDecodedPoint[],
	): Promise<void> {
		const now = Date.now();
		for (const spec of profile.controls ?? []) {
			if (spec.localOnly || spec.neverRead) {
				continue;
			}
			if ((device.writeGuardUntil.get(spec.id) ?? 0) > now) {
				continue;
			}
			const value = controlValueFromPoints(spec, points);
			if (value === undefined) {
				continue;
			}
			await this.adapter.setState(`modbus.${device.id}.control.${spec.id}`, { val: value, ack: true });
			this.applyLocalSnapshot(device, spec.id, value);
		}
	}

	private async detectProfile(device: DeviceRuntime): Promise<ModbusDeviceProfile | undefined> {
		const probed = await probeProductCode(device.client);
		const fromCode = matchProfileByProductCode(probed);
		if (fromCode) {
			this.adapter.log.info(`Modbus ${device.config.host}: auto-detected profile ${fromCode.id}`);
			return fromCode;
		}
		for (const id of MODBUS_PROFILE_ORDER) {
			try {
				const candidate = getModbusProfile(id);
				const points = await pollProfile(device.client, candidate);
				const matched = detectProfileFromPoints(points);
				if (matched) {
					this.adapter.log.info(`Modbus ${device.config.host}: auto-detected profile ${matched.id}`);
					return matched;
				}
				const sn = points.find(p => p.id === candidate.snKey);
				if (typeof sn?.value === "string" && sn.value.length > 3) {
					this.adapter.log.info(
						`Modbus ${device.config.host}: using profile ${candidate.id} (SN ${sn.value})`,
					);
					return candidate;
				}
			} catch {
				device.client.close();
			}
		}
		return undefined;
	}
}
