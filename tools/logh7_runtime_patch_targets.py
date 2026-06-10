from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

if __package__:
    from .logh7_child_codec import PeSection, _parse_pe_image, pe_virtual_address_to_file_offset
    from .logh7_runtime_target_specs import PATCH_TARGET_SPECS
else:
    from logh7_child_codec import PeSection, _parse_pe_image, pe_virtual_address_to_file_offset
    from logh7_runtime_target_specs import PATCH_TARGET_SPECS


SIGNATURE_LENGTH: Final[int] = 16
IMAGE_DIRECTORY_ENTRY_IMPORT: Final[int] = 1
PE_DATA_DIRECTORY_OFFSET: Final[int] = 96
IMPORT_DESCRIPTOR_SIZE: Final[int] = 20
CODE_CAVE_MINIMUM_BYTES: Final[int] = 256
PE_SECTION_EXECUTE: Final[int] = 0x20000000
PE_SECTION_WRITE: Final[int] = 0x80000000
REQUIRED_IMPORT_NAMES: Final[frozenset[str]] = frozenset(
    {
        "CloseHandle",
        "CreateFileA",
        "OutputDebugStringA",
        "SetFilePointer",
        "WriteFile",
        "lstrlenA",
        "wsprintfA",
    }
)

@dataclass(frozen=True, slots=True)
class RuntimePatchTarget:
    name: str
    virtual_address: int
    file_offset: int
    original_hex: str
    role: str
    patch_strategy: str
    evidence: str

    def to_json(self) -> dict[str, int | str]:
        return {
            "name": self.name,
            "virtualAddress": self.virtual_address,
            "virtualAddressHex": f"0x{self.virtual_address:08x}",
            "fileOffset": self.file_offset,
            "fileOffsetHex": f"0x{self.file_offset:08x}",
            "originalHex": self.original_hex,
            "role": self.role,
            "patchStrategy": self.patch_strategy,
            "evidence": self.evidence,
        }


@dataclass(frozen=True, slots=True)
class RuntimeCodeCave:
    virtual_address: int
    file_offset: int
    length_bytes: int
    fill_byte: int

    def to_json(self) -> dict[str, int | str]:
        return {
            "virtualAddress": self.virtual_address,
            "virtualAddressHex": f"0x{self.virtual_address:08x}",
            "fileOffset": self.file_offset,
            "fileOffsetHex": f"0x{self.file_offset:08x}",
            "lengthBytes": self.length_bytes,
            "fillByteHex": f"0x{self.fill_byte:02x}",
        }

def _u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def _u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def _section_by_rva(sections: tuple[PeSection, ...], rva: int) -> PeSection:
    for section in sections:
        section_size = max(section.virtual_size, section.raw_size)
        if section.virtual_address <= rva < section.virtual_address + section_size:
            return section
    raise ValueError(f"RVA is not mapped in PE sections: 0x{rva:08x}")


def _rva_to_offset(sections: tuple[PeSection, ...], rva: int) -> int:
    section = _section_by_rva(sections, rva)
    return section.raw_pointer + (rva - section.virtual_address)


def _cstring(data: bytes, offset: int) -> str:
    return data[offset : data.index(0, offset)].decode("ascii")


def _import_directory(data: bytes) -> tuple[int, int]:
    pe_offset = _u32(data, 0x3C)
    optional_header = pe_offset + 24
    directory = optional_header + PE_DATA_DIRECTORY_OFFSET + IMAGE_DIRECTORY_ENTRY_IMPORT * 8
    return _u32(data, directory), _u32(data, directory + 4)


def extract_runtime_probe_imports(source: Path) -> dict[str, str]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    import_rva, _import_size = _import_directory(data)
    descriptor_offset = _rva_to_offset(image.sections, import_rva)
    imports: dict[str, str] = {}
    descriptor_index = 0
    while True:
        original_thunk, _timestamp, _forwarder, _name_rva, first_thunk = struct.unpack_from(
            "<IIIII", data, descriptor_offset + descriptor_index * IMPORT_DESCRIPTOR_SIZE
        )
        if original_thunk == 0 and first_thunk == 0:
            break
        thunk_rva = original_thunk or first_thunk
        thunk_index = 0
        while True:
            thunk_value = _u32(data, _rva_to_offset(image.sections, thunk_rva + thunk_index * 4))
            if thunk_value == 0:
                break
            if not (thunk_value & 0x80000000):
                name_offset = _rva_to_offset(image.sections, thunk_value) + 2
                name = _cstring(data, name_offset)
                if name in REQUIRED_IMPORT_NAMES:
                    imports[name] = f"0x{image.image_base + first_thunk + thunk_index * 4:08x}"
            thunk_index += 1
        descriptor_index += 1
    missing = sorted(REQUIRED_IMPORT_NAMES - imports.keys())
    if missing:
        raise ValueError(f"runtime probe imports missing: {', '.join(missing)}")
    return dict(sorted(imports.items()))


