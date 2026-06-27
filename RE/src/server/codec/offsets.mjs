/**
 * [L2 코덱 레이어] 공유 와이어 레이아웃 단일 지점 — RE 확정 오프셋/stride/size/cap 상수.
 *
 * Phase A2 첫 코호트: 가장 자립적인 "0x32x 기지관리(基地管理)" 레코드 패밀리의 바이트 레이아웃 상수를
 * 한 곳에 모은다. 값/주석은 원래 모듈(logh7-institution-record.mjs / logh7-warehouse-record.mjs)에서
 * "기능 무변경"으로 이동한 것이며 바이트 1개도 바뀌지 않았다. 캐논 일본어 용어·Ghidra 함수 오프셋·
 * 신뢰도 태그([HIGH] 등)는 그대로 보존한다.
 *
 * 원래 모듈들은 이 파일의 상수를 import 해서 다시 re-export 하므로 기존 import 경로는 100% 유지된다.
 *
 * 포함 패밀리:
 *   - ResponseInformationBase        (0x031f) — 防衛/開発/補給/予算 base 방어·개발 패널 (RIB_*)
 *   - ResponseInformationInstitution (0x0321) — 施設 facilities 패널 (RII_*)
 *   - ResponseInformationWarehouse   (0x0327) — 보급창고 stockpile (RW_*)
 *   - ResponseInformationPackage     (0x0329) — 수송 transfer 매니페스트 (RP_*)
 */

// ===================================================================================================
// BASE 0x031f — 防衛/開発/補給/予算 (基地管理 패널의 defense/development/ownership 절반; 0x0337 economy의 자매).
// CODE [HIGH] (dispatcher FUN_004ba2b0 case 799 = 0x031f). SIZE [HIGH] (디스패처가 고정 0x181 dwords =
// 0x604 = 1540 bytes 복사; world-import FUN_004c32a0 + parser FUN_00414c70 stride 0x180 일치).
//
// 신뢰도 정책: 바이트 LAYOUT/오프셋/타입/배열 cap = P0 (클라 파서가 핀). NAME↔offset 매핑은 다섯 배열만
// 고유 크기([30]/[30]/[6]/[5]/[3])로 HIGH 교차매핑; 스칼라 이름은 PROVISIONAL(서버측 라벨드 직렬화기
// 절대오프셋 미해결). 상세 per-field 주석은 codec/base-record.mjs JSDoc 참조.
// ===================================================================================================
export const RESP_INFO_BASE_CODE = 0x031f; // dispatcher FUN_004ba2b0 case 799 [HIGH]
export const RESP_INFO_BASE_ELEM_BYTES = 0x180; // 384 = element stride (parser iVar16*0x180) [HIGH]
export const RESP_INFO_BASE_MAX = 4; // max 4 elements (error: information_size over than 4) [HIGH]
// Fixed body: the dispatcher ALWAYS copies 0x181 dwords, so the body is count-dword + 4 element slots.
export const RESP_INFO_BASE_BYTES = 4 + RESP_INFO_BASE_MAX * RESP_INFO_BASE_ELEM_BYTES; // 0x604 = 1540 [HIGH]

// ---- Body-level offsets (LE; into inner.subarray(6)) -----------------------------------------------
export const RIB_OFF_COUNT = 0x00; // u8 count occupying a u32 slot (dispatcher copies dwords) [HIGH]
export const RIB_OFF_ELEM0 = 0x04; // element[0] base (world-import reads +0x3facf8 = body+4) [HIGH]

