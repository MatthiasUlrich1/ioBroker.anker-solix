"""Solarbank 3 expansion battery and per-input PV power entities (#20)."""

import sys
from pathlib import Path
from unittest.mock import patch

PYTHON_DIR = Path(__file__).resolve().parents[1] / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from entities import extract_entities  # noqa: E402

_CFG = {"enablePowerFlows": True, "enableDiagnostics": True}
_PATCH = (
    patch("entities.extract_statistics_entities", return_value={}),
    patch("lifetime_statistics.extract_lifetime_statistics_entities", return_value={}),
)


def _extract(data: dict) -> dict:
    with _PATCH[0], _PATCH[1]:
        return extract_entities(data, _CFG)


def test_mqtt_exp_and_pv_power() -> None:
    data = {
        "type": "solarbank",
        "device_pn": "A17C5",
        "mqtt_data": {
            "expansion_packs": 1,
            "exp_1_soc": 77,
            "exp_1_soh": 99,
            "exp_1_temperature": 24,
            "pv_1_power": 320,
            "pv_2_power": 110,
            "pv_3_power": 0,
            "pv_4_power": 45,
        },
    }
    entities = _extract(data)
    assert entities["expansion_packs"] == 1
    assert entities["exp_1_soc"] == 77
    assert entities["exp_1_soh"] == 99
    assert entities["exp_1_temperature"] == 24
    assert entities["pv_1_power"] == 320
    assert entities["pv_2_power"] == 110
    assert entities["pv_3_power"] == 0
    assert entities["pv_4_power"] == 45
    assert "exp_2_soc" not in entities


def test_cloud_solar_power_and_sub_package_fallback() -> None:
    data = {
        "type": "solarbank",
        "device_pn": "A17C5",
        "sub_package_num": 1,
        "solar_power_1": "210",
        "solar_power_2": "95",
        "pv_name": {"pv1_name": "Ost", "pv2_name": "West"},
    }
    entities = _extract(data)
    assert entities["expansion_packs"] == 1
    assert entities["pv_1_power"] == "210"
    assert entities["pv_2_power"] == "95"
    assert entities["pv_1_name"] == "Ost"
    assert entities["pv_2_name"] == "West"
    assert "pv_3_name" not in entities


def test_mqtt_pv_preferred_over_cloud() -> None:
    data = {
        "type": "solarbank",
        "solar_power_1": "100",
        "mqtt_data": {"pv_1_power": 250},
    }
    entities = _extract(data)
    assert entities["pv_1_power"] == 250
