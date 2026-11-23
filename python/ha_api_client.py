"""HA-aligned API client (ported from homeassistant integration api_client.py)."""

from __future__ import annotations

import contextlib
import json
import logging
import time
from pathlib import Path
from typing import Any

from aiohttp import ClientSession

from solixapi.api import AnkerSolixApi
from solixapi.apitypes import ApiCategories, SolixDefaults, SolixDeviceType
from solixapi.mqtt_device import SolixMqttDevice
from solixapi.mqtt_factory import SolixMqttDeviceFactory
from solixapi.mqttcmdmap import SolixMqttCommands

# Same defaults as custom_components/anker_solix/api_client.py
MIN_DEVICE_REFRESH: int = 60
DEFAULT_DEVICE_MULTIPLIER: int = 10
DEFAULT_ENDPOINT_LIMIT: int = SolixDefaults.ENDPOINT_LIMIT_DEF
DEFAULT_DELAY_TIME: float = SolixDefaults.REQUEST_DELAY_DEF
DEFAULT_TIMEOUT: int = SolixDefaults.REQUEST_TIMEOUT_DEF

# Non-energy optional excludes (HA optional list subset; no ApiCategories.device_parm).
from auth_helpers import purge_invalid_auth_cache, safe_authenticate  # noqa: E402
from entity_groups import build_exclude_categories, needs_daily_energy_poll  # noqa: E402
from energy_period import (  # noqa: E402
    berlin_today_str,
    enabled_periods,
    period_schedule_label,
    periods_due_for_fetch,
    update_site_energy_periods,
)

# Re-export for bridge.py
DEFAULT_EXCLUDE_CATEGORIES: list[str] = []


