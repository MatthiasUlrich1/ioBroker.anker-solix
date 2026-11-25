"""Long-lived HA-style API runtime (persistent session + MQTT)."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Any

from aiohttp import ClientSession

from ha_api_client import IoBrokerAnkerApiClient

_LOGGER = logging.getLogger("anker-solix-bridge")

# Trailing debounce window per device SN for MQTT push-driven stdout events
# (Feature #26: push updates to ioBroker states faster than scanInterval).
_MQTT_DEBOUNCE_SEC = 1.5


class BridgeRuntime:
    """Keeps aiohttp session, API client and MQTT alive across polls (like HA coordinator)."""

    def __init__(self) -> None:
        self.client: IoBrokerAnkerApiClient | None = None
        self.session: ClientSession | None = None
        self._credentials: tuple[str, str, str] | None = None
        self._loop = asyncio.get_running_loop()
        self._last_config: dict = {}
        # Per-SN bookkeeping for the trailing MQTT push debounce.
        self._mqtt_last_emit: dict[str, float] = {}
        self._mqtt_pending: dict[str, asyncio.Task] = {}

    async def close(self) -> None:
        self._cancel_mqtt_pending()
        if self.client:
            self.client.api.stopMqttSession()
            self.client.mqtt_devices.clear()
        self.client = None
        if self.session and not self.session.closed:
            await self.session.close()
        self.session = None
        self._credentials = None

    def _cancel_mqtt_pending(self) -> None:
        for task in self._mqtt_pending.values():
            task.cancel()
        self._mqtt_pending.clear()
        self._mqtt_last_emit.clear()

    def _credential_key(self, config: dict) -> tuple[str, str, str]:
        return (
            str(config.get("username") or "").strip(),
            str(config.get("password") or ""),
            str(config.get("country") or "DE").upper(),
        )

    def _wire_mqtt_callback(self, client: IoBrokerAnkerApiClient) -> None:
        """Register the push callback so MQTT device updates can emit stdout events
        faster than scanInterval (Feature #26). Safe to call repeatedly; it is a
        no-op re-registration when already wired, and re-wires after the api
        clears it internally (e.g. stopMqttSession)."""
        with contextlib.suppress(Exception):
            client.api.mqtt_update_callback(self._on_mqtt_update)

    def _on_mqtt_update(self, sn: str) -> None:
        """Paho MQTT network-loop thread callback — hop back onto the asyncio loop."""
        try:
            self._loop.call_soon_threadsafe(self._schedule_emit, sn)
        except RuntimeError:
            pass  # event loop already closed/shutting down

    def _schedule_emit(self, sn: str) -> None:
        """Trailing debounce: remember the latest trigger time, start at most one
        pending task per SN that waits until WINDOW has elapsed with no further
        triggers before emitting."""
        self._mqtt_last_emit[sn] = self._loop.time()
        existing = self._mqtt_pending.get(sn)
        if existing and not existing.done():
            return
        self._mqtt_pending[sn] = self._loop.create_task(self._debounced_emit(sn))

    async def _debounced_emit(self, sn: str) -> None:
        try:
            while True:
                last = self._mqtt_last_emit.get(sn, 0.0)
                remaining = _MQTT_DEBOUNCE_SEC - (self._loop.time() - last)
                if remaining <= 0:
                    break
                await asyncio.sleep(remaining)
            await self._emit_mqtt_event(sn)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            _LOGGER.debug("MQTT push event failed for %s: %s", sn, exc)
        finally:
            self._mqtt_pending.pop(sn, None)
            self._mqtt_last_emit.pop(sn, None)

    async def _emit_mqtt_event(self, sn: str) -> None:
        client = self.client
        if not client or not getattr(client, "_mqtt_usage", False):
            return
        # Lazy import avoids circular dependency (bridge imports BridgeRuntime).
        from bridge import build_mqtt_device_event  # noqa: PLC0415

        entry = build_mqtt_device_event(client, self._last_config, sn)
        if entry is None:
            return
        print(
            json.dumps(
                {"event": "mqtt_device_update", "device": entry},
                ensure_ascii=False,
            ),
            flush=True,
        )

    async def ensure_client(
        self, config: dict, *, authenticate: bool = True
    ) -> IoBrokerAnkerApiClient:
        self._last_config = config
        cred = self._credential_key(config)
        if self.client and self._credentials == cred:
            self.client.apply_runtime_config(config)
            if authenticate and not self.client.api.apisession._loggedIn:
                await self.client.authenticate()
            self._wire_mqtt_callback(self.client)
            return self.client
        await self.close()
        self.session = ClientSession()
        self.client = IoBrokerAnkerApiClient(config, self.session, _LOGGER)
        self._credentials = cred
        if authenticate:
            await self.client.authenticate()
            _LOGGER.info("Persistent API session authenticated for %s", cred[0])
        else:
            _LOGGER.debug("Persistent API session prepared for %s (auth deferred)", cred[0])
        self._wire_mqtt_callback(self.client)
        return self.client

    async def dispatch(self, request: dict[str, Any]) -> dict[str, Any]:
        action = str(request.get("action") or "")
        config = request.get("config") or {}

        if action == "shutdown":
            await self.close()
            return {"ok": True}

        if action == "configure":
            # Do not login here – avoids duplicate auth while another adapter polls (26161)
            await self.ensure_client(config, authenticate=False)
            return {"ok": True, "persistent": True}

        # Lazy import avoids circular dependency
        from bridge import (  # noqa: PLC0415
            run_list_devices_with_client,
            run_login_with_client,
            run_poll_with_client,
            run_service_with_client,
            run_set_with_client,
        )

        client = await self.ensure_client(config)

        if action == "poll":
            return await run_poll_with_client(client, config)
        if action == "set":
            return await run_set_with_client(client, config)
        if action == "login":
            return await run_login_with_client(client, config)
        if action == "list_devices":
            return await run_list_devices_with_client(client, config)
        if action == "service":
            return await run_service_with_client(client, config)

        raise ValueError(f"Unknown action: {action}")