// ---- Element-internal offsets (relative to an element base; LE) ------------------------------------
// All HIGH-confidence byte offsets (parser FUN_00414c70 / world-import FUN_004c32a0). Names below the
// five mapped arrays are PROVISIONAL (RE-pinned offset, label not absolutely resolvable). The full raw
// pin list (docs/logh7-info-records-wire.md §2 "Raw parser offsets") is reproduced as constants so a
// future doc revision can rename without moving bytes.
export const RIB_ELEM_OFF_ID = 0x00; //         u32 id / match key (world-import *puVar7 == uVar12) [HIGH name=id]
export const RIB_ELEM_OFF_FIELD_04 = 0x04; //   u8 owner/state candidate (world-import local_34d) [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_08 = 0x08; //   u32 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_09 = 0x05; //   u8 second owner/state candidate (world-import local_34e) [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_0C = 0x0c; //   u32 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_10 = 0x10; //   float [PROVISIONAL] (availability_ratio candidate)
export const RIB_ELEM_OFF_FIELD_14 = 0x14; //   u32 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_18 = 0x18; //   u32 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_1C = 0x1c; //   u8 cnt → transport_supplies (parser cap 0x1e) [HIGH]
export const RIB_ELEM_OFF_TRANSPORT_CNT = 0x1c; // u8 cnt → transport_supplies (parser cap 0x1e) [HIGH]
export const RIB_ELEM_OFF_TRANSPORT = 0x20; //     u32[≤30] transport_supplies (unique [30], listed first) [HIGH]
export const RIB_ELEM_OFF_OUTFIT_CNT = 0x98; //   u8 cnt → outfit_supplies (parser cap 0x1e) [HIGH]
export const RIB_ELEM_OFF_OUTFIT = 0x9c; //       u32[≤30] outfit_supplies (unique [30], listed second) [HIGH]
export const RIB_ELEM_OFF_FIELD_118 = 0x114; //   u32 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_11C = 0x118; //   u32 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_120 = 0x11c; //   u32 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_124 = 0x120; //   u32 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_128 = 0x124; //   u32 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_12C = 0x128; //   u16 [PROVISIONAL]
export const RIB_ELEM_OFF_BUDGETING_CNT = 0x12a; // u8 cnt → budgeting (parser cap 6) [HIGH]
export const RIB_ELEM_OFF_BUDGETING = 0x12c; //   u16[≤6] budgeting (unique [6] u16) [HIGH]
export const RIB_ELEM_OFF_BUDGET_CNT = 0x138; //  u8 cnt → budget (parser cap 5) [HIGH]
export const RIB_ELEM_OFF_BUDGET = 0x13c; //      u32[≤5] budget (unique [5]) [HIGH]
export const RIB_ELEM_OFF_FIELD_154 = 0x150; //   u16 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_156 = 0x152; //   u16 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_158 = 0x154; //   u16 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_15A = 0x156; //   u16 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_15C = 0x158; //   u32 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_160 = 0x15c; //   u32 [PROVISIONAL]
export const RIB_ELEM_OFF_COMMODITY_CNT = 0x160; // u8 cnt → commodity (parser cap 3) [HIGH]
export const RIB_ELEM_OFF_COMMODITY = 0x164; //   u32[≤3] commodity (unique [3]) [HIGH]
export const RIB_ELEM_OFF_FIELD_174 = 0x170; //   float [PROVISIONAL] (price_index candidate)
export const RIB_ELEM_OFF_FIELD_178 = 0x174; //   u8  [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_179 = 0x175; //   u8  [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_17A = 0x176; //   u16 [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_17B = 0x178; //   u8  [PROVISIONAL]
export const RIB_ELEM_OFF_FIELD_17C = 0x17c; //   u32 [PROVISIONAL] (element body ends; +0x180 = next element's id)

// ---- Array caps (parser FUN_00414c70 guards) -------------------------------------------------------
export const RIB_TRANSPORT_MAX = 30; // parser `if (0x1e < cnt)` @+0x1c [HIGH]
export const RIB_OUTFIT_MAX = 30; //    parser `if (0x1e < cnt)` @+0x98 [HIGH]
export const RIB_BUDGETING_MAX = 6; //  parser `if (6 < cnt)` @+0x12a [HIGH]
export const RIB_BUDGET_MAX = 5; //     parser `if (5 < cnt)` @+0x138 [HIGH]
export const RIB_COMMODITY_MAX = 3; //  parser `if (3 < cnt)` @+0x160 [HIGH]

// ===================================================================================================
// INSTITUTION 0x0321 — 施設 facilities. CODE [HIGH] (dispatcher FUN_004ba2b0 case 0x321). SIZE/STRIDE/CAP
// [HIGH] (parsers FUN_004167f0/FUN_00416bd0 + world-import FUN_004c4170 + over-limit error strings 일치).
// ===================================================================================================
export const RESP_INFO_INSTITUTION_CODE = 0x0321; // dispatcher FUN_004ba2b0 case 0x321 [HIGH]

// 외부(ResponseInformationInstitution) element: id(u32) + inst_count(u8) + 36 institutions. 디스패처가
// 고정 0x2379 dwords(= 0x8DE4 = 36324 bytes)를 복사하므로 body = count + 4 element 슬롯.
export const RESP_INFO_INSTITUTION_ELEM_BYTES = 0x2378; // 9080 = outer element stride (parser pbVar9+0x2378) [HIGH]
export const RESP_INFO_INSTITUTION_MAX = 4; // max 4 elements (error: information_size over than 4; guard bVar1<5) [HIGH]
export const RESP_INFO_INSTITUTION_BYTES = 4 + RESP_INFO_INSTITUTION_MAX * RESP_INFO_INSTITUTION_ELEM_BYTES; // 0x8DE4 = 36324 [HIGH]

