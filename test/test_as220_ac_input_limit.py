"""AS220 (SOLIX S2000) AC charge/input limit validation (Issue #24 Clipper11)."""

import sys
from pathlib import Path

import pytest

PYTHON_DIR = Path(__file__).resolve().parents[1] / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from solixapi.mqttcmdmap import (  # noqa: E402
    VALUE_MAX,
    VALUE_MIN,
    VALUE_STEP,
    SolixMqttCommands,
)
from solixapi.mqttmap import SOLIXMQTTMAP  # noqa: E402
from solixapi.mqtttypes import MqttCmdValidator  # noqa: E402


def _as220_ac_charge_validator() -> MqttCmdValidator:
    field = SOLIXMQTTMAP["AS220"]["0101"][SolixMqttCommands.ac_charge_limit]["a4"]
    return MqttCmdValidator(
        min=field[VALUE_MIN],
        max=field[VALUE_MAX],
        step=field[VALUE_STEP],
    )


def test_as220_ac_charge_limit_accepts_100w() -> None:
    assert _as220_ac_charge_validator().check(100) == 100


def test_as220_ac_charge_limit_rejects_below_min() -> None:
    validator = _as220_ac_charge_validator()
    with pytest.raises(ValueError):
        validator.check(0)
    with pytest.raises(ValueError):
        validator.check(50)