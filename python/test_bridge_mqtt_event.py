"""Unit tests for bridge.build_mqtt_device_event (Feature #26).

Run directly: `python python/test_bridge_mqtt_event.py` (or `py -m unittest
python/test_bridge_mqtt_event.py` on Windows). No pytest/network/MQTT broker
required — uses synthetic in-memory caches and a minimal fake client, the
same way the real daemon's api/device caches look after a poll.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from bridge import _devices_from_caches, build_mqtt_device_event  # noqa: E402


class _FakeApi:
    """Stand-in for solixapi.api.AnkerSolixApi: only the attrs bridge.py touches."""

    def __init__(self, devices: dict, sites: dict) -> None:
        self.devices = devices
        self.sites = sites

    def getCaches(self) -> dict:
        return {**self.sites, **self.devices}

    def solarbank_usage_mode_options(self, deviceSn: str | None = None) -> set[str]:  # noqa: N803
        return set()


class _FakeClient:
    """Stand-in for ha_api_client.IoBrokerAnkerApiClient: only the attrs bridge.py touches."""

    def __init__(self, api: _FakeApi, *, mqtt_usage: bool = True) -> None:
        self.api = api
        self._mqtt_usage = mqtt_usage

    def get_mqtt_device(self, sn: str):  # noqa: ANN201
        return None


def _make_client_and_caches() -> tuple[_FakeClient, dict]:
    site_id = "site-1"
    device_sn = "SMARTPLUG-SN-1"
    sites = {site_id: {"site_name": "Home", "site_id": site_id}}
    devices = {
        device_sn: {
            "type": "smartplug",
            "device_sn": device_sn,
            "device_name": "Plug 1",
            "site_id": site_id,
            "device_pn": "A17X8",
            "power": 42.5,
        }
    }
    api = _FakeApi(devices, sites)
    client = _FakeClient(api)
    return client, {**sites, **devices}


class BuildMqttDeviceEventTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client, self.caches = _make_client_and_caches()
        self.config = {"enableSmartplug": True}

    def test_builds_single_device_entry_with_live_value(self) -> None:
        entry = build_mqtt_device_event(self.client, self.config, "SMARTPLUG-SN-1")
        self.assertIsNotNone(entry)
        assert entry is not None  # for type-checkers
        self.assertEqual(entry["info"]["id"], "SMARTPLUG-SN-1")
        self.assertEqual(entry["info"]["type"], "smartplug")
        self.assertIn("smartplug_power", entry["entities"])
        self.assertEqual(entry["entities"]["smartplug_power"], 42.5)

    def test_unknown_device_sn_returns_none(self) -> None:
        self.assertIsNone(
            build_mqtt_device_event(self.client, self.config, "does-not-exist")
        )

    def test_excluded_device_returns_none(self) -> None:
        # selectedDeviceIds without our SN -> should_include_device() excludes it
        config = {**self.config, "enableAllDevices": False, "selectedDeviceIds": ["other-sn"]}
        self.assertIsNone(
            build_mqtt_device_event(self.client, config, "SMARTPLUG-SN-1")
        )

    def test_matches_full_poll_entry_for_same_device(self) -> None:
        """MQTT push path and full poll path must build byte-identical entries."""
        poll_devices = _devices_from_caches(self.client, self.config, self.caches)
        poll_entry = next(
            d for d in poll_devices if d["info"]["id"] == "SMARTPLUG-SN-1"
        )
        mqtt_entry = build_mqtt_device_event(self.client, self.config, "SMARTPLUG-SN-1")
        self.assertEqual(poll_entry, mqtt_entry)

    def test_disabled_entity_group_yields_no_entities_and_none_entry(self) -> None:
        # Without enableSmartplug, smartplug_power is not extracted -> no entities/writable
        # -> _build_device_entry returns None (device skipped, same as full poll).
        entry = build_mqtt_device_event(self.client, {}, "SMARTPLUG-SN-1")
        self.assertIsNone(entry)


if __name__ == "__main__":
    unittest.main()