// Institution 서브레코드(외부 element 내부): field00(u16) + field04(u32) + spot_count(u8) + 20 spots.
export const RESP_INFO_INSTITUTION_INST_ELEM_BYTES = 0xfc; // 252 = institution stride (parser pbVar14+0xfc) [HIGH]
export const RESP_INFO_INSTITUTION_INST_MAX = 36; // max 36 institutions (error: institution_size over than 36; guard 0x24<cnt) [HIGH]

// Spot 서브레코드(institution 내부): field00(u16) + field04(u32) + field08(u16).
export const RESP_INFO_INSTITUTION_SPOT_ELEM_BYTES = 0xc; // 12 = spot stride (parser index *0xc) [HIGH]
export const RESP_INFO_INSTITUTION_SPOT_MAX = 20; // max 20 spots (error: spot_size over than 20; guard 0x14<cnt) [HIGH]

// ---- Body-level offsets (LE; into inner.subarray(6)) -----------------------------------------------
export const RII_OFF_COUNT = 0x00; // u8 count occupying a u32 slot (dispatcher copies dwords) [HIGH]
export const RII_OFF_ELEM0 = 0x04; // element[0] base (parser param_1+8 reads E-4 = body+4 as id) [HIGH]

// ---- Outer element offsets (relative to element base B) --------------------------------------------
export const RII_ELEM_OFF_ID = 0x00; //         u32 id / base spot-id (serializer label `base=`) [HIGH offset; name MEDIUM]
export const RII_ELEM_OFF_INST_CNT = 0x04; //   u8  institution count (parser guard ≤36) [HIGH]
export const RII_ELEM_OFF_INST0 = 0x08; //      institution[0] base (stride 0xfc) [HIGH]

// ---- Institution sub-record offsets (relative to institution base J) -------------------------------
export const RII_INST_OFF_FIELD_00 = 0x00; //   u16 (parser I-0x08, NAMELESS) [HIGH offset/type; PROVISIONAL name]
export const RII_INST_OFF_FIELD_04 = 0x04; //   u32 (parser I-0x04, NAMELESS) [HIGH offset/type; PROVISIONAL name]
export const RII_INST_OFF_SPOT_CNT = 0x08; //   u8  spot count (parser guard ≤20) [HIGH]
export const RII_INST_OFF_SPOT0 = 0x0c; //      spot[0] base (stride 0xc, serializer label `spot[%d]={`) [HIGH]

// ---- Spot sub-record offsets (relative to spot base S) ---------------------------------------------
export const RII_SPOT_OFF_FIELD_00 = 0x00; //   u16 (parser L154/L114, NAMELESS) [HIGH offset/type; PROVISIONAL name]
export const RII_SPOT_OFF_FIELD_04 = 0x04; //   u32 (parser L165/L124, NAMELESS) [HIGH offset/type; PROVISIONAL name]
export const RII_SPOT_OFF_FIELD_08 = 0x08; //   u16 (parser L174,      NAMELESS) [HIGH offset/type; PROVISIONAL name]

// ===================================================================================================
// WAREHOUSE 0x0327 — 보급창고 stockpile. ALL [HIGH] (dispatcher copies 0xc0 dwords = 0x300; parser
// FUN_0041a870 + dump serializer FUN_0041aff0 일치).
// ===================================================================================================
export const RESP_INFO_WAREHOUSE_CODE = 0x0327; // dispatcher FUN_004ba2b0 case 0x327 [HIGH]
export const RESP_INFO_WAREHOUSE_BYTES = 0x300; // fixed body = 0xc0 dwords copied = 768B [HIGH]

// ---- Warehouse body offsets (LE; into inner.subarray(6)). All parser FUN_0041a870 / dump FUN_0041aff0. --
export const RW_OFF_BASE = 0x00; //   u32 base   (s_base_,   param_1[0]) [HIGH]
export const RW_OFF_OUTFIT = 0x04; // u32 outfit (s_outfit_, param_1[1]) [HIGH]
export const RW_OFF_INDEX = 0x08; //  u32 index  (s_index_,  param_1[2]) [HIGH]

