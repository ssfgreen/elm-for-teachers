import json
import zipfile

import pytest

from edw_analysis.bundle import load_session, session_info

OLD = {
    "session_id": "s1",
    "label": "Year 7 English",
    "tool_version": "0.1.0",
    "config_hash": "c",
    "system_prompt_hash": "p",
    "created_at": "2026-11-01T09:00:00.000Z",
    "first_opened_at": None,
}


def test_old_bundle_reads_as_link():
    assert session_info(OLD)["access"] == "link"


def test_access_is_kept_when_present():
    assert session_info({**OLD, "access": "account"})["access"] == "account"
    assert session_info({**OLD, "access": "link"})["access"] == "link"


def test_unknown_access_is_refused():
    with pytest.raises(ValueError):
        session_info({**OLD, "access": "email"})


#: Every switch on but pupils, which is off by default (issue #179).
ALL_ON = {
    "classes": True,
    "curriculum": True,
    "pedagogy": True,
    "preferences": True,
    "spyglass": True,
    "plugins": True,
    "pupils": False,
}


def test_old_bundle_reads_as_all_features_on_and_pupils_off():
    assert session_info(OLD)["features"] == ALL_ON


def test_a_bundle_from_before_the_pupils_switch_reads_pupils_off():
    six = {
        "classes": True,
        "curriculum": True,
        "pedagogy": True,
        "preferences": True,
        "spyglass": False,
        "plugins": True,
    }
    assert session_info({**OLD, "features": six})["features"] == {
        **six,
        "pupils": False,
    }
    assert (
        session_info({**OLD, "features": {**six, "pupils": True}})["features"]["pupils"]
        is True
    )


def test_features_are_kept_when_present():
    features = {**ALL_ON, "spyglass": False, "classes": False}
    assert session_info({**OLD, "features": features})["features"] == features
    # A switch left out reads as on, as the server reads it.
    assert session_info({**OLD, "features": {"plugins": False}})["features"] == {
        **ALL_ON,
        "plugins": False,
    }


def test_load_from_zip_and_folder(tmp_path):
    folder = tmp_path / "bundle"
    folder.mkdir()
    (folder / "session.json").write_text(json.dumps({**OLD, "access": "account"}))
    zipped = tmp_path / "Year 7 English export.zip"
    with zipfile.ZipFile(zipped, "w") as z:
        z.writestr("session.json", json.dumps(OLD))
    assert load_session(folder)["access"] == "account"
    assert load_session(zipped)["access"] == "link"
    assert load_session(zipped)["session_id"] == "s1"
