from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.logh7_player_runtime import player_launcher_manifest, write_player_runtime_files


DEFAULT_INSTALLED_ROOT = Path(".omo/work/logh7-installed")


def main() -> int:
    parser = argparse.ArgumentParser(description="Stage and compile the LOGH VII player launcher runtime.")
    parser.add_argument("--installed-root", type=Path, default=DEFAULT_INSTALLED_ROOT)
    args = parser.parse_args()

    written = write_player_runtime_files(args.installed_root)
    print(json.dumps({"installedRoot": str(args.installed_root), "playerLauncher": player_launcher_manifest(),
                      "written": written}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
