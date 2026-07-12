# 0x032a / 0x032b 와이어 계약 — Request/ResponseInformationOutfit (旗艦情報·편성정보, 정본 EXE RE)

**대상:** `artifacts/logh7-install/…/exe/g7mtclient.exe` (sha256 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51`)
**근거:** Ghidra 디컴파일 `.omo/ghidra/export/decompiled/g7mtclient.exe_decompiled.c` (프로젝트 `G7canon` = 정본 임포트)
**작성:** 2026-07-11, re-analyst (RE only, 서버 미수정)

---

## 결론 요약 (server-dev 먼저 읽을 것)

1. **0x032a는 응답 대기형 요청, 기대 응답 = 0x032b** (셀렉터 FUN_004b78a0 case 0x17, `iVar1=0x32a / iVar5=0x32b`). fire-and-forget 아님. 응답 없으면 클라가 재시도(라이브 3회 관측).
2. **서버가 보낼 것: 0x032b ResponseInformationOutfit, 바디 정확히 2804바이트(0xaf4) 고정.**
3. **0x0f07과 달리 내용이 실제로 소비된다.** 0x0f06처럼 zero-fill로 "창을 띄우기만" 할 수는 **없다** — 바디 첫 바이트(count)가 0이면 클라가 outfit 표시 함수를 호출하지 않아 창이 비거나 안 뜬다. **count≥1 + 최소 레코드 1개**가 필요.
4. **레이아웃 확정(HIGH):** `[u8 count @0x00][pad 3B][record[i] @0x04+i*0x1c, 각 28바이트, ≤100개]`. 필드는 §2 표. 덤프함수 FUN_0041c330으로 오프셋 전수 확정.
5. **엔디안: BE 권장(패밀리 일관성).** 서버가 이미 정상 렌더하는 형제 0x0323/0x0325와 같은 packed BE로 보내라. 단, 0x32b 전용 swap 사이트는 이번 패스에서 독립 확인 못 함 → 라이브에서 숫자(id/연성치)로 최종 검증. (§3)
6. **요청 바디 `032a0100000100`:** code 0x032a(BE) + 5바이트 `01 00 00 01 00`. **필드 의미는 unknown — 빌더가 코드에 안 잡힘, 날조 금지.** 단일 자기소속 조회이므로 서버는 요청 필드를 파싱하지 않고 플레이어 자기 outfit을 돌려줘도 창이 뜬다(§4).

---

## 1. 요청/응답 코드쌍과 함수 주소 (전부 정본 EXE 기준)

| 항목 | 값 | 함수 / VA | 증거 |
|---|---|---|---|
| 요청 (C→S) | `0x032a` RequestInformationOutfit | 셀렉터 `FUN_004b78a0` @ **0x004b78a0**, `case 0x17` | L36166-36170: `iVar5 = 0x32b; iVar1 = 0x32a;` |
| 기대 응답 (S→C) | `0x032b` ResponseInformationOutfit | 위 셀렉터 `iVar5=0x32b` | 동상 |
| 응답 수신 사이저 | 바디 **0xaf4 = 2804바이트 고정** | `FUN_004b8b00` @ **0x004b8b00**, `case 0x32b` | L37200-37203: `*param_4 = 0xaf4; *param_3 = 0;` (`*param_3=0` = 가변 아님) |
| 응답 소비자(디스패처) | 2804B를 client+0x3dfe98에 flat 복사, count 검사, 표시 | `FUN_004ba2b0` `case 0x32b` @ 디스패처 내부 | L38720-38733 |
| 표시/저장 핸들러 | count==1이면 element[0](28B)를 게임상태 저장 | `FUN_004c31f0` @ **0x004c31f0** | L38730-38732 호출; L45490-45499 param_1==1 경로 |
| 레이아웃 근거(덤프) | 버퍼 오프셋 전수 라벨 | `FUN_0041c330` @ **0x0041c330** | L5699-5745 |

인접 형제(교차검증, 같은 셀렉터·같은 패턴): case 0x16 → 0x326 req / 0x327 resp, 0x328 req / 0x329 resp(Package), case 0x18 → 0x336/0x337. 전부 `iVar1(req)/iVar5(resp)` 쌍.

---

## 2. 응답 0x032b 바이트 레이아웃 (버퍼 = client+0x3dfe98, 2804B 고정)

**컨테이너:**

| off | 크기 | 타입 | 의미 | 근거 |
|---|---|---|---|---|
| 0x0000 | 1 | u8 | **count** (outfit 레코드 수, ≤100) | FUN_0041c330 L5700/5745 `*param_1`; 소비자 L38730 `buf[0]==1` 검사 |
| 0x0001 | 3 | pad | 정렬 패딩 (레코드가 0x04부터 시작) | element[0] = param_1+4 (FUN_0041c330 `pbVar1=param_1+8`, id=`*(pbVar1-4)`=param_1+4) |
| 0x0004 + i*0x1c | 28 | record | element[i], i=0..count-1 | stride 0x1c 확정 (L5744 `pbVar1 += 0x1c`) |

**레코드(element, 28바이트, offset은 element 기준):**

| off | 크기 | 타입 | 필드 | 근거(FUN_0041c330) |
|---|---|---|---|---|
| 0x00 | 4 | u32 | id (outfit id) | L5707 `*(u4)(pbVar1-4)` |
| 0x04 | 1 | u8 | kind (種別) | L5709 `*pbVar1` `s_kind_` |
| 0x05 | 1 | u8 | power (陣営) | L5712 `pbVar1[1]` `s_power_` |
| 0x06 | 1 | u8 | camp | L5714 `pbVar1[2]` `s_camp_` |
| 0x07 | 1 | u8 | index | L5717 `pbVar1[3]` `s_index_` |
| 0x08 | 2 | u16 | achievement (戦功) | L5719 `*(u2)(pbVar1+4)` `s_achievement_` |
| 0x0a | 2 | pad | — (0x0c 정렬) | strategy_id가 pbVar1+8=element+0x0c |
| 0x0c | 4 | u32 | strategy_id | L5721 `*(u4)(pbVar1+8)` `s_strategy_id_` |
| 0x10 | 1 | u8 | practice_warp | L5723 `pbVar1[0xc]` |
| 0x11 | 1 | u8 | practice_speed | L5725 `pbVar1[0xd]` |
| 0x12 | 1 | u8 | practice_command | L5727 `pbVar1[0xe]` |
| 0x13 | 1 | u8 | practice_offence | L5729 `pbVar1[0xf]` |
| 0x14 | 1 | u8 | practice_defence | L5731 `pbVar1[0x10]` |
| 0x15 | 1 | u8 | practice_antiaircraft | L5733 `pbVar1[0x11]` |
| 0x16 | 1 | u8 | practice_search | L5735 `pbVar1[0x12]` |
| 0x17 | 1 | u8 | practice_deception | L5737 `pbVar1[0x13]` |
| 0x18 | 1 | u8 | practice_landbattle | L5739 `pbVar1[0x14]` |
| 0x19 | 1 | u8 | practice_airbattle | L5741 `pbVar1[0x15]` |
| 0x1a | 2 | pad | — (stride 0x1c 채움) | 마지막 읽기 pbVar1[0x15]=element+0x19, 다음 stride 0x1c |

practice_* 10종 = 함대 훈련 연성치(내정 화면). 저장 위치 client+0x3dfe98(전체 테이블), element[0]은 추가로 게임상태 client+0x81e80에 복사(FUN_004c31f0).

---

## 3. 엔디안 — BE 권장, 단 독립 pin 실패

- 소비자(case 0x32b)는 바디를 **swap 없이 flat dword 복사**하고, 덤프/표시는 native(LE)로 읽는다(FUN_0041c330의 `*(u4)`/`*(u2)` native 리드). 즉 **버퍼 도달 시점에 이미 native 정렬이어야** id/achievement/strategy_id가 옳게 표시된다.
- 이 프로젝트에서 0x03xx는 packed BIG-ENDIAN 규약이고, 서버가 이미 그 규약으로 보내는 형제 **0x0323(캐릭터)·0x0325(유닛테이블)가 라이브에서 정상 렌더**된다 → 메시지 계층이 0x03xx 바디를 일괄 BE→native 변환하는 것으로 강하게 시사. 따라서 **0x032b도 형제와 동일하게 packed BE로 보내라**(서버 기존 빌더 관례 그대로).
- **미확정(정직):** 0x032b 전용 BE→native swap 사이트를 이번 패스에서 코드로 직접 짚지 못했다(0x031d는 FUN_004142e0 스트림 확장에서 swap하지만 0x032b는 그런 확장 파서를 안 거치는 flat 경로). BE가 형제 일관성으로 최유력이나, 값이 틀리면 LE로 폴백. **최종 판정 = 라이브: 팝업의 id/연성치 숫자가 서버 seed 값과 일치하는지.**

---

## 4. 요청 0x032a 바디 — 필드 미해결(날조 금지)

- 라이브 실측: `03 2a 01 00 00 01 00`. code=0x032a(BE 2B) + 바디 5B = `01 00 00 01 00`.
- **필드 의미 unknown.** 셀렉터 case 0x17은 코드만 세팅하고 바디(param_3)는 상위 UI 클릭 핸들러가 만든다. 그 5바이트 빌더는 immediate `0x032a`가 코드에 단독으로 안 잡혀(디컴파일상 0x32a 리터럴은 전부 무관한 배열 stride 810) 이번 패스에서 구조 확정 불가. byte0=0x01이 type/scope 후보(형제 요청의 관례)이나 나머지 4B는 추측 금지.
- **서버 구현 함의:** 이 팝업은 플레이어 자기소속 outfit 조회다. 서버는 요청 5바이트를 엄밀히 파싱하지 않고 **플레이어 자신의 outfit(들)로 0x032b를 응답해도 창이 뜬다** — 응답 count≥1 + element가 유효하면 표시 함수가 호출된다. 요청 필드 해석은 다중 함대 선택/필터가 필요할 때 추가 RE.

---

## 5. 서버가 보낼 바이트 스펙 (server-dev 즉시 구현용)

- **응답 코드:** `0x032b`
- **바디 길이:** 정확히 **2804바이트(0xaf4)** 고정. (사이저 강제 — 어긋나면 프레이밍 깨짐.)
- **레이아웃:**
  - `@0x0000 u8 count` = 반환 outfit 수(자기소속 팝업이면 보통 1). **0이면 안 됨**(창 안 뜸).
  - `@0x0001..0x0003` = 0 패딩.
  - `@0x0004 + i*0x1c` = element[i], §2 표대로 채움. 미사용 슬롯은 0.
- **엔디안:** 형제 0x0323/0x0325와 동일 **packed BE** (서버 기존 관례). 값 안 맞으면 LE 폴백 후 라이브 재검.
- **프레이밍:** 다른 0x03xx inner 응답과 동일 message32. `WORLD_RESPONSE_OBJECT_SIZES[0x032b]`가 0xaf4인지 확인(형제 테이블과 일치해야).
- **송신 시점:** 클라 0x032a 수신 즉시 1회.

## 6. 검증 체크리스트

1. 0x032a 수신 → 0x032b(2804B, count=1, element[0]=플레이어 outfit, BE) 응답 배선.
2. 라이브: 각종정보 팝업 旗艦情報 클릭 → 창이 뜨고 id/연성치가 seed 값과 일치하는지. (재시도 로그 소멸 확인.)
3. 숫자가 뒤집혀 보이면 엔디안 LE로 폴백 재검(§3).