class IoBrokerAnkerApiClient:
    """Mirrors HA AnkerSolixApiClient refresh logic for polling."""

    def __init__(
        self,
        config: dict,
        session: ClientSession,
        logger: logging.Logger,
    ) -> None:
        self.config = config
        email = str(config.get("username") or "").strip()
        password = str(config.get("password") or "")
        country = (config.get("country") or "DE").upper()
        self.api = AnkerSolixApi(email, password, country, session, logger)
        cache_dir = Path(config.get("cacheDir") or Path(__file__).parent / "authcache")
        cache_dir.mkdir(parents=True, exist_ok=True)
        self.api.apisession._authFile = str(cache_dir / f"{email}.json")
        self.api.apisession.nickname = str(config.get("nickname") or email)

        self.api.apisession.requestDelay(
            float(config.get("requestDelay", DEFAULT_DELAY_TIME))
        )
        self.api.apisession.requestTimeout(
            int(config.get("requestTimeout", DEFAULT_TIMEOUT))
        )
        self.api.apisession.endpointLimit(
            int(config.get("endpointLimit", DEFAULT_ENDPOINT_LIMIT))
        )
        purge_invalid_auth_cache(self.api, logger)

        self.exclude_categories = build_exclude_categories(config)
        self._deviceintervals = max(
            1, int(config.get("deviceDetailMultiplier", DEFAULT_DEVICE_MULTIPLIER))
        )
        self._intervalcount = 0
        self._period_last_fetch: dict[str, str] = {}
        self._period_backoff_until = 0.0
        self._last_period_energy_updated: list[str] = []
        self._mqtt_usage = bool(config.get("mqttUsage", True))
        self._startup = True
        self.deferred_data = False
        self.active_device_refresh = False
        self.mqtt_devices: dict[str, SolixMqttDevice] = {}
        self._mqtt_last_trigger: dict[str, float] = {}
        self._mqtt_trigger_warned: set[str] = set()
        self._state_path = cache_dir / "poll_client_state.json"
        self._logger = logger
        self._max_total_ac_applied: dict[str, int] = {}
        self._load_state()

    def _load_state(self) -> None:
        if not self._state_path.is_file():
            return
        try:
            data = json.loads(self._state_path.read_text(encoding="utf-8"))
            self._intervalcount = int(data.get("intervalcount", 0))
            raw_last = data.get("period_last_fetch")
            self._period_last_fetch = (
                dict(raw_last) if isinstance(raw_last, dict) else {}
            )
            self._period_backoff_until = float(data.get("period_backoff_until", 0))
            self._startup = bool(data.get("startup", True))
            self.deferred_data = bool(data.get("deferred_data", False))
            raw_applied = data.get("max_total_ac_applied")
            if isinstance(raw_applied, dict):
                self._max_total_ac_applied = {
                    str(sn): int(limit)
                    for sn, limit in raw_applied.items()
                    if str(sn) and str(limit).replace(".", "", 1).isdigit()
                }
        except (OSError, ValueError, TypeError) as exc:
            self._logger.warning("Could not load poll state: %s", exc)

    def _save_state(self) -> None:
        try:
            self._state_path.write_text(
                json.dumps(
                    {
                        "intervalcount": self._intervalcount,
                        "period_last_fetch": self._period_last_fetch,
                        "period_backoff_until": self._period_backoff_until,
                        "startup": self._startup,
                        "deferred_data": self.deferred_data,
                        "max_total_ac_applied": self._max_total_ac_applied,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
        except OSError as exc:
            self._logger.warning("Could not save poll state: %s", exc)

    def record_max_total_ac_applied(self, device_sns: list[str], limit: int) -> None:
        """Persist MQTT grid cap per device (survives poll/cloud refresh and daemon restart)."""
        value = int(limit)
        changed = False
        for sn in device_sns:
            sn = str(sn)
            if not sn:
                continue
            if self._max_total_ac_applied.get(sn) != value:
                self._max_total_ac_applied[sn] = value
                changed = True
        if changed:
            self._save_state()

    def reapply_max_total_ac_stamps(self) -> None:
        """Restore adapter-applied max total AC after cloud/MQTT overwrote device cache."""
        if not self._max_total_ac_applied:
            return
        from max_total_ac_cache import reapply_max_total_ac_stamps  # noqa: PLC0415

        reapply_max_total_ac_stamps(self.api, self._max_total_ac_applied)

    async def _refresh_power_limits(self) -> None:
        """Fetch site power limits (ac_input_limit per SB, all_ac_input_limit on combiner)."""
        from solixapi import errors  # noqa: PLC0415

        for site_id, site in list(self.api.sites.items()):
            if not site.get("site_admin"):
                continue
            if not (site.get("solarbank_list") or site.get("station_sn")):
                continue
            try:
                await self.api.get_power_limit(siteId=str(site_id))
            except errors.RequestError as exc:
                self._logger.debug(
                    "get_power_limit skipped for site %s: %s", site_id, exc
                )
        self.reapply_max_total_ac_stamps()

    async def authenticate(self) -> None:
        await safe_authenticate(self.api, self._logger)

    def _daily_energy_has_values(self) -> bool:
        for site in self.api.sites.values():
            block = (site.get("energy_details") or {}).get("today") or {}
            if not isinstance(block, dict):
                continue
            for key in (
                "solar_production",
                "home_usage",
                "battery_charge",
                "battery_discharge",
                "solarbank_charge",
                "solarbank_discharge",
            ):
                val = block.get(key)
                if val not in (None, "", "0", 0, 0.0):
                    return True
        return False

    async def _fetch_daily_energy(self) -> bool:
        """Run poll_device_energy when daily stats/detail groups are enabled."""
        if not needs_daily_energy_poll(self.config):
            return False
        await self.api.update_device_energy(exclude=set(self.exclude_categories))
        return True

    def _log_daily_energy_outcome(self, fetched: bool) -> None:
        if not fetched or not needs_daily_energy_poll(self.config):
            return
        if self._daily_energy_has_values():
            self._logger.info(
                "Daily kWh statistics updated from cloud (today/yesterday)"
            )
        else:
            self._logger.warning(
                "Daily kWh fetch ran but cloud returned no values for today; "
                "retry on next detail poll (~deviceDetailMultiplier cycles)"
            )

    async def async_get_data(self) -> dict[str, Any]:
        """Same sequence as HA AnkerSolixApiClient.async_get_data (normal poll path)."""
        self._last_period_energy_updated = []
        daily_energy_fetched = False
        self.reapply_max_total_ac_stamps()
        await self.api.update_sites(exclude=set(self.exclude_categories))

        self._intervalcount -= 1
        refresh_details = False
        if self._intervalcount <= 0:
            refresh_details = True
            self.active_device_refresh = True
            self._logger.debug(
                "Updating device and site details (HA interval, mult=%s)",
                self._deviceintervals,
            )
            await self.api.update_device_details(exclude=set(self.exclude_categories))
            await self.api.update_site_details(exclude=set(self.exclude_categories))
            await self._refresh_power_limits()
            if self._startup:
                if needs_daily_energy_poll(self.config):
                    if self.deferred_data:
                        self._logger.info(
                            "Updating deferred energy data (recovered poll state)"
                        )
                        daily_energy_fetched = await self._fetch_daily_energy()
                        await self._update_energy_periods()
                        self._startup = False
                    else:
                        self._logger.info(
                            "Deferring energy updates on first device refresh"
                        )
                else:
                    updated = await self._update_energy_periods()
                    if updated:
                        self.deferred_data = True
                        self._startup = False
            else:
                daily_energy_fetched = await self._fetch_daily_energy()
                await self._update_energy_periods()
            self._intervalcount = self._deviceintervals
            self.active_device_refresh = False
            await self.check_mqtt_session()
            if self.api.mqttsession and self.api.mqttsession.is_connected():
                await self._ensure_mqtt_realtime()
                self.api.update_device_mqtt()
                self.reapply_max_total_ac_stamps()
        elif self._startup and not self.deferred_data:
            self.active_device_refresh = True
            self._logger.info("Updating deferred energy data")
            daily_energy_fetched = await self._fetch_daily_energy()
            await self._update_energy_periods()
            self.deferred_data = True
            self._startup = False
            self.active_device_refresh = False

        self._log_daily_energy_outcome(daily_energy_fetched)

        if self._mqtt_usage and self.api.mqttsession and self.api.mqttsession.is_connected():
            await self._ensure_mqtt_realtime()
            self.api.update_device_mqtt()
            self.reapply_max_total_ac_stamps()

        self._save_state()
        return {
            "caches": self.api.getCaches(),
            "refreshDetails": refresh_details,
            "intervalcount": self._intervalcount,
            "deviceintervals": self._deviceintervals,
            "periodEnergyUpdated": list(self._last_period_energy_updated),
            "dailyEnergyFetched": daily_energy_fetched,
            "dailyEnergyHasValues": daily_energy_fetched
            and self._daily_energy_has_values(),
        }

    async def _ensure_mqtt_realtime(self) -> None:
        """Re-arm MQTT realtime_trigger (0057) so PPS telemetry keeps flowing without the app open."""
        if not self.api.mqttsession or not self.api.mqttsession.is_connected():
            return
        if not self.mqtt_devices:
            return
        timeout = SolixDefaults.TRIGGER_TIMEOUT_DEF
        refresh_after = max(60, timeout - 60)
        now = time.time()
        for sn, mdev in self.mqtt_devices.items():
            if mdev.is_passive():
                continue
            last = self._mqtt_last_trigger.get(sn)
            if last is not None and now - last < refresh_after:
                continue
            triggered = False
            if SolixMqttCommands.realtime_trigger in (mdev.controls or {}):
                with contextlib.suppress(Exception):
                    if await mdev.realtime_trigger(timeout=timeout) is not None:
                        triggered = True
            elif SolixMqttCommands.status_request in (mdev.controls or {}) or (
                hasattr(mdev, "status_request")
                and callable(getattr(mdev, "status_request", None))
            ):
                with contextlib.suppress(Exception):
                    if await mdev.status_request() is not None:
                        triggered = True
            if triggered:
                self._mqtt_last_trigger[sn] = now
                self._mqtt_trigger_warned.discard(sn)
                self._logger.debug("MQTT realtime trigger refreshed for %s", sn)
            elif sn not in self._mqtt_trigger_warned:
                self._mqtt_trigger_warned.add(sn)
                self._logger.warning("MQTT realtime trigger failed for %s", sn)

    async def check_mqtt_session(self) -> None:
        """Same as HA check_mqtt_session (live mode, no file poller)."""
        if not self._mqtt_usage:
            return
        if not self.api.mqttsession or not self.api.mqttsession.is_connected():
            self._logger.info("Starting MQTT session")
            if await self.api.startMqttSession():
                mqtt_devs = [
                    dev for dev in self.api.devices.values() if dev.get("mqtt_supported")
                ]
                for dev in mqtt_devs:
                    self.subscribe_device(dev)
                for dev in mqtt_devs:
                    sn = dev.get("device_sn")
                    if sn and (
                        mdev := SolixMqttDeviceFactory(
                            api_instance=self.api, device_sn=sn
                        ).create_device()
                    ):
                        self.mqtt_devices[sn] = mdev
                await self._ensure_mqtt_realtime()
            else:
                self._logger.error("Failed to start MQTT session")
                self.mqtt_devices.clear()
                self._mqtt_last_trigger.clear()
                self._mqtt_trigger_warned.clear()
        else:
            for mdev in self.mqtt_devices.values():
                if not mdev.is_subscribed() and not self.subscribe_device(mdev.device):
                    mdev.mqttdata.clear()
            await self._ensure_mqtt_realtime()

    def subscribe_device(self, device_dict: dict) -> bool:
        if not self.api.mqttsession or not self.api.mqttsession.is_connected():
            return False
        topic = f"{self.api.mqttsession.get_topic_prefix(deviceDict=device_dict)}#"
        resp = self.api.mqttsession.subscribe(topic)
        if resp and resp.is_failure:
            self._logger.warning("MQTT subscribe failed for topic: %s", topic)
            return False
        return True

    def get_mqtt_device(self, sn: str) -> SolixMqttDevice | None:
        return self.mqtt_devices.get(sn) if sn else None

    def _periods_due_list(self) -> list[str]:
        if time.time() < self._period_backoff_until:
            return []
        enabled = enabled_periods(self.config)
        if not enabled:
            return []
        return periods_due_for_fetch(enabled, self._period_last_fetch, config=self.config)

    async def _update_energy_periods(self) -> bool:
        periods = self._periods_due_list()
        if not periods:
            self._last_period_energy_updated = []
            return False
        from solixapi import errors  # noqa: PLC0415

        try:
            updated = await update_site_energy_periods(
                self.api, self.config, periods=periods
            )
            today = berlin_today_str()
            if not updated:
                self._last_period_energy_updated = []
                self._logger.warning(
                    "Period energy %s: no kWh values from cloud (see energy_analysis warnings); "
                    "will retry on next detail poll after scheduled time",
                    ", ".join(periods),
                )
                return False
            for period in updated:
                self._period_last_fetch[period] = today
            self._last_period_energy_updated = updated
            schedule_hint = ", ".join(
                f"{p} {period_schedule_label(p, self.config)}" for p in updated
            )
            self._logger.info(
                "Period energy updated for %s (daily schedule Europe/Berlin: %s)",
                ", ".join(updated),
                schedule_hint,
            )
            return True
        except errors.RequestLimitError as exc:
            self._period_backoff_until = time.time() + 1800
            self._last_period_energy_updated = []
            self._logger.warning(
                "Period energy skipped for 30 min (rate limit): %s", exc
            )
        except Exception as exc:  # noqa: BLE001
            self._last_period_energy_updated = []
            self._logger.warning("Period energy update failed: %s", exc)
        return False

    def apply_runtime_config(self, config: dict) -> None:
        """Update poll options without tearing down the persistent session."""
        self.config = config
        self.exclude_categories = build_exclude_categories(config)
        self._deviceintervals = max(
            1, int(config.get("deviceDetailMultiplier", self._deviceintervals))
        )
        mqtt_usage = bool(config.get("mqttUsage", self._mqtt_usage))
        if self._mqtt_usage and not mqtt_usage:
            self.api.stopMqttSession()
            self.mqtt_devices.clear()
            self._mqtt_last_trigger.clear()
            self._mqtt_trigger_warned.clear()
        self._mqtt_usage = mqtt_usage
        self.api.apisession.requestDelay(
            float(config.get("requestDelay", DEFAULT_DELAY_TIME))
        )
        self.api.apisession.requestTimeout(
            int(config.get("requestTimeout", DEFAULT_TIMEOUT))
        )
        self.api.apisession.endpointLimit(
            int(config.get("endpointLimit", DEFAULT_ENDPOINT_LIMIT))
        )
