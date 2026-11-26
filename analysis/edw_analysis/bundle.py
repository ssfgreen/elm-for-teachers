"""Read a session bundle: the exported zip, or a folder it was unpacked into."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any

#: How a workspace is reached. Bundles from before 13 Nov 2026 have no ``access``; every
#: workspace then was reached by its participant link, so they read as "link".
ACCESS_VALUES = ("link", "account")
DEFAULT_ACCESS = "link"

#: The feature switches (packages/shared/src/features.ts) and their defaults. Bundles from before
#: 15 Nov 2026 have no ``features``; every workspace then had every feature on. ``pupils`` (from
#: 23 Nov 2026, issue #179) is off by default and only an admin turns it on, so a bundle that leaves
#: it out reads as off. Any other switch a bundle leaves out reads as on, as the server reads it.
FEATURE_DEFAULTS = {
    "classes": True,
    "curriculum": True,
    "pedagogy": True,
    "preferences": True,
    "spyglass": True,
    "plugins": True,
    "pupils": False,
}
FEATURE_NAMES = tuple(FEATURE_DEFAULTS)


def read_file(bundle: str | Path, name: str) -> str:
    """The text of one file in the bundle (a zip or a folder)."""
    path = Path(bundle)
    if path.is_dir():
        return (path / name).read_text(encoding="utf-8")
    with zipfile.ZipFile(path) as z:
        return z.read(name).decode("utf-8")


def session_info(raw: dict[str, Any]) -> dict[str, Any]:
    """session.json as a dict, with ``access`` and ``features`` filled in for an older bundle."""
    out = dict(raw)
    access = out.get("access", DEFAULT_ACCESS)
    if access not in ACCESS_VALUES:
        raise ValueError(f"session.json has an unknown access: {access!r}")
    out["access"] = access
    given = out.get("features") or {}
    # As the server: a stored true or false is kept, anything else reads as the default.
    out["features"] = {
        name: given[name] if isinstance(given.get(name), bool) else default
        for name, default in FEATURE_DEFAULTS.items()
    }
    return out


def load_session(bundle: str | Path) -> dict[str, Any]:
    """Read session.json from a bundle."""
    return session_info(json.loads(read_file(bundle, "session.json")))
