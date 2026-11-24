"""Tests for PPS entities added for Issue #24 follow-up (AS220/A1783 MQTT fields).

Covers: pps_remaining_time_hours (fixed decode), pps_ac_output_power (new sensor),
pps_max_soc / pps_min_soc (new SOC loading limit controls).
"""

import sys
from pathlib import Path
from unittest.mock import patch

PYTHON_DIR = Path(__file__).resolve().parents[1] / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from entities import extract_entities  # noqa: E402

_CFG = {"enablePps": True}
_PATCH = (
    patch("entities.extract_statistics_entities", return_value={}),
    patch("lifetime_statistics.extract_lifetime_statistics_entities", return_value={}),
)


def _extract(data: dict) -> dict:
    with _PATCH[0], _PATCH[1]:
        return extract_entities(data, _CFG)


def test_pps_mqtt_fields_extracted() -> None:
    data = {
        "type": "pps",
        "mqtt_data": True,
        "remaining_time_hours": "1.5",
        "ac_output_power": "120",
        "min_soc": "10",
        "max_soc": "90",
    }
    entities = _extract(data)
    assert entities["pps_remaining_time_hours"] == "1.5"
    assert entities["pps_ac_output_power"] == "120"
    assert entities["pps_min_soc"] == "10"
    assert entities["pps_max_soc"] == "90"


def test_pps_min_soc_falls_back_to_power_cutoff_key() -> None:
    data = {
        "type": "pps",
        "power_cutoff": "5",
    }
    entities = _extract(data)
    assert entities["pps_min_soc"] == "5"
