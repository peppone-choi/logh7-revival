from __future__ import annotations

import argparse
import json
import struct
from dataclasses import dataclass
from pathlib import Path

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_x86_patch import X86Builder, hook_jump


SECTION_NAME = b".lg7c\x00\x00\x00"
HOOK_VA = 0x0054ED41
HOOK_BYTES = 7
HOOK_ORIGINAL_HEX = "5f33c05ec20c00"
CONFIRM_TYPE = 5
FINAL_REGISTER_RETURN_VA = 0x00595BC0
X_INSET = 180
PE_SECTION_CODE_READ_EXECUTE = 0x60000020


@dataclass(frozen=True, slots=True)
class ConfirmDialogInsetPatch:
    hook_file_offset: int
    hook_hex: str
    section_rva: int
    section_raw: int
    section_vsize: int
    section_raw_size: int
    section_va: int

    def to_json(self) -> dict[str, object]:
        return {
            "hook": {
                "virtualAddressHex": f"0x{HOOK_VA:08x}",
                "fileOffsetHex": f"0x{self.hook_file_offset:08x}",
                "returnsViaOriginalRet": True,
                "originalHex": HOOK_ORIGINAL_HEX,
                "patchedHex": self.hook_hex,
            },
            "section": {
                "name": SECTION_NAME.rstrip(b"\x00").decode("ascii"),
                "virtualAddressHex": f"0x{self.section_va:08x}",
                "rvaHex": f"0x{self.section_rva:08x}",
                "fileOffsetHex": f"0x{self.section_raw:08x}",
                "virtualSize": self.section_vsize,
                "rawSize": self.section_raw_size,
            },
            "behavior": {
                "site": "FUN_0054ed00 after FUN_00570340/FUN_00570650/FUN_005706e0",
                "gate": f"type == {CONFIRM_TYPE}",
                "callerReturnHex": f"0x{FINAL_REGISTER_RETURN_VA:08x}",
                "xInsetPixels": X_INSET,
                "writes": ["manager+0xdbc", "manager+0xdc4", "widget+0x0c"],
            },
        }


def apply_confirm_dialog_inset_patch(
    source: Path,
    destination: Path,
    manifest_out: Path | None = None,
) -> ConfirmDialogInsetPatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_file_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_file_offset : hook_file_offset + HOOK_BYTES])
    if original.hex() != HOOK_ORIGINAL_HEX:
        raise ValueError(
            f"confirm dialog hook drift at 0x{HOOK_VA:08x}: "
            f"expected {HOOK_ORIGINAL_HEX}, got {original.hex()}"
        )

    pe_offset = _u32(raw, 0x3C)
    section_count = _u16(raw, pe_offset + 6)
    optional_size = _u16(raw, pe_offset + 20)
    optional_header = pe_offset + 24
    section_alignment = _u32(raw, optional_header + 32)
    file_alignment = _u32(raw, optional_header + 36)
    section_table = optional_header + optional_size
    new_header_offset = section_table + section_count * 40
    first_section_raw = min(section.raw_pointer for section in image.sections if section.raw_pointer)
    if new_header_offset + 40 > first_section_raw:
        raise ValueError("no room for an extra PE section header")

    last_section = max(
        image.sections,
        key=lambda section: section.virtual_address + max(section.virtual_size, section.raw_size),
    )
    new_rva = _align(
        last_section.virtual_address + max(last_section.virtual_size, last_section.raw_size),
        section_alignment,
    )
    trampoline = _build_trampoline(image.image_base + new_rva)
    new_raw_pointer = _align(len(raw), file_alignment)
    new_raw_size = _align(len(trampoline), file_alignment)
    new_virtual_size = len(trampoline)

    if len(raw) < new_raw_pointer:
        raw.extend(b"\x00" * (new_raw_pointer - len(raw)))
    raw.extend(trampoline)
    raw.extend(b"\x00" * (new_raw_size - len(trampoline)))

    raw[new_header_offset : new_header_offset + 40] = _section_header(
        name=SECTION_NAME,
        virtual_size=new_virtual_size,
        virtual_address=new_rva,
        raw_size=new_raw_size,
        raw_pointer=new_raw_pointer,
        characteristics=PE_SECTION_CODE_READ_EXECUTE,
    )
    struct.pack_into("<H", raw, pe_offset + 6, section_count + 1)
    struct.pack_into("<I", raw, optional_header + 56, _align(new_rva + new_virtual_size, section_alignment))

    hook = hook_jump(HOOK_VA, image.image_base + new_rva, HOOK_BYTES)
    raw[hook_file_offset : hook_file_offset + HOOK_BYTES] = hook

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(raw)
    patch = ConfirmDialogInsetPatch(
        hook_file_offset=hook_file_offset,
        hook_hex=hook.hex(),
        section_rva=new_rva,
        section_raw=new_raw_pointer,
        section_vsize=new_virtual_size,
        section_raw_size=new_raw_size,
        section_va=image.image_base + new_rva,
    )
    if manifest_out is not None:
        manifest_out.parent.mkdir(parents=True, exist_ok=True)
        manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int) -> bytes:
    builder = X86Builder(base_va)
    builder.append(b"\x83\x7c\x24\x0c")
    builder.u8(CONFIRM_TYPE)
    skip_adjust = builder.jne_rel8_placeholder()
    builder.append(b"\x81\x7c\x24\x08")
    builder.u32(FINAL_REGISTER_RETURN_VA)
    skip_adjust_return = builder.jne_rel8_placeholder()
    builder.append(b"\x81\x86")
    builder.u32(0xDBC)
    builder.u32(X_INSET)
    builder.append(b"\x81\x86")
    builder.u32(0xDC4)
    builder.u32(X_INSET)
    builder.append(b"\x8b\x46\x08")
    builder.append(b"\x85\xc0")
    skip_widget_adjust = builder.je_rel8_placeholder()
    builder.append(b"\x81\x40\x0c")
    builder.u32(X_INSET)
    builder.patch_rel8(skip_widget_adjust, builder.current_va)
    builder.patch_rel8(skip_adjust_return, builder.current_va)
    builder.patch_rel8(skip_adjust, builder.current_va)
    builder.append(bytes.fromhex(HOOK_ORIGINAL_HEX))
    return bytes(builder.data)


def _section_header(
    *,
    name: bytes,
    virtual_size: int,
    virtual_address: int,
    raw_size: int,
    raw_pointer: int,
    characteristics: int,
) -> bytes:
    if len(name) != 8:
        raise ValueError("section name must be exactly 8 bytes")
    return struct.pack(
        "<8sIIIIIIHHI",
        name,
        virtual_size,
        virtual_address,
        raw_size,
        raw_pointer,
        0,
        0,
        0,
        0,
        characteristics,
    )


def _align(value: int, alignment: int) -> int:
    return ((value + alignment - 1) // alignment) * alignment


def _u16(data: bytes | bytearray, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def _u32(data: bytes | bytearray, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII final confirm dialog panel inset.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--manifest-out", type=Path)
    args = parser.parse_args()
    patch = apply_confirm_dialog_inset_patch(args.source, args.out, args.manifest_out)
    print(json.dumps(patch.to_json(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