def _find_fill_runs(raw: bytes, fill_byte: int) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    run_start = 0
    run_length = 0
    for offset, value in enumerate(raw):
        if value == fill_byte:
            if run_length == 0:
                run_start = offset
            run_length += 1
            continue
        if run_length >= CODE_CAVE_MINIMUM_BYTES:
            runs.append((run_start, run_length))
        run_length = 0
    if run_length >= CODE_CAVE_MINIMUM_BYTES:
        runs.append((run_start, run_length))
    return runs


def find_runtime_probe_code_cave(source: Path) -> RuntimeCodeCave:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    candidates: list[RuntimeCodeCave] = []
    pe_offset = _u32(data, 0x3C)
    optional_header_size = _u16(data, pe_offset + 20)
    section_table = pe_offset + 24 + optional_header_size
    for index, section in enumerate(image.sections):
        section_header = section_table + index * 40
        characteristics = _u32(data, section_header + 36)
        if not (characteristics & PE_SECTION_EXECUTE):
            continue
        raw = data[section.raw_pointer : section.raw_pointer + section.raw_size]
        for fill_byte in (0, 0x90):
            for run_start, run_length in _find_fill_runs(raw, fill_byte):
                candidates.append(
                    RuntimeCodeCave(
                        virtual_address=image.image_base + section.virtual_address + run_start,
                        file_offset=section.raw_pointer + run_start,
                        length_bytes=run_length,
                        fill_byte=fill_byte,
                    )
                )
    if not candidates:
        raise ValueError("runtime probe code cave not found")
    return max(candidates, key=lambda candidate: candidate.length_bytes)


def enable_section_write_for_virtual_address(raw: bytearray, virtual_address: int) -> tuple[int, int]:
    image = _parse_pe_image(raw)
    rva = virtual_address - image.image_base
    pe_offset = _u32(raw, 0x3C)
    optional_header_size = _u16(raw, pe_offset + 20)
    section_table = pe_offset + 24 + optional_header_size
    for index, section in enumerate(image.sections):
        section_size = max(section.virtual_size, section.raw_size)
        if section.virtual_address <= rva < section.virtual_address + section_size:
            characteristics_offset = section_table + index * 40 + 36
            previous = _u32(raw, characteristics_offset)
            updated = previous | PE_SECTION_WRITE
            raw[characteristics_offset : characteristics_offset + 4] = struct.pack("<I", updated)
            return previous, updated
    raise ValueError(f"virtual address is not mapped in PE sections: 0x{virtual_address:08x}")


def extract_runtime_patch_targets(source: Path) -> tuple[RuntimePatchTarget, ...]:
    data = source.read_bytes()
    targets: list[RuntimePatchTarget] = []
    for spec in PATCH_TARGET_SPECS:
        file_offset = pe_virtual_address_to_file_offset(source, spec.virtual_address)
        original = data[file_offset : file_offset + SIGNATURE_LENGTH].hex()
        if original != spec.expected_hex:
            raise ValueError(
                f"{spec.name} signature drift at 0x{spec.virtual_address:08x}: "
                f"expected {spec.expected_hex}, got {original}"
            )
        targets.append(
            RuntimePatchTarget(
                name=spec.name,
                virtual_address=spec.virtual_address,
                file_offset=file_offset,
                original_hex=original,
                role=spec.role,
                patch_strategy=spec.patch_strategy,
                evidence=spec.evidence,
            )
        )
    return tuple(targets)


def build_runtime_patch_target_index(source: Path) -> dict[str, str | list[dict[str, int | str]]]:
    return {
        "source": str(source),
        "purpose": "guarded file-backed instrumentation targets for non-debugger runtime key extraction",
        "targets": [target.to_json() for target in extract_runtime_patch_targets(source)],
        "probePlan": {
            "codeCave": find_runtime_probe_code_cave(source).to_json(),
            "imports": extract_runtime_probe_imports(source),
            "nextStep": "assemble a file-backed keyStore/keyRead logging trampoline guarded by these signatures",
        },
    }


def write_runtime_patch_target_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_runtime_patch_target_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
