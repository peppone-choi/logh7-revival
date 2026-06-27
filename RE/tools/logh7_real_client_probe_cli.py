from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.logh7_real_client_probe import DEFAULT_COMMAND_OK_RESPONSE_CODE, run_real_client_dynamic_probe


def main() -> int:
    parser = argparse.ArgumentParser(description="Run or prepare LOGH VII real-client dynamic probe artifacts.")
    parser.add_argument("installed_root", type=Path)
    parser.add_argument("--manifest-out", type=Path, required=True)
    parser.add_argument("--trace-out", type=Path, required=True)
    parser.add_argument("--analysis-out", type=Path, required=True)
    parser.add_argument("--result-out", type=Path, required=True)
    parser.add_argument("--port", type=int, default=47900)
    parser.add_argument("--timeout-seconds", type=int, default=20)
    parser.add_argument("--command-ok-response-code", type=lambda value: int(value, 0), default=DEFAULT_COMMAND_OK_RESPONSE_CODE)
    parser.add_argument("--command-ok-entity-key", type=lambda value: int(value, 0))
    args = parser.parse_args()
    run_real_client_dynamic_probe(
        installed_root=args.installed_root,
        manifest_out=args.manifest_out,
        trace_out=args.trace_out,
        analysis_out=args.analysis_out,
        result_out=args.result_out,
        port=args.port,
        timeout_seconds=args.timeout_seconds,
        command_ok_response_code=args.command_ok_response_code,
        command_ok_entity_key=args.command_ok_entity_key,
    )
    print(f"wrote {args.result_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
