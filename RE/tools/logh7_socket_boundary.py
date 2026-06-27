from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image
else:
    from logh7_child_codec import PeImage, _parse_pe_image


JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]
IMAGE_DIRECTORY_ENTRY_IMPORT: Final[int] = 1
PE_DATA_DIRECTORY_OFFSET: Final[int] = 96
IMPORT_DESCRIPTOR_SIZE: Final[int] = 20
CALL_ABSOLUTE_INDIRECT: Final[bytes] = b"\xff\x15"
WS2_32_ORDINALS: Final[dict[int, str]] = {
    3: "closesocket",
    4: "connect",
    7: "getsockopt",
    8: "htonl",
    9: "htons",
    10: "inet_addr",
    11: "inet_ntoa",
    14: "recv",
    15: "recvfrom",
    16: "select",
    19: "send",
    21: "setsockopt",
    22: "shutdown",
    23: "socket",
    52: "gethostbyname",
    111: "WSAGetLastError",
    115: "WSAStartup",
    116: "WSACleanup",
}
RECV_CALLSITE_ROLES: Final[dict[int, str]] = {
    0x00611AA5: "low-level stream receive into connection buffer",
    0x00611BA5: "low-level stream receive into expanded connection buffer",
    0x00611BF6: "low-level stream receive of floating status field",
    0x006454D1: "phase2 inbound raw parameter receive before child-codec decode",
    0x00645992: "phase3 inbound raw parameter receive before child-codec decode",
    0x00645E2B: "phase4 or post-login inbound chunk receive",
}


@dataclass(frozen=True, slots=True)
class WinsockImport:
    dll: str
    ordinal: int
    name: str
    iat: int

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "dll": self.dll,
            "ordinal": self.ordinal,
            "name": self.name,
            "iat": self.iat,
            "iatHex": f"0x{self.iat:08x}",
        }


@dataclass(frozen=True, slots=True)
class SocketCallsite:
    virtual_address: int
    file_offset: int
    original_hex: str
    role: str

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "virtualAddress": self.virtual_address,
            "virtualAddressHex": f"0x{self.virtual_address:08x}",
            "fileOffset": self.file_offset,
            "fileOffsetHex": f"0x{self.file_offset:08x}",
            "originalHex": self.original_hex,
            "role": self.role,
        }


def build_socket_boundary_index(source: Path) -> dict[str, JsonValue]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    imports = _extract_winsock_imports(data, image)
    imports_by_name = {entry.name: entry for entry in imports}
    return {
        "source": str(source),
        "purpose": "socket boundary evidence for LOGH VII packet/schema work",
        "winsockImports": [entry.to_json() for entry in imports],
        "directCallsites": {
            "recv": [
                callsite.to_json()
                for callsite in _direct_iat_callsites(data, image, imports_by_name["recv"], RECV_CALLSITE_ROLES)
            ],
            "send": [callsite.to_json() for callsite in _direct_iat_callsites(data, image, imports_by_name["send"], {})],
            "recvfrom": [
                callsite.to_json() for callsite in _direct_iat_callsites(data, image, imports_by_name["recvfrom"], {})
            ],
        },
        "nextRuntimeProbe": "hook recv callsites 0x006454d1 and 0x00645992 after call return",
    }


def write_socket_boundary_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_socket_boundary_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _extract_winsock_imports(data: bytes, image: PeImage) -> tuple[WinsockImport, ...]:
    descriptor_offset = _rva_to_offset(data, image, _import_directory_rva(data))
    imports: list[WinsockImport] = []
    descriptor_index = 0
    while True:
        original_thunk, _timestamp, _forwarder, name_rva, first_thunk = struct.unpack_from(
            "<IIIII", data, descriptor_offset + descriptor_index * IMPORT_DESCRIPTOR_SIZE
        )
        if original_thunk == 0 and first_thunk == 0:
            break
        dll = _cstring(data, _rva_to_offset(data, image, name_rva))
        if dll.lower() == "ws2_32.dll":
            imports.extend(_extract_winsock_thunks(data, image, dll, original_thunk or first_thunk, first_thunk))
        descriptor_index += 1
    return tuple(imports)


def _extract_winsock_thunks(
    data: bytes, image: PeImage, dll: str, thunk_rva: int, first_thunk: int
) -> list[WinsockImport]:
    imports: list[WinsockImport] = []
    thunk_index = 0
    while True:
        thunk_value = _u32(data, _rva_to_offset(data, image, thunk_rva + thunk_index * 4))
        if thunk_value == 0:
            break
        if thunk_value & 0x80000000:
            ordinal = thunk_value & 0xFFFF
            imports.append(
                WinsockImport(
                    dll=dll,
                    ordinal=ordinal,
                    name=WS2_32_ORDINALS.get(ordinal, f"ordinal_{ordinal}"),
                    iat=image.image_base + first_thunk + thunk_index * 4,
                )
            )
        thunk_index += 1
    return imports


def _direct_iat_callsites(
    data: bytes, image: PeImage, imported: WinsockImport, role_by_va: dict[int, str]
) -> tuple[SocketCallsite, ...]:
    needle = CALL_ABSOLUTE_INDIRECT + struct.pack("<I", imported.iat)
    callsites: list[SocketCallsite] = []
    search_offset = 0
    while True:
        file_offset = data.find(needle, search_offset)
        if file_offset < 0:
            break
        virtual_address = image.image_base + file_offset
        callsites.append(
            SocketCallsite(
                virtual_address=virtual_address,
                file_offset=file_offset,
                original_hex=data[file_offset : file_offset + 16].hex(),
                role=role_by_va.get(virtual_address, "unclassified direct winsock callsite"),
            )
        )
        search_offset = file_offset + 1
    return tuple(callsites)


def _import_directory_rva(data: bytes) -> int:
    pe_offset = _u32(data, 0x3C)
    optional_header = pe_offset + 24
    directory = optional_header + PE_DATA_DIRECTORY_OFFSET + IMAGE_DIRECTORY_ENTRY_IMPORT * 8
    return _u32(data, directory)


def _rva_to_offset(data: bytes, image: PeImage, rva: int) -> int:
    for section in image.sections:
        section_size = max(section.virtual_size, section.raw_size)
        if section.virtual_address <= rva < section.virtual_address + section_size:
            return section.raw_pointer + (rva - section.virtual_address)
    raise ValueError(f"RVA is not mapped in PE sections: 0x{rva:08x}")


def _cstring(data: bytes, offset: int) -> str:
    return data[offset : data.index(0, offset)].decode("ascii")


def _u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]
