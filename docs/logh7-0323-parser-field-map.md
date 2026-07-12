# 0x0323 ResponseInformationCharacter — 파서 필드 맵 (정본 EXE 실바이트 확정)

대상: `artifacts/logh7-install/…/exe/g7mtclient.exe`
sha256 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51`
분석: 정본 EXE 실바이트 디스어셈블(capstone x86-32, ImageBase 0x400000). Ghidra -sjis 덤프는 주소 드리프트로 미사용.

## 결론 (서버가 알아야 할 한 줄)

char struct@0x24 (조인 키 = flagship, 클라가 unit.id와 대조하는 값)는 **wire(payload) 오프셋 0x20에서 U32/BE로 읽힌다.** 서버는 flagship(unit id=1)을 **wire@0x20에 big-endian U32로** 써야 struct@0x24에 안착한다. wire@0x24가 아니다.

이유: 파서는 **고정 오프셋 복사가 아니라 순차 스트림 리더**다. char struct에는 2군데 정렬 패딩(struct 0x0e–0x0f, struct 0x16–0x17)이 있지만 wire는 완전 패킹이라, struct@0x10 이후로 wire=struct−2, 2바이트 필드(struct@0x14) 이후로 **wire=struct−4** 로 어긋난다. 그래서 struct@0x24 → wire@0x20.

## 파서 구조 (FUN_00417390 @ 0x417390)

- 이 함수는 메시지 레코드 디스크립터의 vtable slot0(주소 테이블 `0x66c518`에 등재). slot1(0x417f20)은 동일 struct를 채우는 CSV/텍스트 로더 — **필드 논리 폭의 정본 근거**(atoi=0x5ff09b, 구분자 0x2c).
- 인자: `esi` = 스트림 리더 객체(vtable 보유), `edi` = 목적지 char struct.
- 리더는 순차 커서. 각 필드를 vtable 메서드 또는 헬퍼로 순서대로 소비하며 커서 전진. 정본 wireEndian=BE(앵커: id@0x00=1이 struct@0x00에 정확 안착).

리더 소비 폭:
- `call [vtable+0x1c]` → U32 (4바이트). BE 스왑.
- `call [vtable+0x20]` → U16 (2바이트). struct@0x14 전용.
- `call [vtable+0x24]` → 가변 길이 문자열(이름). struct@0x28.
- 헬퍼 `0x610420(dst, len=1, 0, 2)` → len바이트(=1) 복사 후 커서 +len. byte 필드용.

## 필드 맵 (wire offset → struct offset)

| # | 콜사이트 VA | 리더 | 폭 | wire off | struct off | 필드 | 근거(CSV 로더 store) |
|---|---|---|---|---|---|---|---|
| 1 | 0x4173c2 | +0x1c | U32 | 0x00 | 0x00 | id | `mov [ebx],eax` @0x417f6e |
| 2 | 0x4173d2 | helper | u8 | 0x04 | 0x04 | | `mov [ebx+4],al` @0x417f90 |
| 3 | 0x4173e2 | helper | u8 | 0x05 | 0x05 | | `[ebx+5]` @0x417fb3 |
| 4 | 0x4173f2 | helper | u8 | 0x06 | 0x06 | | `[ebx+6]` @0x417fd6 |
| 5 | 0x417402 | helper | u8 | 0x07 | 0x07 | | `[ebx+7]` @0x417ff9 |
| 6 | 0x41740f | +0x1c | U32 | 0x08 | 0x08 | | `[ebx+8]` @0x41801c |
| 7 | 0x41741d | helper | u8 | 0x0c | 0x0c | | `[ebx+0xc]` @0x41803f |
| 8 | 0x41742d | helper | u8 | 0x0d | 0x0d | | `[ebx+0xd]` @0x418062 |
| 9 | 0x41743a | +0x1c | U32 | **0x0e** | 0x10 | | `[ebx+0x10]` @0x418085 |
| 10 | 0x417445 | +0x20 | **U16** | **0x12** | 0x14 | (2바이트 필드) | `word [ebx+0x14],ax` @0x4180a8 |
| 11 | 0x417450 | +0x1c | U32 | **0x14** | 0x18 | | `[ebx+0x18]` @0x4180cc |
| 12 | 0x41745b | +0x1c | U32 | **0x18** | 0x1c | | `[ebx+0x1c]` @0x4180ef |
| 13 | 0x417466 | +0x1c | U32 | **0x1c** | 0x20 | spot | `[ebx+0x20]` @0x418112 |
| 14 | **0x417471** | +0x1c | U32 | **0x20** | **0x24** | **flagship (조인 키)** | `[ebx+0x24]` @0x418135 |
| 15 | 0x41747c | +0x24 | str | 0x24~ | 0x28 | name (가변) | `[ebx+0x28]` @0x41815b |

패딩 누적:
- struct 0x0e–0x0f: byte@0x0d 뒤 U32@0x10 정렬 패딩 2바이트 → 여기서부터 wire=struct−2.
- struct 0x16–0x17: U16@0x14 뒤 U32@0x18 정렬 패딩 2바이트 → 여기서부터 **wire=struct−4**.

name(struct@0x28, wire@0x24~)은 가변 길이(첫 바이트가 길이/타입, 파서 `cmp al,0xd` @0x417484). flagship은 name 앞이라 wire@0x20 고정 — 이름 길이와 무관.

## 라이브 실측과의 정합

- **런1**(charstage-20260711-171320): 서버 wire@0x1c=1(spot), @0x20=0, @0x24=1(flagship). 맵 예측 struct@0x20 ← wire@0x1c=1, struct@0x24 ← wire@0x20=0. 실측 struct@0x20=1, @0x24=0. **완전 일치.** → 런1 빌더는 flagship을 한 필드 늦게(wire@0x24) 놓아 struct@0x24가 wire@0x20(=0)을 읽음. 고칠 것은 flagship을 wire@0x20으로 이동.
- **런2**(charstage-fs7-20260711-171801): 서버 wire@0x18=1(spot), @0x1c=0, @0x20=1(flagship). 맵 예측 struct@0x24 ← wire@0x20=1(정답이어야 함)이나 실측 struct@0x24=0. → 런2 빌더가 flagship 위치는 맞췄지만 앞쪽 필드에서 4바이트를 과다 방출(정렬 패딩을 wire에 실은 것으로 추정)해 커서가 +4 밀림. 즉 **flagship만 옮긴 게 아니라 앞 필드 패킹까지 어긋남.**

두 런 모두 정본 파서 맵으로 설명됨. 필요한 것은 flagship=wire@0x20 **그리고** 앞선 모든 필드의 정확한 패킹(특히 struct@0x14 = 2바이트, 4바이트 아님).

## 서버 빌더 수정 지침 (buildInformationCharacterInner)

wire를 struct 오프셋 그대로 복사하면 안 됨(패딩 때문에 4바이트 밀림). 아래 패킹으로 방출:

```
wire 0x00  U32 BE  id
wire 0x04  u8 x4   (@0x04..0x07)
wire 0x08  U32 BE  (@0x08)
wire 0x0c  u8 x2   (@0x0c,0x0d)
wire 0x0e  U32 BE  (@0x10)
wire 0x12  U16 BE  (@0x14)  ← 반드시 2바이트. 여기가 정렬 분기점.
wire 0x14  U32 BE  (@0x18)
wire 0x18  U32 BE  (@0x1c)
wire 0x1c  U32 BE  (@0x20)  spot
wire 0x20  U32 BE  (@0x24)  flagship = unit id   ← 조인 키
wire 0x24~ name(가변, 첫 바이트 길이/타입)
```

조인 확정 근거: char.flagship(struct@0x24)을 unit.id(unit struct@0x00)와 대조하는 로직이 존재(팀 확정). flagship에 unit id(=1)가 들어가야 char↔unit 조인 성립.
