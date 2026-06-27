# -*- coding: utf-8 -*-
"""cp932 채팅 송신 해저드 결정론 증명.

한국어 IME가 ACP=949에서 주는 cp949 ANSI 바이트를, 게임 채팅 송신이
setlocale(LC_ALL,"Japanese") 후 MultiByteToWideChar(cp932)로 디코드하면 어떻게 깨지는가.
수신 렌더는 wide->wide라 무관 → 송신 1지점만 모지바케.
"""
import sys

samples = ["안녕하세요", "은하제국", "로엔그람", "한글"]
for s in samples:
    cp949 = s.encode("cp949")            # IME 합성결과(ANSI, ACP=949)
    correct = cp949.decode("cp949")      # 올바른 경로(cp949 디코드)
    try:
        as932 = cp949.decode("cp932")    # 게임 버그(setlocale Japanese → cp932)
    except Exception as e:               # noqa: BLE001
        as932 = f"<decode error: {e}>"
    # 정상 와이어(cp949 경로): UTF-16LE 코드유닛
    correct_utf16 = correct.encode("utf-16-le").hex()
    print(f"입력 {s!r}")
    print(f"  cp949 bytes        = {cp949.hex()}")
    print(f"  └ cp949 디코드(정상) = {correct!r}")
    print(f"  └ cp932 디코드(버그) = {as932!r}   <- 와이어 모지바케")
    print(f"  정상 0x0f1c text(UTF-16LE) = {correct_utf16}")
    print()

# 역검산: "한글" = U+D55C U+AE00, UTF-16LE = 5c d5 00 ae (explorer 예시와 대조)
print("역검산: '한글' U+D55C U+AE00 UTF-16LE =", "한글".encode("utf-16-le").hex())
print("python:", sys.version.split()[0])
