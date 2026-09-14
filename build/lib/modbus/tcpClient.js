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
var tcpClient_exports = {};
__export(tcpClient_exports, {
  ModbusTcpClient: () => ModbusTcpClient
});
module.exports = __toCommonJS(tcpClient_exports);
var import_node_net = require("node:net");
var import_protocol = require("./protocol");
const DEFAULT_TIMEOUT_MS = 5e3;
const MAX_REGISTERS = 125;
class ModbusTcpClient {
  constructor(host, port, unitId, timeoutMs = DEFAULT_TIMEOUT_MS, timers) {
    this.host = host;
    this.port = port;
    this.unitId = unitId;
    this.timeoutMs = timeoutMs;
    this.timers = timers;
  }
  socket = null;
  buffer = Buffer.alloc(0);
  transactionId = 1;
  queue = [];
  busy = false;
  waiter = null;
  async connect() {
    if (this.socket && !this.socket.destroyed) {
      return;
    }
    await new Promise((resolve, reject) => {
      const socket = new import_node_net.Socket();
      const onError = (err) => {
        socket.destroy();
        reject(err);
      };
      socket.setTimeout(this.timeoutMs);
      socket.once("error", onError);
      socket.once("timeout", () => onError(new Error("Modbus TCP connect timeout")));
      socket.connect(this.port, this.host, () => {
        socket.setTimeout(0);
        socket.off("error", onError);
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        socket.on("data", (chunk) => this.onData(chunk));
        socket.on("close", () => {
          var _a;
          this.socket = null;
          (_a = this.waiter) == null ? void 0 : _a.call(this, void 0, new Error("Modbus connection closed"));
          this.waiter = null;
        });
        socket.on("error", (err) => {
          var _a;
          this.socket = null;
          (_a = this.waiter) == null ? void 0 : _a.call(this, void 0, err);
          this.waiter = null;
        });
        resolve();
      });
    });
  }
  close() {
    var _a, _b;
    (_a = this.waiter) == null ? void 0 : _a.call(this, void 0, new Error("Modbus client closed"));
    this.waiter = null;
    (_b = this.socket) == null ? void 0 : _b.destroy();
    this.socket = null;
    this.buffer = Buffer.alloc(0);
  }
  get connected() {
    return Boolean(this.socket && !this.socket.destroyed);
  }
  async readRegisters(type, address, count) {
    if (count < 1 || count > MAX_REGISTERS) {
      throw new Error(`Invalid register count ${count}`);
    }
    return this.enqueue(async () => {
      await this.connect();
      const socket = this.socket;
      if (!socket) {
        throw new Error("Modbus socket not connected");
      }
      const tid = this.transactionId++ & 65535;
      if (this.transactionId > 65535) {
        this.transactionId = 1;
      }
      const fc = type === "holding" ? import_protocol.FC_READ_HOLDING : import_protocol.FC_READ_INPUT;
      const request = (0, import_protocol.buildReadRequest)(tid, this.unitId, fc, address, count);
      this.buffer = Buffer.alloc(0);
      const framePromise = this.waitForFrame();
      socket.write(request);
      const response = await framePromise;
      return (0, import_protocol.parseReadResponse)(response, tid, this.unitId);
    });
  }
  async writeRegisters(address, values) {
    if (!values.length || values.length > MAX_REGISTERS) {
      throw new Error(`Invalid write count ${values.length}`);
    }
    return this.enqueue(async () => {
      await this.connect();
      const socket = this.socket;
      if (!socket) {
        throw new Error("Modbus socket not connected");
      }
      const tid = this.transactionId++ & 65535;
      if (this.transactionId > 65535) {
        this.transactionId = 1;
      }
      const request = (0, import_protocol.buildWriteRequest)(tid, this.unitId, address, values);
      this.buffer = Buffer.alloc(0);
      const framePromise = this.waitForFrame();
      socket.write(request);
      const response = await framePromise;
      const expectedFc = values.length === 1 ? import_protocol.FC_WRITE_SINGLE : import_protocol.FC_WRITE_MULTIPLE;
      (0, import_protocol.parseWriteResponse)(response, tid, this.unitId, expectedFc);
    });
  }
  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.flushFrame();
  }
  flushFrame() {
    if (!this.waiter || this.buffer.length < 6) {
      return;
    }
    const length = this.buffer.readUInt16BE(4);
    const total = 6 + length;
    if (this.buffer.length < total) {
      return;
    }
    const frame = this.buffer.subarray(0, total);
    this.buffer = this.buffer.subarray(total);
    const waiter = this.waiter;
    this.waiter = null;
    waiter(frame);
  }
  waitForFrame() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const onTimeout = () => {
        this.waiter = null;
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error("Modbus TCP read timeout"));
      };
      if (!this.timers) {
        reject(new Error("ModbusTcpClient requires adapter timers for read timeouts"));
        return;
      }
      const timer = this.timers.setTimeout(onTimeout, this.timeoutMs);
      this.waiter = (frame, err) => {
        var _a;
        if (settled) {
          return;
        }
        settled = true;
        (_a = this.timers) == null ? void 0 : _a.clearTimeout(timer);
        if (err || !frame) {
          reject(err != null ? err : new Error("Modbus empty response"));
        } else {
          resolve(frame);
        }
      };
      this.flushFrame();
    });
  }
  enqueue(job) {
    return new Promise((resolve, reject) => {
      const run = () => {
        this.busy = true;
        job().then(resolve, reject).finally(() => {
          this.busy = false;
          const next = this.queue.shift();
          if (next) {
            next();
          }
        });
      };
      if (this.busy) {
        this.queue.push(run);
      } else {
        run();
      }
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ModbusTcpClient
});
//# sourceMappingURL=tcpClient.js.map
