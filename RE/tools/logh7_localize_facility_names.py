#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""시설 내 장소/집무실 이름 한글 번역 batch 생성.

입력: content/client/msgdat.json (constmsg.dat records)
출력: content/localization/constmsg-ko.json 에 facility 이름 추가
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MSGDAT_PATH = ROOT / "content" / "client" / "msgdat.json"
KO_PATH = ROOT / "content" / "localization" / "constmsg-ko.json"

# ID 범위: 시설 내 장소/상태 (planet-duty survey)
ID_START = 2329
ID_END = 2417

# --- 번역 매핑 ---
# 우선순위: 구체적 문자열 -> 패턴 대체
EXACT = {
    "黒真珠の間": "흑진주의 방",
    "寝室": "침실",
    "受付": "접수",
    "閉鎖": "폐쇄",
    "自由": "자유",
    "制限": "제한",
    "書記執務室": "서기 집무실",
}

# 정규식 치환 (긴 직책부터 먼저)
REPLACEMENTS = [
    ("帝国軍最高司令官", "제국군 최고사령관"),
    ("帝国宰相", "제국 재상"),
    ("宇宙艦隊司令長官", "우주함대 사령장관"),
    ("宇宙艦隊副司令長官", "우주함대 부사령장관"),
    ("宇宙艦隊総参謀長", "우주함대 총참모장"),
    ("宇宙艦隊参謀", "우주함대 참모"),
    ("統合作戦本部長", "통합작전본부장"),
    ("統合作戦本部第一次長", "통합작전본부 제1차장"),
    ("統合作戦本部第二次長", "통합작전본부 제2차장"),
    ("統合作戦本部第三次長", "통합작전본부 제3차장"),
    ("統合作戦本部参事官", "통합작전본부 참사관"),
    ("統帥本部総長", "통수본부 총장"),
    ("統帥本部次長", "통수본부 차장"),
    ("統帥本部作戦一課課長", "통수본부 작전1과 과장"),
    ("統帥本部作戦二課課長", "통수본부 작전2과 과장"),
    ("統帥本部作戦三課課長", "통수본부 작전3과 과장"),
    ("統帥本部監察官", "통수본부 감찰관"),
    ("後方勤務本部長", "후방근무본부장"),
    ("後方勤務本部次長", "후방근무본부차장"),
    ("後方勤務本部参事官", "후방근무본부 참사관"),
    ("科学技術本部長", "과학기술본부장"),
    ("科学技術総監", "과학기술총감"),
    ("大本営参謀", "대본영 참모"),
    ("幕僚総監", "참모총감"),
    ("憲兵総監", "헌병총감"),
    ("憲兵副総監", "헌병부총감"),
    ("憲兵司令官", "헌병사령관"),
    ("装甲擲弾兵総監", "장갑척탄병총감"),
    ("装甲擲弾兵副総監", "장갑척탄병부총감"),
    ("士官学校長", "사관학교장"),
    ("士官学校教官", "사관학교 교관"),
    ("軍務省人事局長", "군무성 인사국장"),
    ("軍務省調査局長", "군무성 조사국장"),
    ("軍務省参事官", "군무성 참사관"),
    ("軍務省次官", "군무성 차관"),
    ("軍務尚書", "군무상서"),
    ("内閣書記官長", "내각서기관장"),
    ("フェザーン駐在高等弁務官", "페잔 주재 고등판무관"),
    ("フェザーン駐在補佐官", "페잔 주재 보좌관"),
    ("フェザーン駐在武官", "페잔 주재 무관"),
    ("国務委員長", "국무위원장"),
    ("国防委員長", "국방위원장"),
    ("財政委員長", "재정위원장"),
    ("法秩序委員長", "법질서위원장"),
    ("天然資源委員長", "천연자원위원장"),
    ("人的資源委員長", "인적자원위원장"),
    ("経済開発委員長", "경제개발위원장"),
    ("地域社会開発委員長", "지역사회개발위원장"),
    ("情報交通委員長", "정보교통위원장"),
    ("国務尚書", "국무상서"),
    ("内務尚書", "난무상서"),
    ("財務尚書", "재무상서"),
    ("宮内尚書", "궁내상서"),
    ("司法尚書", "사법상서"),
    ("典礼尚書", "전례상서"),
    ("科学尚書", "과학상서"),
    ("要塞守備隊指揮官", "요새수비대지휘관"),
    ("要塞事務総監", "요새사무총감"),
    ("要塞司令官", "요새사령관"),
    ("惑星守備隊指揮官", "행성수비대지휘관"),
    ("惑星総督", "행성총독"),
    ("帝都防衛司令官", "제도방위사령관"),
    ("近衛兵総監", "근위병총감"),
    ("首都司政官", "수도시정관"),
    ("首都防衛指揮官", "수도방위지휘관"),
    ("自治領主", "자치령주"),
    ("副議長", "부의장"),
    ("議長", "의장"),
    ("陸戦総監部長", "육전총감부장"),
    ("査閲部長", "검엽부장"),
    ("戦略部長", "전략부장"),
    ("人事部長", "인사부장"),
    ("防衛部長", "방위부장"),
    ("情報部長", "정병부장"),
    ("通信部長", "통신부장"),
    ("装備部長", "장비부장"),
    ("施設部長", "시설부장"),
    ("経理部長", "경리부장"),
    ("教育部長", "교육부장"),
    ("衛星部長", "위성부장"),
    ("知事", "지사"),
    ("皇帝", "황제"),
    ("執務室", "집무실"),
]


def translate(text: str) -> str | None:
    if text in EXACT:
        return EXACT[text]
    result = text
    for src, dst in REPLACEMENTS:
        result = result.replace(src, dst)
    # 접미/접두 정리
    result = result.replace("の間", "의 방")
    if result == text:
        return None
    return result


def main():
    with MSGDAT_PATH.open("r", encoding="utf-8") as f:
        msgdat = json.load(f)
    records = msgdat["files"]["constmsg.dat"]["records"]

    with KO_PATH.open("r", encoding="utf-8") as f:
        ko = json.load(f)

    translated = 0
    skipped = []
    for rec in records:
        mid = rec["id"]
        if not (ID_START <= mid <= ID_END):
            continue
        if str(mid) in ko["translations"]:
            continue  # 이미 번역됨
        text = rec["text"]
        tr = translate(text)
        if tr:
            ko["translations"][str(mid)] = tr
            translated += 1
        else:
            skipped.append((mid, text))

    with KO_PATH.open("w", encoding="utf-8") as f:
        json.dump(ko, f, ensure_ascii=False, indent=2)

    print(f"added {translated} translations")
    if skipped:
        print(f"skipped {len(skipped)} items:")
        for mid, text in skipped:
            print(f"  {mid}: {text}")


if __name__ == "__main__":
    main()
