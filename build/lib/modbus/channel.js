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
var channel_exports = {};
__export(channel_exports, {
  ModbusChannel: () => ModbusChannel
});
module.exports = __toCommonJS(channel_exports);
var import_config = require("./config");
var import_encode = require("./encode");
var import_poll = require("./poll");
var import_profiles = require("./profiles");
var import_states = require("./states");
var import_tcpClient = require("./tcpClient");
var import_types = require("./types");
class ModbusChannel {
  constructor(adapter, hooks = {}) {
    this.adapter = adapter;
    this.hooks = hooks;
  }
  devices = [];
  timer;
  stopped = false;
  async start() {
    if (this.adapter.config.enableModbus !== true) {
      return;
    }
    const configs = (0, import_config.parseModbusDevices)(this.adapter.config.modbusDevices).filter((d) => d.enabled);
    if (!configs.length) {
      this.adapter.log.info("Local Modbus channel enabled but no devices configured");
      this.notifyAlive();
      return;
    }
    const intervalSec = (0, import_config.parseModbusScanInterval)(this.adapter.config.modbusScanInterval);
    for (const config of configs) {
      const id = (0, import_config.modbusDeviceId)(config);
      const client = new import_tcpClient.ModbusTcpClient(config.host, config.port, config.unitId, void 0, this.adapter);
      const profile = config.profile === "auto" ? void 0 : (0, import_profiles.getModbusProfile)(config.profile);
      this.devices.push({
        id,
        config,
        client,
        profile,
        connected: false,
        pollInFlight: false,
        snapshot: {},
        writeGuardUntil: /* @__PURE__ */ new Map()
      });
      await (0, import_states.ensureModbusObjects)(this.adapter, id, config.name || `${config.host}:${config.port}`);
      await this.adapter.setState(`modbus.${id}.info.connected`, false, true);
    }
    this.adapter.log.info(
      `Local Modbus channel started (${this.devices.length} device(s), poll every ${intervalSec}s)`
    );
    await this.pollAll();
    this.timer = this.adapter.setInterval(() => {
      void this.pollAll();
    }, intervalSec * 1e3);
  }
  stop() {
    this.stopped = true;
    if (this.timer) {
      this.adapter.clearInterval(this.timer);
      this.timer = void 0;
    }
    for (const device of this.devices) {
      device.client.close();
    }
    this.devices.length = 0;
  }
  async handleControl(stateId, state) {
    var _a, _b;
    const parsed = (0, import_config.parseModbusControlStateId)(this.adapter.namespace, stateId);
    if (!parsed) {
      this.adapter.log.warn(`Ignored Modbus state change (not a control): ${stateId}`);
      return;
    }
    const device = this.devices.find((d) => d.id === parsed.deviceId);
    if (!(device == null ? void 0 : device.profile)) {
      this.adapter.log.warn(`Modbus control ${parsed.control}: device ${parsed.deviceId} not ready`);
      return;
    }
    const spec = (_a = device.profile.controls) == null ? void 0 : _a.find((c) => c.id === parsed.control);
    if (!spec) {
      this.adapter.log.warn(`Unknown Modbus control ${parsed.control} on ${parsed.deviceId}`);
      return;
    }
    const value = state.val;
    if (value === null || value === void 0) {
      return;
    }
    try {
      await this.refreshSnapshotFromStates(device);
      const resolved = (0, import_encode.resolveControlWrite)(spec, value, device.snapshot);
      if ("error" in resolved) {
        this.adapter.log.warn(`Modbus ${parsed.deviceId}.${spec.id}: ${resolved.error}`);
        return;
      }
      if (spec.localOnly) {
        this.applyLocalSnapshot(device, spec.id, value);
        await this.adapter.setState(`modbus.${device.id}.control.${spec.id}`, { val: value, ack: true });
        return;
      }
      const writeValue = spec.writeGain && spec.writeGain !== 1 ? Math.round(resolved.value * spec.writeGain) : resolved.value;
      const registers = (0, import_encode.encodeRegisterValues)(spec.dataType, writeValue, (_b = spec.wordOrder) != null ? _b : "big");
      device.writeGuardUntil.set(spec.id, Date.now() + import_types.MODBUS_WRITE_GUARD_MS);
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
  async writeWithRetry(device, address, values) {
    try {
      await device.client.writeRegisters(address, values);
    } catch (err) {
      device.client.close();
      this.adapter.log.warn(
        `Modbus write retry ${device.config.host}:${device.config.port}: ${err instanceof Error ? err.message : String(err)}`
      );
      await device.client.writeRegisters(address, values);
    }
  }
  applyLocalSnapshot(device, id, raw) {
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
  async refreshSnapshotFromStates(device) {
    const ids = [
      "operating_mode",
      "battery_power_direction",
      "charging_limit_soc",
      "discharge_limit_soc",
      "backup_reserve_soc",
      "backup_soc_enable"
    ];
    for (const id of ids) {
      const st = await this.adapter.getStateAsync(`modbus.${device.id}.control.${id}`);
      if ((st == null ? void 0 : st.val) === null || (st == null ? void 0 : st.val) === void 0) {
        continue;
      }
      this.applyLocalSnapshot(device, id, st.val);
    }
  }
  notifyAlive() {
    if (this.stopped || !this.hooks.onAliveChange) {
      return;
    }
    this.hooks.onAliveChange(this.devices.some((d) => d.connected));
  }
  async pollAll() {
    if (this.stopped) {
      return;
    }
    await Promise.all(this.devices.map((device) => this.pollDevice(device)));
    this.notifyAlive();
  }
  async pollDevice(device) {
    var _a;
    if (device.pollInFlight || this.stopped) {
      return;
    }
    device.pollInFlight = true;
    try {
      const profile = (_a = device.profile) != null ? _a : await this.detectProfile(device);
      if (!profile) {
        throw new Error("Could not auto-detect Modbus profile");
      }
      device.profile = profile;
      const points = await (0, import_poll.pollProfile)(device.client, profile);
      if (this.stopped) {
        return;
      }
      await (0, import_states.writeModbusPoints)(this.adapter, device.id, points);
      (0, import_states.applyControlSnapshot)(device.snapshot, points);
      const modeStates = (0, import_states.operatingModeStatesFromPoints)(points, profile);
      await (0, import_states.ensureModbusControlObjects)(this.adapter, device.id, profile, modeStates);
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
  async publishControlStates(device, profile, points) {
    var _a, _b;
    const now = Date.now();
    for (const spec of (_a = profile.controls) != null ? _a : []) {
      if (spec.localOnly || spec.neverRead) {
        continue;
      }
      if (((_b = device.writeGuardUntil.get(spec.id)) != null ? _b : 0) > now) {
        continue;
      }
      const value = (0, import_states.controlValueFromPoints)(spec, points);
      if (value === void 0) {
        continue;
      }
      await this.adapter.setState(`modbus.${device.id}.control.${spec.id}`, { val: value, ack: true });
      this.applyLocalSnapshot(device, spec.id, value);
    }
  }
  async detectProfile(device) {
    const probed = await (0, import_poll.probeProductCode)(device.client);
    const fromCode = (0, import_profiles.matchProfileByProductCode)(probed);
    if (fromCode) {
      this.adapter.log.info(`Modbus ${device.config.host}: auto-detected profile ${fromCode.id}`);
      return fromCode;
    }
    for (const id of import_profiles.MODBUS_PROFILE_ORDER) {
      try {
        const candidate = (0, import_profiles.getModbusProfile)(id);
        const points = await (0, import_poll.pollProfile)(device.client, candidate);
        const matched = (0, import_poll.detectProfileFromPoints)(points);
        if (matched) {
          this.adapter.log.info(`Modbus ${device.config.host}: auto-detected profile ${matched.id}`);
          return matched;
        }
        const sn = points.find((p) => p.id === candidate.snKey);
        if (typeof (sn == null ? void 0 : sn.value) === "string" && sn.value.length > 3) {
          this.adapter.log.info(
            `Modbus ${device.config.host}: using profile ${candidate.id} (SN ${sn.value})`
          );
          return candidate;
        }
      } catch {
        device.client.close();
      }
    }
    return void 0;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ModbusChannel
});
//# sourceMappingURL=channel.js.map
