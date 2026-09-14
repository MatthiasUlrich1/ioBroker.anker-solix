import { Socket } from "node:net";

import {
	buildReadRequest,
	buildWriteRequest,
	FC_READ_HOLDING,
	FC_READ_INPUT,
	FC_WRITE_MULTIPLE,
	FC_WRITE_SINGLE,
	parseReadResponse,
	parseWriteResponse,
} from "./protocol";
import type { ModbusRegisterType } from "./types";

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_REGISTERS = 125;

type TimerHost = Pick<ioBroker.Adapter, "setTimeout" | "clearTimeout">;

export class ModbusTcpClient {
	private socket: Socket | null = null;
	private buffer = Buffer.alloc(0);
	private transactionId = 1;
	private readonly queue: Array<() => void> = [];
	private busy = false;
	private waiter: ((frame?: Buffer, err?: Error) => void) | null = null;

	constructor(
		private readonly host: string,
		private readonly port: number,
		private readonly unitId: number,
		private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
		private readonly timers?: TimerHost,
	) {}

	async connect(): Promise<void> {
		if (this.socket && !this.socket.destroyed) {
			return;
		}
		await new Promise<void>((resolve, reject) => {
			const socket = new Socket();
			const onError = (err: Error): void => {
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
				socket.on("data", chunk => this.onData(chunk));
				socket.on("close", () => {
					this.socket = null;
					this.waiter?.(undefined, new Error("Modbus connection closed"));
					this.waiter = null;
				});
				socket.on("error", err => {
					this.socket = null;
					this.waiter?.(undefined, err);
					this.waiter = null;
				});
				resolve();
			});
		});
	}

	close(): void {
		this.waiter?.(undefined, new Error("Modbus client closed"));
		this.waiter = null;
		this.socket?.destroy();
		this.socket = null;
		this.buffer = Buffer.alloc(0);
	}

	get connected(): boolean {
		return Boolean(this.socket && !this.socket.destroyed);
	}

	async readRegisters(type: ModbusRegisterType, address: number, count: number): Promise<number[]> {
		if (count < 1 || count > MAX_REGISTERS) {
			throw new Error(`Invalid register count ${count}`);
		}
		return this.enqueue(async () => {
			await this.connect();
			const socket = this.socket;
			if (!socket) {
				throw new Error("Modbus socket not connected");
			}
			const tid = this.transactionId++ & 0xffff;
			if (this.transactionId > 0xffff) {
				this.transactionId = 1;
			}
			const fc = type === "holding" ? FC_READ_HOLDING : FC_READ_INPUT;
			const request = buildReadRequest(tid, this.unitId, fc, address, count);
			this.buffer = Buffer.alloc(0);
			const framePromise = this.waitForFrame();
			socket.write(request);
			const response = await framePromise;
			return parseReadResponse(response, tid, this.unitId);
		});
	}

	async writeRegisters(address: number, values: number[]): Promise<void> {
		if (!values.length || values.length > MAX_REGISTERS) {
			throw new Error(`Invalid write count ${values.length}`);
		}
		return this.enqueue(async () => {
			await this.connect();
			const socket = this.socket;
			if (!socket) {
				throw new Error("Modbus socket not connected");
			}
			const tid = this.transactionId++ & 0xffff;
			if (this.transactionId > 0xffff) {
				this.transactionId = 1;
			}
			const request = buildWriteRequest(tid, this.unitId, address, values);
			this.buffer = Buffer.alloc(0);
			const framePromise = this.waitForFrame();
			socket.write(request);
			const response = await framePromise;
			const expectedFc = values.length === 1 ? FC_WRITE_SINGLE : FC_WRITE_MULTIPLE;
			parseWriteResponse(response, tid, this.unitId, expectedFc);
		});
	}

	private onData(chunk: Buffer): void {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		this.flushFrame();
	}

	private flushFrame(): void {
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

	private waitForFrame(): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			let settled = false;
			const onTimeout = (): void => {
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
				if (settled) {
					return;
				}
				settled = true;
				this.timers?.clearTimeout(timer);
				if (err || !frame) {
					reject(err ?? new Error("Modbus empty response"));
				} else {
					resolve(frame);
				}
			};
			this.flushFrame();
		});
	}

	private enqueue<T>(job: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			const run = (): void => {
				this.busy = true;
				job()
					.then(resolve, reject)
					.finally(() => {
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
