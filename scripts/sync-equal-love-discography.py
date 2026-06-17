#!/usr/bin/env python3
"""Backward-compatible =LOVE sync entrypoint."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("sync-project-discography.py")


def main() -> None:
    raise SystemExit(
        subprocess.call(
            [sys.executable, str(SCRIPT_PATH), "--project", "equal-love"],
        ),
    )


if __name__ == "__main__":
    main()
