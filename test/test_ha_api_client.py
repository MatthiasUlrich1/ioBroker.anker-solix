"""Unit tests for IoBrokerAnkerApiClient helpers."""

import asyncio
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

PYTHON_DIR = Path(__file__).resolve().parents[1] / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from ha_api_client import IoBrokerAnkerApiClient  # noqa: E402
from solixapi.mqttcmdmap import SolixMqttCommands  # noqa: E402


def _minimal_config(**overrides) -> dict:
    base = {
        "username": "user@example.com",
        "password": "secret",
        "country": "DE",
        "cacheDir": str(PYTHON_DIR / "authcache"),
        "enableEnergyStatisticsWeek": True,
        "enableEnergyStatisticsMonth": True,
        "enableEnergyStatisticsYear": True,
    }
    base.update(overrides)
    return base


@pytest.fixture
def client() -> IoBrokerAnkerApiClient:
    session = MagicMock()
    logger = MagicMock()
    return IoBrokerAnkerApiClient(_minimal_config(), session, logger)


def test_client_stores_config(client: IoBrokerAnkerApiClient) -> None:
    assert client.config is not None
    assert client.config.get("username") == "user@example.com"


def test_stuck_startup_state_still_fetches_daily_energy(
    client: IoBrokerAnkerApiClient,
) -> None:
    """startup=true and deferred_data=true must not skip daily energy forever."""
    client._startup = True
    client.deferred_data = True
    client._intervalcount = 0
    client.config["enableEnergyStatistics"] = True
    client.api.update_sites = AsyncMock(return_value=None)  # type: ignore[method-assign]
    client.api.update_device_details = AsyncMock(return_value=None)  # type: ignore[method-assign]
    client.api.update_site_details = AsyncMock(return_value=None)  # type: ignore[method-assign]
    client.api.update_device_energy = AsyncMock(return_value=None)  # type: ignore[method-assign]
    client.api.getCaches = MagicMock(return_value={})  # type: ignore[method-assign]
    client.api.sites = {"s1": {"energy_details": {"today": {"solar_production": "1.2"}}}}
    client.api.mqttsession = None
    client._refresh_power_limits = AsyncMock(return_value=None)  # type: ignore[method-assign]

    import asyncio

    result = asyncio.run(client.async_get_data())

    client.api.update_device_energy.assert_called_once()
    assert result["dailyEnergyFetched"] is True
    assert result["dailyEnergyHasValues"] is True
    assert client._startup is False


def test_period_rotation_fetches_one_period_at_a_time(
    client: IoBrokerAnkerApiClient,
) -> None:
    first = client._periods_for_this_refresh()
    second = client._periods_for_this_refresh()
    third = client._periods_for_this_refresh()
    assert len(first) == 1
    assert len(second) == 1
    assert len(third) == 1
    assert first != second != third


def _mqtt_device(controls: dict, is_passive: bool = False) -> MagicMock:
    mdev = MagicMock()
    mdev.controls = controls
    mdev.is_passive.return_value = is_passive
    mdev.realtime_trigger = AsyncMock(return_value={})
    mdev.status_request = AsyncMock(return_value={})
    return mdev


def test_ensure_mqtt_realtime_triggers_pps_device(
    client: IoBrokerAnkerApiClient,
) -> None:
    """PPS devices with realtime_trigger support get a 0057 trigger sent."""
    client.api.mqttsession = MagicMock()
    client.api.mqttsession.is_connected.return_value = True
    mdev = _mqtt_device({SolixMqttCommands.realtime_trigger: {}})
    client.mqtt_devices = {"SN1": mdev}

    asyncio.run(client._ensure_mqtt_realtime())

    mdev.realtime_trigger.assert_awaited_once()
    mdev.status_request.assert_not_awaited()
    assert "SN1" in client._mqtt_last_trigger


def test_ensure_mqtt_realtime_falls_back_to_status_request(
    client: IoBrokerAnkerApiClient,
) -> None:
    """Devices without realtime_trigger fall back to status_request."""
    client.api.mqttsession = MagicMock()
    client.api.mqttsession.is_connected.return_value = True
    mdev = _mqtt_device({SolixMqttCommands.status_request: {}})
    client.mqtt_devices = {"SN2": mdev}

    asyncio.run(client._ensure_mqtt_realtime())

    mdev.status_request.assert_awaited_once()
    assert "SN2" in client._mqtt_last_trigger


def test_ensure_mqtt_realtime_skips_passive_and_recent(
    client: IoBrokerAnkerApiClient,
) -> None:
    """Passive devices and recently-triggered devices are skipped."""
    client.api.mqttsession = MagicMock()
    client.api.mqttsession.is_connected.return_value = True
    passive = _mqtt_device({SolixMqttCommands.realtime_trigger: {}}, is_passive=True)
    recent = _mqtt_device({SolixMqttCommands.realtime_trigger: {}})
    client.mqtt_devices = {"PASSIVE": passive, "RECENT": recent}
    client._mqtt_last_trigger["RECENT"] = time.time()

    asyncio.run(client._ensure_mqtt_realtime())

    passive.realtime_trigger.assert_not_awaited()
    recent.realtime_trigger.assert_not_awaited()
