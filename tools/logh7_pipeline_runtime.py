from __future__ import annotations

from pathlib import Path

from logh7_packet_trace import write_gameplay_trace_analysis
from logh7_runtime_child_trace import write_runtime_child_trace_index
from logh7_runtime_child_encode_patch import apply_runtime_child_encode_patch
from logh7_runtime_child_post_encode_patch import apply_runtime_child_post_encode_patch
from logh7_runtime_child_schedule_patch import apply_runtime_child_schedule_patch
from logh7_runtime_keylog import write_runtime_keylog_index
from logh7_runtime_keylog_patch import apply_runtime_keylog_patch
from logh7_runtime_manager import write_runtime_manager_index
from logh7_runtime_manager_callback_patch import apply_runtime_manager_callback_patch
from logh7_runtime_manager_clear_patch import apply_runtime_manager_clear_patch
from logh7_runtime_manager_cleanup_patch import apply_runtime_manager_cleanup_patch
from logh7_runtime_manager_destructor_patch import apply_runtime_manager_destructor_patch
from logh7_runtime_manager_dispatcher_node_patch import apply_runtime_manager_dispatcher_node_patch
from logh7_runtime_manager_dispatcher_patch import apply_runtime_manager_dispatcher_patch
from logh7_runtime_manager_member_slot_effect_patch import apply_runtime_manager_member_slot_effect_patch
from logh7_runtime_manager_member_slot_patch import apply_runtime_manager_member_slot_patch
from logh7_runtime_manager_member_slot_tail_patch import apply_runtime_manager_member_slot_tail_patch
from logh7_runtime_manager_nested_callback_patch import apply_runtime_manager_nested_callback_patch
from logh7_runtime_manager_patch import apply_runtime_manager_patch
from logh7_runtime_manager_state_trigger_patch import apply_runtime_manager_state_trigger_patch
from logh7_runtime_manager_state_patch import apply_runtime_manager_state_patch
from logh7_runtime_keyread_patch import apply_runtime_keyread_patch
from logh7_runtime_keysetup_patch import apply_runtime_keysetup_patch
from logh7_runtime_patch_targets import write_runtime_patch_target_index
from logh7_runtime_queue_append_patch import apply_runtime_queue_append_patch
from logh7_runtime_queue_entry_patch import apply_runtime_queue_entry_patch
from logh7_socket_boundary import write_socket_boundary_index
from logh7_socket_recv_all_patch import apply_socket_recv_all_patch
from logh7_socket_recv_phase_ring_patch import apply_socket_recv_phase3_ring_patch, apply_socket_recv_phase_ring_patch
from logh7_socket_recv_patch import apply_socket_recv_patch
from logh7_socket_recv_ring_patch import apply_socket_recv_ring_patch
from logh7_socket_recv_window_patch import apply_socket_recv_window_patch


def write_runtime_patch_targets(source: Path, destination: Path) -> None:
    write_runtime_patch_target_index(source, destination)
    print(f"wrote {destination}")


def write_runtime_manager(source: Path, destination: Path) -> None:
    write_runtime_manager_index(source, destination)
    print(f"wrote {destination}")


def write_runtime_manager_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_manager_clear_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_clear_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_manager_destructor_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_destructor_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_manager_cleanup_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_cleanup_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_manager_callback_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_callback_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_manager_state_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_state_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_manager_dispatcher_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_dispatcher_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_manager_dispatcher_node_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_dispatcher_node_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_manager_nested_callback_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_nested_callback_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_manager_state_trigger_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_state_trigger_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_manager_member_slot_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_member_slot_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_manager_member_slot_effect_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_member_slot_effect_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_manager_member_slot_tail_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_manager_member_slot_tail_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_keylog_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_keylog_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_keysetup_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_keysetup_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_keyread_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_keyread_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_child_encode_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_child_encode_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_child_post_encode_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_child_post_encode_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_child_schedule_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_child_schedule_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_queue_append_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_queue_append_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_queue_entry_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_runtime_queue_entry_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_runtime_child_trace_records(source: Path, destination: Path) -> None:
    write_runtime_child_trace_index(source, destination)
    print(f"wrote {destination}")


def write_runtime_keylog_records(source: Path, destination: Path) -> None:
    write_runtime_keylog_index(source, destination)
    print(f"wrote {destination}")


def write_gameplay_packet_analysis(source: Path, destination: Path) -> None:
    write_gameplay_trace_analysis(source, destination)
    print(f"wrote {destination}")


def write_socket_boundary(source: Path, destination: Path) -> None:
    write_socket_boundary_index(source, destination)
    print(f"wrote {destination}")


def write_socket_recv_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_socket_recv_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_socket_recv_all_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_socket_recv_all_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_socket_recv_ring_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_socket_recv_ring_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_socket_recv_phase_ring_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_socket_recv_phase_ring_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_socket_recv_phase3_ring_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_socket_recv_phase3_ring_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_socket_recv_window_patch(source: Path, destination: Path, manifest_out: Path) -> None:
    apply_socket_recv_window_patch(source, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")