export const RW_OFF_SHIPS_CNT = 0x0c; // u8 ships_count (parser guard < 100) [HIGH]
export const RW_OFF_SHIPS0 = 0x0e; //   ships[0] base — parser reads kind at cursor(0x10)-2 = 0x0e [HIGH]
export const RW_SHIP_STRIDE = 6; //     ships[] stride (parser iVar6 += 6) [HIGH]
export const RW_SHIP_OFF_KIND = 0x00; //        u16 kind        @ entry+0 [HIGH]
export const RW_SHIP_OFF_UNIT_NUMBER = 0x02; // u8  unit_number @ entry+2 [HIGH]
export const RW_SHIP_OFF_BOAT_NUMBER = 0x04; // u16 boat_number @ entry+4 [HIGH]
export const RESP_INFO_WAREHOUSE_SHIPS_MAX = 99; // parser `if (bVar3 < 100)` [HIGH]

export const RW_OFF_TROOPS_CNT = 0x260; // u8 troops_count (param_1[0x98]; parser guard < 0x19) [HIGH]
export const RW_OFF_TROOPS0 = 0x262; //   troops[0] base — parser reads kind at cursor(0x264)-2 = 0x262 [HIGH]
export const RW_TROOP_STRIDE = 6; //      troops[] stride (parser iVar6 += 6) [HIGH]
export const RW_TROOP_OFF_KIND = 0x00; //        u16 kind        @ entry+0 [HIGH]
export const RW_TROOP_OFF_TROOP_GRADE = 0x02; // u8  troop_grade @ entry+2 [HIGH]
export const RW_TROOP_OFF_UNIT_NUMBER = 0x04; // u16 unit_number @ entry+4 [HIGH]
export const RESP_INFO_WAREHOUSE_TROOPS_MAX = 24; // parser `if (bVar3 < 0x19)` [HIGH]

export const RW_OFF_SUPPLIES = 0x2f4; // u32 supplies (s_supplies_, param_1[0xbd] = byte 0x2f4) [HIGH]
export const RW_OFF_FOOD = 0x2f8; //     u32 food     (s_food_,     param_1[0xbe] = byte 0x2f8) [HIGH]
export const RW_OFF_MINERAL = 0x2fc; //  u32 mineral  (s_mineral_,  param_1[0xbf] = byte 0x2fc; ends 0x300) [HIGH]

// ===================================================================================================
// PACKAGE 0x0329 — 수송 transfer 매니페스트. ALL [HIGH] (dispatcher copies 0x55 dwords = 0x154; parser
// FUN_0041b280 + dump serializer FUN_0041b990 일치).
// ===================================================================================================
export const RESP_INFO_PACKAGE_CODE = 0x0329; // dispatcher FUN_004ba2b0 case 0x329 [HIGH]
export const RESP_INFO_PACKAGE_BYTES = 0x154; // fixed body = 0x55 dwords copied = 340B [HIGH]

// ---- Package body offsets (LE). All parser FUN_0041b280 / dump FUN_0041b990. ----------------------
export const RP_OFF_BASE = 0x00; //        u32 base        (s_base_) [HIGH]
export const RP_OFF_TARGET_BASE = 0x04; // u32 target_base (s_target_base_) [HIGH]

export const RP_OFF_OTHER_CNT = 0x08; // u8 other_package_count (param_1[2]; parser guard < 4) [HIGH]
export const RP_OFF_OTHER0 = 0x0c; //   other_package[0] base — parser reads kind at cursor(0xe)-2 = 0x0c [HIGH]
export const RP_PKG_STRIDE = 12; //     package entry stride 0xc (parser puVar6 += 0xc) [HIGH]
export const RP_PKG_OFF_KIND = 0x00; //           u8  kind           @ entry+0 [HIGH]
export const RP_PKG_OFF_UNIT_KIND = 0x02; //      u16 unit_kind      @ entry+2 [HIGH]
export const RP_PKG_OFF_TROOP_GRADE = 0x04; //    u8  troop_grade    @ entry+4 [HIGH]
export const RP_PKG_OFF_PACKAGE_NUMBER = 0x08; // u32 package_number @ entry+8 [HIGH]
export const RESP_INFO_PACKAGE_OTHER_MAX = 3; // parser `if (bVar3 < 4)` [HIGH]

export const RP_OFF_TROOP_CNT = 0x30; // u8 troop_package_count (param_1[0xc]; parser guard < 0x19) [HIGH]
export const RP_OFF_TROOP0 = 0x34; //   troop_package[0] base — parser reads kind at cursor(0x36)-2 = 0x34 [HIGH]
export const RESP_INFO_PACKAGE_TROOP_MAX = 24; // parser `if (bVar3 < 0x19)` [HIGH]
