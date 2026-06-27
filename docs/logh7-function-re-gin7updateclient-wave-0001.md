# LOGH VII 함수 RE — Gin7UpdateClient 웨이브 0001 요약 (결정론 재생성)

생성: `tools/logh7_func_wave_doc.py` (합성 에이전트가 세션한도로 실패하여 out batch에서 직접 재생성). 배치 0~39.

- 문서화 함수: **310**
- confidence: P0-decompile=301, P3-inferred=9
- 서브시스템: crt=150, network=75, ui=33, core=26, file=12, render=11, unknown=1, library=1, input=1

## 옵코드 → 함수 (이 웨이브)

- `0x0100`: FUN_00403310

## 함수 표

| addr | name | conv | subsystem | conf | 목적(요약) |
|---|---|---|---|---|---|
| 0x004028ae | Catch@004028ae | cdecl? (SEH ca | crt | P3? | C++ exception catch handler funclet. On entry it reads the exception/state object pointer from the caller frame (EBP+8), sets that |
| 0x00402900 | FUN_00402900 | cdecl | crt | P0 | Formats an unhandled-exception report into a stream/log object. It first builds a current timestamp ("%Y/%m/%d %H:%M:%S") via the  |
| 0x00402ed0 | FUN_00402ed0 | thiscall (ecx= | crt | P0 | MFC CString 버퍼 관리 헬퍼 (CString::AllocBeforeWrite / GetBuffer 계열 — copy-on-write 분리 + 재할당). this+4=문자 버퍼 포인터로, 그 직전 바이트 buf[-1]가 참조/ |
| 0x00403059 | Catch@00403059 | cdecl? (EH cat | crt | P3? | Exception-handling catch funclet that allocates a buffer. It saves the requested size from parent [EBP+8] into [EBP-0x14], compute |
| 0x00403180 | FUN_00403180 | thiscall (ecx= | network | P0 | Initializes/repopulates a unified message-object pool (mpsUniMessageFactory). It first drains any existing pooled objects: repeate |
| 0x00403280 | FUN_00403280 (mpsUniMessageF | thiscall (ecx= | network | P0 | Message factory 'produce_message' for the mpsUniMessage subsystem. Only the format value 0x100 is supported: it tries to pull a po |
| 0x00403310 | FUN_00403310 | thiscall (ecx  | network | P0 | mpsUniMessageFactory::recycle_message — returns a network message object to the factory's free pool. It first calls the message's  |
| 0x00403380 | FUN_00403380 | cdecl (param_1 | crt | P0 | MSVC std::basic_ostream<char>::operator<<(const char*) / unformatted C-string insertion. Computes strlen(param_2) (the leading do/ |
| 0x0040353a | Catch@0040353a | cdecl (compile | crt | P0 | MSVC structured-exception catch funclet. It calls a cleanup/exception-handling helper (FUN_004153c9) and then returns the address  |
| 0x00403960 | FUN_00403960 | fastcall (para | core | P0 | C++ object constructor with SEH frame. Installs an exception handler (&LAB_0043e45b) onto the FS:[0] exception chain, sets the obj |
| 0x00403a00 | FUN_00403a00 | thiscall (ecx= | render | P0 | Decodes the bitmap held by this object into a GDI DIBSection/HBITMAP and a logical palette, for rendering. It first releases any p |
| 0x00404880 | FUN_00404880 | fastcall (para | core | P0 | Constructor for a large composite object (an mtHttp/UpdateClient session-style class). Installs a SEH frame, calls base init FUN_0 |
| 0x00404960 | FUN_00404960 | fastcall (ecx= | core | P0 | UpdateClient 애플리케이션 객체의 소멸자/종료 정리 루틴(SEH 프레임 보유). vtable을 PTR_FUN_00440898로 설정한 뒤: 로그파일 핸들(param_1[0x33])이 있으면 끝까지 seek(FUN_004098 |
| 0x00404c30 | FUN_00404c30 | fastcall (Ghid | ui | P3? | Cleanup/teardown routine for an object that may own a spawned process or a modal dialog. If the handle at param_1+0xd0 is NULL it  |
| 0x00404dc0 | FUN_00404dc0 | fastcall (para | network | P0 | Loads the updater's network/path configuration from an INI file under the [UPDATE] section using GetPrivateProfileIntA / GetPrivat |
| 0x00405030 | FUN_00405030 | fastcall (para | ui | P0 | Builds/formats an 'UPDATE'/'VERSION' descriptor by calling a 4-argument formatter (FUN_00405060). It passes literal label strings  |
| 0x00405310 | FUN_00405310 | fastcall (ecx  | network | P0 | Parses SERVER.INI and builds the redirect/server entry list. It clears the output object's count fields (param_1[0]=count, param_1 |
| 0x00405540 | thunk_FUN_004378c2 | fastcall (para | crt | P0 | Reference-counted string/buffer release thunk (MFC CString / ATL CStringData style). param_1 points to a string handle; the actual |
| 0x00406090 | FUN_00406090 | fastcall (ecx= | ui | P0 | Initialize/construct the application's main title/loading window. Sets up SEH, calls base-class init (FUN_00439a8e), loads the tit |
| 0x00406a90 | FUN_00406a90 | thiscall (ecx= | ui | P0 | Appends a formatted progress/log entry to a UI list/edit control (a file-transfer or download progress dialog). It computes a huma |
| 0x00406ed0 | FUN_00406ed0 | thiscall (ecx  | ui | P0 | Result handler for the auto-updater/patcher: given a result code (param_1) it records it and updates the updater dialog UI. First  |
| 0x004079fe | xMonitorFromWindow | stdcall | ui | P0 | MSVC 멀티모니터 API 심(shim) _xMonitorFromWindow@8. 런타임에 user32 MonitorFromWindow가 사용가능한지 FUN_004078d0로 검사해, 사용가능하면 함수포인터 DAT_00451224로  |
| 0x00407afc | GetOwner | thiscall (ecx  | ui | P0 | MFC CWnd::GetOwner. If the window has no explicit owner stored (this+0x20 == 0) it queries the Win32 parent (GetParent on the HWND |
| 0x00408033 | Catch@00408033 | MSVC C++ EH ca | crt | P0 | C++ exception-handling catch funclet. On the unwind/catch path it releases a critical section — LeaveCriticalSection on the object |
| 0x004083a4 | __global_unwind2 | cdecl | crt | P0 | Visual Studio CRT library function (single-match signature). Initiates a global stack unwind for SEH/C++ exception handling by cal |
| 0x004083e6 | __local_unwind2 | cdecl | crt | P0 | MSVC C runtime local unwind handler for SEH __try/__finally scopes. Walks the scope table (at *(param_1+8)) from the current try-l |
| 0x0040844e | __abnormal_termination | cdecl (CRT/SEH | crt | P0 | MSVC CRT __abnormal_termination intrinsic used inside __try/__finally. Returns 1 when the current __finally block is being entered |
| 0x00408471 | __NLG_Notify1 | fastcall (실제로는 | crt | P0 | MSVC CRT 내부 longjmp/SEH 지원 루틴 __NLG_Notify1 (NLG = Non-Local Goto). 디버거/예외 인프라에 비국소 점프 발생을 통지하기 위해 현재 in_EAX(점프 대상/코드), param_1, u |
| 0x00408a5e | _malloc | cdecl | crt | P0 | CRT malloc wrapper: forwards to __nh_malloc(_Size, DAT_00451960) where DAT_00451960 is the new-handler retry count, returning the  |
| 0x00408a70 | __nh_malloc | cdecl | crt | P0 | CRT __nh_malloc — new handler 지원 malloc. _Size가 0xffffffe1 미만일 때 FUN_00408a9c(_heap_alloc)를 반복 시도하고, 할당 성공 시 포인터를 반환한다. NULL이면 _Nh |
| 0x00408b98 | FUN_00408b98 | cdecl | crt | P0 | MSVC CRT free-helper that frees a CRT-internal allocation while running its associated unwind/destructor cleanup before returning  |
| 0x00409291 | FUN_00409291 | cdecl | crt | P0 | Stream-lock acquire helper (the lock counterpart of FUN_004092e3). If param_1 points inside the static stream/FILE table (range (s |
| 0x004092e3 | FUN_004092e3 | cdecl | crt | P0 | Stream-lock release helper. If param_1 points inside the static table of FILE/stream lock objects (range (s___AVtype_info+0xf .. 0 |
| 0x00409542 | __CxxThrowException@8 | stdcall (@8 —  | crt | P0 | CRT _CxxThrowException — raises a C++ exception. Copies the static exception-info/throw-descriptor template DAT_00441fc8 (8 dwords |
| 0x004095cc | __ftol | cdecl (MSVC CR | crt | P0 | Visual Studio CRT float-to-long conversion helper. Rounds the float10 value currently on the FPU stack (ST0) toward zero and retur |
| 0x0040966b | __fclose_lk | cdecl | file | P0 | CRT _fclose_lk: closes a FILE stream without taking the global file lock (caller holds it). If the stream flag has _IOREAD/_IOWRT/ |
| 0x00409a2e | entry | cdecl (CRT ent | crt | P0 | Visual C++ 6.0 CRT process entry point (the __mainCRTStartup/WinMainCRTStartup body). It reads the OS version via GetVersion() int |
| 0x00409b36 | __amsg_exit | cdecl | crt | P0 | CRT _amsg_exit: fatal runtime-error terminator. If the FPU/state-init flag DAT_004518d4 == 1 it calls FUN_0041090f (FP cleanup), p |
| 0x00409b80 | _memset | cdecl | crt | P0 | CRT memset implementation. Fills _Size bytes at _Dst with the low byte of _Val. Returns immediately if _Size==0. For sizes >=4 it  |
| 0x00409c00 | _memcmp | cdecl | crt | P0 | Visual Studio 1998 CRT memcmp. Compares _Size bytes of two buffers. If both buffers are 4-byte aligned it compares a word at a tim |
| 0x00409cb0 | FUN_00409cb0 | cdecl | crt | P0 | MSVC CRT memmove(겸 memcpy). param_1=dest, param_2=src, param_3=바이트 수. 영역이 겹치고 src<dest<src+n인 경우 끝에서부터(역방향) 복사해 데이터 손상을 막고, 그 외에는  |
| 0x0040a70a | FUN_0040a70a | cdecl | crt | P0 | MSVC CRT codepage/ctype-table initializer (equivalent to __getlocaleinfo/setSBCS+setMBCS for LC_CTYPE). Given a locale-ID-ish UINT |
| 0x0040ac13 | FUN_0040ac13 | cdecl | crt | P0 | Date/time format directive expander (CRT/MFC strftime-style). Given a single directive character (param_1) it reads the matching f |
| 0x0040b0e1 | FUN_0040b0e1 | cdecl | crt | P0 | Date/time picture-string parser (Windows GetDateFormat/GetTimeFormat-style). Walks a locale format pattern string (param_1, e.g. " |
| 0x0040b4ef | __exit | cdecl | crt | P0 | Visual Studio 2003 CRT exit() implementation. Forwards to the common termination routine FUN_0040b500(_Code, 1, 0) which runs atex |
| 0x0040b680 | FUN_0040b680 | cdecl | crt | P0 | MSVC CRT memmove/memcpy implementation. Copies param_3 bytes from source param_2 to destination param_1. The first major branch ha |
| 0x0040bb10 | _strlen | cdecl | crt | P0 | Standard C runtime strlen. Aligns the pointer to a 4-byte boundary scanning bytes for NUL, then scans a word at a time using the c |
| 0x0040cf30 | __CallSettingFrame@12 | cdecl? (MSVC E | crt | P0 | CRT/EH __CallSettingFrame — C++ 예외 처리 중 catch 핸들러로 진입하기 위한 프레임 설정 호출. __NLG_Notify1(param_3)로 디버거 NLG(Non-Local Goto) 통지를 보내고 그 반환 |
| 0x0040cfe3 | FUN_0040cfe3 | cdecl (no expl | crt | P0 | Per-thread CRT data block accessor, equivalent to MSVCRT _getptd_noexit / _getptd. It saves the current Win32 last-error, fetches  |
| 0x0040d1a1 | FUN_0040d1a1 | cdecl | crt | P0 | MSVC CRT internal realloc (_realloc / _realloc_base). Given a block pointer param_1 and new size param_2: if param_1==NULL it dege |
| 0x0040daab | FUN_0040daab | cdecl | crt | P0 | Internal small-block heap free routine (CRT '__free_base'-style). Given the owning heap-segment descriptor (param_1) and a user po |
| 0x0040ddd4 | FUN_0040ddd4 | cdecl | crt | P0 | Internal small-block heap allocation routine (CRT '__malloc_base'-style). param_1 carries the requested user size; it is rounded u |
| 0x0040ec75 | FUN_0040ec75 | cdecl | crt | P0 | MSVC CRT 내부 _lock. param_1 인덱스의 전역 락 테이블 슬롯 DAT_0044d2c8[param_1]이 아직 초기화되지 않았으면(0) CRITICAL_SECTION(0x18바이트)을 malloc하고, 락 0x11(_L |
| 0x0040ecd6 | FUN_0040ecd6 | cdecl | crt | P0 | MSVC CRT 내부 _unlock. param_1을 락 테이블 인덱스로 사용해 전역 크리티컬섹션 배열 DAT_0044d2c8[param_1]에 대해 LeaveCriticalSection을 호출한다(스레드 동기화 해제). FUN_00 |
| 0x0040edd0 | _strcmp | cdecl | crt | P0 | Standard C library strcmp. Lexicographically compares the two NUL-terminated strings _Str1 and _Str2 by unsigned byte value, retur |
| 0x0040f15c | FUN_0040f15c | cdecl | crt | P0 | MSVCRT printf-family core formatting engine (the classic `_output`/`woutput` worker). It walks the format string `param_2` one byt |
| 0x0040fc1b | __fassign | cdecl (단, in_E | crt | P0 | CRT __fassign — printf/scanf 계열 부동소수점 문자열→값 변환 보조. flag가 0이 아니면(long double/double 경로) FUN_004126db로 number 문자열을 파싱해 12바이트(2워드) 결과 |
| 0x0040ff0b | __cfltcvt | cdecl | crt | P0 | CRT _cfltcvt: floating-point to string conversion dispatcher used by printf-family formatting. Based on the format character (pass |
| 0x004100f1 | __freebuf | cdecl | crt | P0 | MSVC CRT stdio helper that frees the internal buffer of a FILE stream. If the stream has an active buffer that the CRT allocated ( |
| 0x004101a0 | __allmul | cdecl (CRT hel | crt | P0 | MSVC CRT 64-bit integer multiply helper. Computes the 64-bit product of two 64-bit operands (param_1:param_2 low/high, param_3:par |
| 0x00410ab0 | _strchr | cdecl | crt | P0 | Standard C library strchr. Returns a pointer to the first occurrence of the byte _Val in the NUL-terminated string _Str, or NULL i |
| 0x00410dd0 | __strrev | cdecl | crt | P0 | CRT _strrev: reverses a null-terminated string in place. First loop measures the length to find the last character; second loop sw |
| 0x00410e2e | FUN_00410e2e | cdecl | crt | P0 | MSVC CRT __tzset_nolock equivalent: initializes the process timezone state. It first tries the TZ environment variable via FUN_004 |
| 0x004110d6 | FUN_004110d6 | cdecl | crt | P0 | MSVC CRT daylight-saving-time test (_isindst-equivalent): given a broken-down time structure (param_1, a tm-like struct), decides  |
| 0x004116c0 | FUN_004116c0 | thiscall (ecx= | crt | P0 | Locale-aware case-insensitive string comparison (MSVC CRT _stricmp / _stricmp_l implementation). When the locale flag DAT_00451bb4 |
| 0x00411790 | _strstr | cdecl | crt | P0 | Visual Studio 1998 CRT strstr. Locates the first occurrence of substring _SubStr within _Str. Empty _SubStr returns _Str. Single-c |
| 0x00411890 | _strrchr | cdecl | crt | P0 | CRT strrchr: finds the last occurrence of character _Ch in null-terminated string _Str. First loop computes the string length (sca |
| 0x004118c0 | _strncmp | cdecl | crt | P0 | CRT strncmp implementation. Compares up to _MaxCount bytes of _Str1 and _Str2. First it scans _Str1 for the NUL terminator within  |
| 0x00411b10 | _strncpy | cdecl | crt | P0 | Visual Studio 1998 CRT strncpy. Copies at most _Count chars from _Source to _Dest. Uses a word-aligned fast path with the classic  |
| 0x00411f80 | __aulldiv | cdecl (MSVC 64 | crt | P0 | MSVC 컴파일러 런타임 헬퍼 __aulldiv — 부호없는 64비트 나눗셈(unsigned long long divide). param_2:param_1을 param_4:param_3으로 나눈 64비트 몫을 반환. 제수 상위가 0이 |
| 0x00411ff0 | __aullrem | cdecl (MSVC 64 | crt | P0 | MSVC 컴파일러 런타임 헬퍼 __aullrem — 부호없는 64비트 나머지 연산(unsigned long long modulo). param_2:param_1(피제수 64비트), param_4:param_3(제수 64비트)에 대해  |
| 0x00412d2a | ___add_12 | cdecl | crt | P0 | CRT ___add_12 — 12바이트(96비트, 3×32비트 워드) 확장정밀도 가수(mantissa) 덧셈. FUN_00412d09(워드 단위 carry 발생 덧셈)로 param_1[0]+=param_2[0], 캐리 시 param_ |
| 0x00412eaa | FUN_00412eaa | thiscall (ecx= | crt | P0 | MSVC CRT floating-point string scanner / converter (the __strgtold12-style routine used by strtod/scanf %f). It runs a character s |
| 0x0041360e | __mbsnbicoll | cdecl | crt | P0 | CRT __mbsnbicoll — case-insensitive, locale-aware collation comparison of two multibyte strings up to _MaxCount bytes. Returns 0 i |
| 0x00413f4c | RtlUnwind | cdecl (IAT thu | crt | P0 | Import thunk for the NTDLL RtlUnwind API used by SEH/EH to unwind the stack to a target frame. Body is an indirect jump through th |
| 0x00413f52 | GetFileTitleA | cdecl (IAT thu | file | P0 | Import thunk for the common-dialog API GetFileTitleA (extracts the file title portion from a path). Body is an indirect jump throu |
| 0x00413f58 | ClosePrinter | stdcall (winsp | core | P0 | Import thunk for the GDI Print Spooler ClosePrinter(). Closes a printer handle. Present in the binary because the MFC/CRT runtime  |
| 0x00413f5e | DocumentPropertiesA | cdecl (IAT thu | core | P0 | Import thunk for the Win32 GDI/spooler API DocumentPropertiesA. Ghidra shows it as a self-recursive call because the body is just  |
| 0x00413f64 | OpenPrinterA | cdecl (IAT thu | core | P0 | Import thunk for the Win32 spooler API OpenPrinterA, which opens a handle to a printer. Body is an indirect jump through the impor |
| 0x00413f6a | FUN_00413f6a | cdecl (no expl | crt | P0 | MSVC C++ throw helper for the standard-library exception std::length_error("string too long"). It builds a temporary string object |
| 0x00414279 | FUN_00414279 | thiscall | crt | P0 | MSVC C++ std::string-style 'assign a substring' member: copies up to param_3 characters starting at offset param_2 from a source s |
| 0x004145c2 | FUN_004145c2 | thiscall? (ecx | crt | P0 | MSVC C++ standard-library per-locale-facet one-time initializer (a compiler-emitted '_Init'/locale-category construction block). I |
| 0x00414a89 | uflow | thiscall (ecx= | crt | P0 | MSVC STL std::basic_streambuf<char>::uflow — underflow 가상함수(vtable+0x10=underflow)를 호출해 현재 get 위치의 문자를 확보하고, -1(EOF)이면 -1을 반환, 아니면 |
| 0x0041520a | _Gninc | thiscall (ecx= | crt | P0 | MSVC STL std::basic_streambuf<char>::_Gninc — char 스트림의 get 영역 1바이트 전진. get 카운트(*(this+0x2c))를 1 감소시키고, get 포인터(*(this+0x1c))가 가리키 |
| 0x0041594e | FUN_0041594e | thiscall? (ecx | crt | P0 | MSVC C++ standard-library per-locale-facet one-time initializer; a near-identical twin of FUN_004145c2 operating on a different lo |
| 0x00415d27 | uflow | thiscall (para | crt | P0 | STL std::basic_streambuf<wchar_t>::uflow: virtual underflow-then-advance. Calls the streambuf's virtual underflow (vtable+0x10); i |
| 0x00416383 | Gninc | thiscall (ecx= | crt | P0 | MSVC STL std::basic_streambuf<unsigned short/wchar_t>::_Gninc — wide 스트림 버퍼의 get 영역 진행. get 카운트(*(param_1+0x2c))를 1 감소시키고, get 포인터 |
| 0x00416476 | FUN_00416476 | fastcall | crt | P0 | Thread-safe lazy one-time initialization of a global critical section followed by entering it (MSVC '_mlock'/'_lockexit'-style gua |
| 0x00416512 | FUN_00416512 | cdecl (no para | crt | P0 | Conditional critical-section release. If the global initialization-state flag DAT_004520b8 equals 2 (meaning the critical section  |
| 0x00419340 | FUN_00419340 | cdecl | crt | P0 | zlib/DEFLATE 'inflate_codes' core: decodes a compressed DEFLATE block by repeatedly pulling bits from the bit accumulator, walking |
| 0x00419c90 | FUN_00419c90 | cdecl | crt | P0 | DEFLATE 동적 허프만 블록(BTYPE=10)을 디코드하는 zlib inflate_dynamic 루틴. param_1이 가리키는 inflate 상태 구조체에서 비트스트림을 읽어 HLIT(local_500 = 5비트 + 0x101, |
| 0x0041ad90 | FUN_0041ad90 | cdecl | crt | P0 | Builds the static lookup/base tables for an entropy decoder (zlib/inflate-style fixed Huffman + length/distance base tables). It i |
| 0x0041b050 | FUN_0041b050 | cdecl (no args | unknown | P3? | Large table-driven state/format dispatcher that emits one or more output tokens by walking parallel global record arrays. For the  |
| 0x0041c1e0 | FUN_0041c1e0 | cdecl | file | P0 | LZ + Huffman sliding-window decompressor (plain variant). Decodes a compressed token stream from a bit reservoir held in the decod |
| 0x0041c5c0 | FUN_0041c5c0 | cdecl | file | P0 | LZ + Huffman sliding-window decompressor (dictionary-mirroring variant). Structurally identical to FUN_0041c1e0 (same primary/seco |
| 0x0041cd33 | FUN_0041cd33 | fastcall (para | file | P0 | LZX-style sliding-window LZ decompressor core loop. Decodes one block of compressed data into the window buffer described by the d |
| 0x0041d010 | FUN_0041d010 | thiscall (ecx= | core | P0 | mtStack::push — 스택에 원소 param_1을 푸시한다. top(this+0xc)이 용량-1(this+4 -1) 이상이면 성장증분(this+8)이 0이 아닐 때 FUN_0041d080(expand)으로 확장 시도하고, 증분 |
| 0x0041d080 | FUN_0041d080 | thiscall (ecx= | core | P0 | mtStack::expand — 가변 배열 스택의 용량을 늘린다. param_1==-1이면 현재용량(this+4)만큼 증가(2배 성장), 아니면 그 양만큼 증가. 신규용량*4 바이트를 FUN_00437c86으로 할당하고 실패 시 'm |
| 0x0041d1c0 | FUN_0041d1c0 | thiscall (ecx  | network | P0 | mpsMessage constructor. Initializes a wire-message object: zeroes header fields (this+4 = opcode/word, this+8 = length), stores th |
| 0x0041d330 | FUN_0041d330 | fastcall (para | network | P0 | mpsMessage::initialize: resets a message object for reuse. Zeroes the 16-bit field at +6, and if the lock flag at +0x3c is non-zer |
| 0x0041d370 | FUN_0041d370 (mpsMessage::in | thiscall (ecx= | network | P0 | mpsMessage::input — reads a message body out of an input stream object. Calls the source's virtual method at vtable+0x20 to popula |
| 0x0041d420 | FUN_0041d420 | fastcall | network | P0 | mpsMessage::lock_parameter_input_buffer. Acquires (locks) the parameter input buffer of an mpsMessage object (param_1). Guards aga |
| 0x0041d490 | FUN_0041d490 | fastcall (para | network | P0 | mpsMessage::lock_parameter_output_buffer. Locks the parameter/output sub-buffer embedded in an mpsMessage object so callers can se |
| 0x0041d510 | FUN_0041d510 | fastcall (para | network | P0 | mpsMessage::clear_parameter_buffer. Resets the message's parameter buffer to empty. If the output buffer is currently locked (+0x3 |
| 0x0041d8f0 | FUN_0041d8f0 | thiscall (ecx= | network | P0 | Constructor/initializer for an mpsClientConnection that wires up a message factory. It stores the four ctor arguments into the obj |
| 0x0041dbc0 | FUN_0041dbc0 | thiscall (ecx  | network | P0 | mpsMessage receive-into-stream routine. It constructs a temporary stream-buffer (local_20, vtable PTR_FUN_00442a74), then peeks a  |
| 0x0041ddc0 | FUN_0041ddc0 | cdecl | file | P0 | Builds a path string into the dynamic string-buffer object param_3 and, if the resulting path already exists, derives a non-collid |
| 0x0041e320 | FUN_0041e320 | thiscall (ecx= | file | P0 | Initializes an updater download/file-task descriptor object from a parameter block (param_1). It copies a name/URL string (param_1 |
| 0x0041f850 | FUN_0041f850 | fastcall (ecx= | network | P0 | One step of the state machine that drives an HTTP/file-transfer (auto-update download) client object. It polls the active connecti |
| 0x00420260 | FUN_00420260 | thiscall (ecx  | network | P0 | Handler for the 'msg_get_update_info_ok' message inside mpsUpdateClientProcessor. It allocates a 0x3c-byte update-info record via  |
| 0x00421bd0 | FUN_00421bd0 | cdecl (LPCSTR  | file | P0 | Recursively deletes a directory and everything beneath it (a 'remove directory tree' / rmtree helper). It first confirms param_1 i |
| 0x004228f6 | Catch@004228f6 | MSVC C++ EH ca | crt | P0 | C++ exception-handling catch funclet. If the object pointer at EBP-0x18 is non-NULL, it invokes that object's virtual method at vt |
| 0x004231b0 | FUN_004231b0 | cdecl (param_1 | core | P0 | Installs (or refcount-bumps) a per-thread Windows CBT hook (SetWindowsHookExA hook id 5 = WH_CBT) using callback FUN_00424310 and  |
| 0x00423aa0 | FUN_00423aa0 | cdecl (no para | ui | P0 | Reads the Windows menu-language preference from win.ini and sets a global menu/display-mode code accordingly, guarded by an initia |
| 0x00423b40 | FUN_00423b40 | cdecl | ui | P0 | One-time initializer for the client's custom 3D control window classes (the "C3dNew"/"C3dLNew"/"C3dHNew" family). Under a critical |
| 0x00423e10 | FUN_00423e10 | cdecl | render | P0 | GDI theme/color resource setup. Guarded by DAT_00455ec0 (returns 0 if zero). Reads 8 Windows system colors via GetSysColor using t |
| 0x00423fa0 | FUN_00423fa0 | cdecl (window- | ui | P0 | Window subclass / message-interception procedure (skin or non-client custom-paint hook). For WM_NCDESTROY (0x82) it forwards to FU |
| 0x00424310 | FUN_00424310 | cdecl (matches | ui | P0 | A Windows message/CBT hook procedure (HOOKPROC) installed for an MFC-style modeless-dialog/tooltip message filter. It first acquir |
| 0x00424c00 | FUN_00424c00 | cdecl | ui | P0 | Windows button-control owner-draw / paint routine. It reads the window's style with GetWindowLongA(hwnd,-0x10) and isolates the BS |
| 0x00425f70 | FUN_00425f70 | cdecl (effecti | crt | P0 | CRT/library process-attach initialization routine (DllMain-style). When param_2==1 (DLL_PROCESS_ATTACH) it resolves DisableThreadL |
| 0x00426220 | thunk_FUN_00426225 | cdecl? (썽크, 인자 | core | P0 | 전역 char 플래그 초기화 썽크. 먼저 FUN_004261ef(0)을 호출(관련 서브시스템 초기화/리셋)한 뒤, FUN_00408510(&LAB_0042620d)로 SEH 보호된 콜백(LAB_0042620d 코드)을 실행하고 그 반 |
| 0x004262f6 | ~exception | thiscall (ecx= | crt | P0 | CRT std::exception virtual destructor. Installs the exception vtable (&PTR_FUN_00442bbc) into the object, and if the 'owns string' |
| 0x004270f0 | FUN_004270f0 (mtNetStreamOut | thiscall (ecx= | network | P0 | Stream-insertion operator appending a single 8-bit byte (no byte-order conversion needed). If write offset (this+0xc)+1 exceeds ca |
| 0x00427160 | FUN_00427160 (mtNetStreamOut | thiscall (ecx= | network | P0 | Stream-insertion operator that appends a big-endian (network-order) 16-bit value to mtNetStreamOutputBuffer. If write position (th |
| 0x004271e0 | FUN_004271e0 (mtNetStreamOut | thiscall (ecx= | network | P0 | Stream-insertion operator appending a big-endian 32-bit value. If write offset (this+0xc)+4 exceeds capacity (this+8), grows via F |
| 0x00427250 | FUN_00427250 | thiscall (ecx= | network | P0 | mtNetStreamOutputBuffer::operator<<(int8_t): appends a single byte (param_1) to the network output stream buffer. It first ensures |
| 0x004272c0 | FUN_004272c0 (mtNetStreamOut | thiscall (ecx= | network | P0 | Stream-insertion operator appending a big-endian signed 16-bit value (byte-identical to the uint16 path but distinguished by its d |
| 0x00427340 | FUN_00427340 (mtNetStreamOut | thiscall (ecx= | network | P0 | Stream-insertion operator appending a big-endian signed 32-bit value (byte-identical to the uint32 path, distinguished by diagnost |
| 0x004273b0 | FUN_004273b0 (mtNetStreamOut | thiscall (ecx= | network | P0 | Stream-insertion operator appending a 32-bit float in network byte order. The float's 4 raw bytes (received here as u_long param_1 |
| 0x00427420 | FUN_00427420 | thiscall (ecx= | network | P0 | mtNetStreamOutputBuffer::operator<<(double) — appends an 8-byte big-endian (network-order) double to the network stream output buf |
| 0x004274b0 | FUN_004274b0 | thiscall (ecx= | network | P0 | mtNetStreamOutputBuffer::operator<<(string) — 길이가 앞에 붙은 문자열(param_1: +4=데이터 포인터, +8=길이)을 네트워크 출력 버퍼에 append 한다. 필요바이트 = 문자열길이+1. 현 |
| 0x004275f0 | FUN_004275f0 | thiscall (ecx  | network | P0 | mtNetStreamInputBuffer::operator>>(uint8_t&) — reads one unsigned byte from the network input stream. It first bounds-checks: if c |
| 0x00427640 | FUN_00427640 | thiscall (ecx= | network | P0 | mtNetStreamInputBuffer::operator>>(uint16_t) — 수신 버퍼에서 2바이트 부호없는 16비트를 빅엔디안으로 읽는다. 잔여 검사: 길이(this+8) < pos(this+0xc)+2U 이면 언더플로우 → |
| 0x004276a0 | FUN_004276a0 | thiscall (ecx= | network | P0 | mtNetStreamInputBuffer::operator>>(uint32_t) — 수신 버퍼에서 4바이트 부호없는 32비트를 빅엔디안으로 읽는다. 길이(this+8) < pos(this+0xc)+4U 시 언더플로우 → '[mtNet |
| 0x004276f0 | FUN_004276f0 | thiscall (ecx  | network | P0 | mtNetStreamInputBuffer::operator>>(int8_t&) — reads one signed byte from the network input stream. Identical logic to FUN_004275f0 |
| 0x00427740 | FUN_00427740 | thiscall (ecx= | network | P0 | mtNetStreamInputBuffer::operator>>(int16_t) — 수신 버퍼에서 2바이트 부호있는 16비트를 빅엔디안으로 읽는다. uint16 버전(0x00427640)과 동일 로직, 에러문자열만 'int16_t',  |
| 0x004277a0 | FUN_004277a0 | thiscall (ecx= | network | P0 | mtNetStreamInputBuffer::operator>>(int32_t) — 수신 버퍼에서 4바이트 부호있는 32비트를 빅엔디안으로 읽는다. uint32 버전(0x004276a0)과 동일 로직, 에러문자열만 'int32_t',  |
| 0x004277f0 | FUN_004277f0 | thiscall (ecx= | network | P0 | mtNetStreamInputBuffer::operator>>(float) — 네트워크 수신 버퍼에서 4바이트(float) 1개를 빅엔디안으로 읽는다. 잔여 길이 검사: 버퍼길이(this+8) < 현재위치(this+0xc)+4U 이면 |
| 0x00427850 | FUN_00427850 | thiscall (ecx= | network | P0 | mtNetStreamInputBuffer::operator>>(double): reads an 8-byte big-endian double from the network input stream into a two-dword targe |
| 0x004278c0 | FUN_004278c0 | thiscall (ecx= | network | P0 | operator>>(std::string&) for a network-stream input buffer: reads one NUL-terminated token out of the stream into the target std:: |
| 0x00427c50 | FUN_00427c50 | thiscall (ecx= | network | P0 | mtStreamOutputBuffer allocate/reset. Calls FUN_00427da0 to reset/clear the buffer state, then if param_1 (requested byte size) is  |
| 0x00427cb0 | FUN_00427cb0 | thiscall | core | P0 | Resize method of an mtStreamOutputBuffer object (ecx=this). It rejects a zero size (logs "[mtStreamOutputBuffer] resize: illegal s |
| 0x00427dd0 | FUN_00427dd0 | thiscall (this | network | P0 | mtStreamOutputBuffer::attach. If the supplied memory pointer param_1 is NULL it logs '[mtStreamOutputBuffer] attach: illegal memor |
| 0x00427e40 | FUN_00427e40 | thiscall (ecx= | network | P0 | write(src, size, pos, mode) for a stream output buffer: writes param_2 bytes from param_1 into the buffer at a resolved position.  |
| 0x00427ef0 | FUN_00427ef0 | thiscall (ecx= | network | P0 | mtStreamOutputBuffer::calculate_position — 스트림 출력 버퍼의 시킹(seek) 위치를 계산한다. param_2(origin)에 따라 절대(0=begin)/끝기준(1=end)/현재기준(2=cur) 오프 |
| 0x00427fa0 | FUN_00427fa0 | thiscall (ecx  | crt | P0 | MSVC C++ exception-throw helper. Sets up an SEH frame, allocates a 0x14 (20)-byte exception object via the heap allocator FUN_0043 |
| 0x00428570 | FUN_00428570 | thiscall (this | network | P0 | mtStreamInputBuffer::attach. If the supplied memory pointer param_1 is NULL it logs '[mtStreamInputBuffer] attach: illegal memory' |
| 0x004285c0 | FUN_004285c0 | thiscall (ecx  | network | P0 | mtStreamInputBuffer::read — reads param_2 bytes from a position-addressable in-memory stream buffer into the caller's destination  |
| 0x00428650 | FUN_00428650 | thiscall (ecx= | network | P0 | mtStreamInputBuffer::calculate_position — 입력 버퍼판(FUN_00427ef0의 입력버퍼 쌍). 로직이 출력버전과 바이트단위 동일하며(둘 다 size 963) 차이는 에러문자열만 'mtStreamInp |
| 0x00428700 | FUN_00428700 | thiscall (ecx  | crt | P0 | MSVC C++ exception-throw helper, structurally identical to FUN_00427fa0 but for a different exception class. Sets up an SEH frame, |
| 0x00429040 | FUN_00429040 | cdecl (uint __ | network | P0 | Reads the current user's WinINET proxy configuration from the registry and, when an HTTP proxy is enabled, parses out the proxy ho |
| 0x00429530 | FUN_00429530 | cdecl | network | P0 | Constructs and initiates an HTTP GET download request for the updater's 'Multiterm Http Library ver.1.0'. It allocates a ~0x14-byt |
| 0x0042a660 | FUN_0042a660 | fastcall (para | network | P0 | Processes an HTTP redirect / connection-establishment step for the request object at param_1. It first calls FUN_0042a460(param_1) |
| 0x0042b2f5 | Catch@0042b2f5 | MSVC C++ EH ca | crt | P0 | C++ exception-handling catch funclet. If the object pointer at EBP-0x14 is non-NULL, it calls that object's virtual method at vtab |
| 0x0042b3c5 | Catch@0042b3c5 | MSVC C++ EH ca | crt | P0 | C++ exception-handling catch funclet, structurally identical to Catch@0042b2f5. If the object pointer at EBP-0x14 is non-NULL, cal |
| 0x0042b500 | FUN_0042b500 | fastcall (para | network | P0 | HTTP response entity-body framing decider. Looks up the 'Content-Length' header via FUN_0042c690; if present and non-empty it pars |
| 0x0042b8c0 | FUN_0042b8c0 | thiscall (ecx  | file | P0 | State-machine step for receiving an update/download body over a stream. Sets state (this+4)=0xb (receiving). If mode (this+0x2c)== |
| 0x0042c090 | FUN_0042c090 | cdecl | crt | P0 | Serializes/concatenates a vector of fixed-size (0x10-byte) records into a destination std::string-like object (param_2 'this'). It |
| 0x0042cc10 | FUN_0042cc10 | cdecl | crt | P0 | Timezone-name handler. Compares the incoming string param_2 against the global timezone-name string &DAT_0044f3fc; on a match it a |
| 0x0042d450 | FUN_0042d450 | thiscall (this | network | P0 | mtHttpMessage::resize/grow body buffer. Only acts when the object state member this+0x2c == 1 (otherwise returns success/1 immedia |
| 0x0042d880 | FUN_0042d880 | thiscall (ecx  | crt | P0 | STL associative-container node erase routine (std::map/std::set _Erase + RB-tree rebalance). It splices the given node `param_2` o |
| 0x0042e230 | FUN_0042e230 | thiscall (ecx= | crt | P0 | Red-black tree node insertion with rebalancing for an STL associative container (std::map/std::set of string-keyed entries). It al |
| 0x0042ecc0 | FUN_0042ecc0 | thiscall (ecx= | network | P0 | Build an HTTP request-line and store its components into the 'this' HTTP-request object. It validates the method index param_1 (mu |
| 0x0042f110 | FUN_0042f110 | thiscall (ecx  | network | P0 | mtTCPModule_win32::connect — establishes an outbound Winsock TCP connection on the module object. If the module's socket (this+0xc |
| 0x0042f460 | FUN_0042f460 | thiscall | network | P0 | mtTCPModule_win32::listen — opens a TCP listening server socket on the module object (ecx=param_1). If the module is not already i |
| 0x0042f7c0 | FUN_0042f7c0 | fastcall | network | P0 | mtTCPModule_win32::_listen accept handler. ecx-equiv=param_1 (TCP module object). Calls accept() on the listening socket (param_1+ |
| 0x0042faa0 | FUN_0042faa0 | cdecl | crt | P0 | URL/UNC-style path parser (MSVC/MFC string library helper). Guarded by an SEH frame (puStack_8=&LAB_0043fe90). It scans param_1 fo |
| 0x00430210 | FUN_00430210 | thiscall | network | P0 | URL scheme classifier. ecx=this (a string/CString helper context). Tests whether param_1 begins with a known URL scheme by calling |
| 0x00430440 | FUN_00430440 | fastcall (ecx= | network | P0 | mtSendBuffer::write_lock — 송신 링버퍼에서 쓰기 가능한 연속 영역을 잠그고 그 영역에 대한 스트림 출력버퍼 핸들을 반환한다. 이미 잠겨있으면(param_1[6]!=0) 'multiply locked' 로그 후 N |
| 0x00430500 | FUN_00430500 | fastcall (para | network | P0 | mtSendBuffer write-commit/unlock. Treats param_1 as an mtSendBuffer struct of int slots. If the lock flag at param_1[6] is 0 it lo |
| 0x004305e0 | FUN_004305e0 (mtSendBuffer:: | fastcall (para | network | P0 | mtSendBuffer::read_lock — acquires the readable span of a ring-buffer send queue. If already locked (param_1[8] != 0, the lock-len |
| 0x00430630 | FUN_00430630 (mtSendBuffer:: | fastcall (para | network | P0 | mtSendBuffer::read_unlock — releases a read lock and commits the consumed bytes. If not locked (param_1[8] == 0) logs '[mtSendBuff |
| 0x00430840 | FUN_00430840 | fastcall (para | network | P0 | mtReceiveBuffer::write_lock. Acquires a write lock on the ring receive buffer and returns a stream-output view bound to the writab |
| 0x004308b0 | FUN_004308b0 (mtReceiveBuffe | fastcall (para | network | P0 | mtReceiveBuffer::write_unlock — releases a write lock and commits produced bytes into the receive ring. If not locked (param_1[6]  |
| 0x00430900 | FUN_00430900 | fastcall (para | network | P0 | mtReceiveBuffer read-lock/peek. If already locked (param_1[8] != 0) it logs '[mtReceiveBuffer] read_lock: multiply locked' and ret |
| 0x004309d0 | FUN_004309d0 | fastcall (para | network | P0 | mtReceiveBuffer::read_unlock. Releases a previously taken read lock on a ring-style receive buffer. If not locked (param_1[8]==0)  |
| 0x00430bb0 | FUN_00430bb0 | thiscall (ecx  | network | P0 | Parses the first line (status line) of an HTTP response held by the object at 'this'. It first delegates to FUN_0042b270(this,para |
| 0x00432060 | WSAGetLastError | stdcall (WSAPI | network | P0 | Import thunk for Winsock WSAGetLastError(). Returns the calling thread's last Winsock error code after a failed socket call. The b |
| 0x00432a00 | htons | stdcall (WSAPI | network | P0 | Import thunk for Winsock htons(). Converts a 16-bit value from host byte order to network byte order — used when filling sockaddr_ |
| 0x00432a06 | gethostbyname | stdcall (WSAPI | network | P0 | Import thunk for Winsock gethostbyname(). Resolves a server hostname to a hostent address list prior to connect(). The recursive s |
| 0x00432a0c | closesocket | stdcall (WSAPI | network | P0 | Import thunk for Winsock closesocket(). Releases a socket handle when a connection is dropped or the client exits. The recursive s |
| 0x00432a12 | ioctlsocket | stdcall (WSAPI | network | P0 | Import thunk for Winsock ioctlsocket. The decompile shows a self-named recursive call which is Ghidra's rendering of an indirect j |
| 0x00432a18 | connect | stdcall (WSAPI | network | P0 | Import thunk for Winsock connect(). Establishes a connection to the LOGH VII auth/game server. The recursive self-call is Ghidra's |
| 0x00432a1e | getsockopt | cdecl (IAT thu | network | P0 | Import thunk for the Winsock getsockopt API (reads a socket option). Body is an indirect jump through the import table (rendered a |
| 0x00432a24 | setsockopt | cdecl (IAT thu | network | P0 | Import thunk for the Winsock setsockopt API (sets a socket option). Body is an indirect jump through the import table (rendered as |
| 0x00432a2a | socket | stdcall (WSAPI | network | P0 | Import thunk for Winsock socket(). Creates a new socket endpoint (TCP for the game protocol). The recursive self-call is Ghidra's  |
| 0x00432a30 | WSAGetLastError | stdcall (WSAPI | network | P0 | Import thunk for Winsock WSAGetLastError() at the canonical thunk address. Returns the calling thread's last Winsock error code af |
| 0x00432a36 | shutdown | stdcall (WSAPI | network | P0 | Import thunk for Winsock shutdown(). Disables sends and/or receives on a socket during connection teardown. The recursive self-cal |
| 0x00432a3c | recv | stdcall (WSAPI | network | P0 | Import thunk for Winsock recv(). Reads inbound bytes from the server socket; this is the raw byte source feeding the client's 0x00 |
| 0x00432a42 | send | stdcall (WSAPI | network | P0 | Import thunk for Winsock send(). Writes outbound bytes to the server socket; this is the raw byte sink the client uses to emit enc |
| 0x00432a48 | inet_addr | stdcall (WSAPI | network | P0 | Import thunk for Winsock inet_addr(). Converts a dotted-decimal IPv4 string into a 32-bit network-order address for sockaddr_in.si |
| 0x00432a4e | WSACleanup | stdcall (WSAPI | network | P0 | Import thunk for Winsock WSACleanup(). Terminates use of the Winsock DLL, releasing all resources at client shutdown (paired with  |
| 0x00432a54 | WSAStartup | cdecl (IAT thu | network | P0 | Import thunk for the Winsock WSAStartup API, which initializes the Winsock library for the requested version. Body is an indirect  |
| 0x00432a60 | _memchr | cdecl | crt | P0 | CRT 표준 라이브러리 memchr. _Buf 시작에서 _MaxCount 바이트 안에서 바이트값 _Val의 첫 출현을 찾아 그 포인터를 반환, 없으면 NULL. 정렬되지 않은 선두는 1바이트씩, 정렬 후엔 4바이트(워드) 단위로 0x |
| 0x00432b46 | FUN_00432b46 | thiscall (ecx= | crt | P0 | MSVC C runtime internal scanf core (the classic CRT `_input`/`__tinput` engine). It walks a format string (param_2) one byte at a  |
| 0x00433620 | __allshl | fastcall (CRT  | crt | P0 | MSVC CRT 64-bit logical left-shift helper. Shifts the 64-bit value (held in EDX:EAX, here in_EAX represents the implicit register  |
| 0x00433787 | InitString | thiscall (ecx  | core | P0 | MFC CSimpleException::InitString. Marks the exception's message as initialized (sets flag at this+0xc = 1) and loads the error mes |
| 0x00433abc | FUN_00433abc | thiscall (ecx= | crt | P0 | MSVC C runtime printf/vsnprintf-style format-string output engine (the _output core). It scans a format string param_1 character b |
| 0x00433f6d | CStringList::AddTail | thiscall (ecx= | core | P0 | MFC CStringList::AddTail — appends a CString to the tail of a doubly-linked string list. Allocates a new node via FUN_00433f02(thi |
| 0x0043402e | RemoveAll | thiscall (ecx= | core | P0 | MFC CObList/CPtrList::RemoveAll — 연결 리스트 전체 비우기. 헤드(+4)/테일(+8)/카운트(+0xc)/free 리스트(+0x10) 포인터를 모두 0으로 초기화하고, FUN_004340ab로 노드 블록 풀( |
| 0x004340c1 | CMap<> | thiscall (ecx= | library | P0 | MFC/ATL CMap 컬렉션 생성자(템플릿 다중매치: CMap<void*,...> 또는 CMap<CStringT<wchar_t>,...>). 멤버를 초기화한다: vtable=PTR_FUN_00441e8c, 원소수(+4)=0, 해시테 |
| 0x00434149 | CMapPtrToPtr::RemoveAll (and | thiscall (Ghid | core | P0 | MFC CMap::RemoveAll — empties a hash-map collection. Frees the hash-bucket pointer table (this+4) via FUN_00437caf and NULLs it, z |
| 0x0043436c | thunk_FUN_00434371 | cdecl (no args | ui | P0 | Static one-time initializer thunk that registers the Common Controls drag-list window message 'commctrl_DragListMsg' via RegisterW |
| 0x0043449c | CWnd::`scalar_deleting_destr | thiscall (ecx  | ui | P0 | Compiler-generated scalar deleting destructor for MFC CWnd. Runs the CWnd destructor, then if bit 0 of param_1 is set frees the ob |
| 0x00434701 | Catch@00434701 | cdecl? (MSVC S | crt | P3? | C++ exception-handling catch funclet for an MFC message-dispatch routine. It obtains the current CWinThread via AfxGetThread(), in |
| 0x0043477f | FUN_0043477f | fastcall (ecx= | core | P0 | Reads a comma-separated configuration record from the global config buffer DAT_004515a4 (the lookup key being the code label &LAB_ |
| 0x00434896 | Detach | thiscall (ecx= | ui | P0 | MFC CWnd::Detach — 윈도우 핸들 분리. m_hWnd(this+0x1c)를 보관 후 0이 아니면 스레드상태 임시 맵(FUN_004347a6)에서 FUN_004342b8로 핸들 매핑을 제거하고 m_hWnd 슬롯(this+0 |
| 0x00434a1c | Catch@00434a1c | cdecl? (EH cat | crt | P3? | Exception-handling catch funclet for an MFC window/message routine. Copies four message-related dwords from parent [EBP+8..+0x14]  |
| 0x00434e8a | ~CWnd | thiscall (ecx  | ui | P0 | MFC CWnd::~CWnd destructor (Visual Studio 2003 release library function). Calls a base/prologue helper FUN_00409bd8, installs the  |
| 0x0043542d | Catch@0043542d | MSVC EH catch  | crt | P0 | Compiler-generated catch handler. Performs partial cleanup by calling FUN_0043dd30(1) (resource-release helper, FUN_0043dc10 famil |
| 0x0043561f | AfxFindMessageEntry | stdcall | ui | P0 | MFC AfxFindMessageEntry: linear scan over an AFX_MSGMAP_ENTRY table (24-byte/0x18 stride) to find the handler matching a dispatche |
| 0x004356a3 | FUN_004356a3 | thiscall (MFC  | ui | P0 | This is MFC's CWnd::OnWndMsg — the core window-message dispatcher. It receives a Windows message (msg id at EBP+8, wParam at EBP+0 |
| 0x00435d83 | AfxGetParentOwner | stdcall | ui | P0 | MFC AfxGetParentOwner: resolves the logical parent/owner window of a given HWND. If the HWND maps to a permanent CWnd (FUN_0043483 |
| 0x004362f9 | OnDevModeChange | thiscall (ecx= | ui | P0 | MFC CWnd::OnDevModeChange(char*) handler (WM_DEVMODECHANGE). Resolves the module/thread state via FUN_0043ce6e, and if the active  |
| 0x004363a8 | OnDisplayChange | thiscall (ecx= | ui | P0 | MFC CWnd::OnDisplayChange(uint,long) handler (WM_DISPLAYCHANGE). If this window is the active app frame (FUN_00407b13 == this) it  |
| 0x004365eb | Catch@004365eb | cdecl (compile | crt | P0 | Trivial MSVC structured-exception catch funclet that simply returns the address of its static catch-state data object (&DAT_004366 |
| 0x004365f1 | Catch@004365f1 | cdecl? (EH cat | crt | P3? | Exception-handling catch funclet that emits an MFC assertion/error notification. It loads an object pointer from [EBP-0x1c] and in |
| 0x00436ada | AfxRegisterWithIcon | stdcall | ui | P0 | MFC _AfxRegisterWithIcon helper: prepares a WNDCLASS for registration with a class icon. Stores the lpszClassName (param_2) into t |
| 0x00437472 | CCmdUI | thiscall (ecx= | ui | P0 | MFC CCmdUI default constructor. Installs the CCmdUI vtable PTR_FUN_00441398 and zero-initializes all member fields (m_nID/m_pMenu/ |
| 0x004378c2 | FUN_004378c2 | fastcall (para | crt | P0 | MSVC reference-counted string/COW buffer release helper (basic_string<>::_Tidy / _Decref). param_1 points at a handle whose *param |
| 0x00437c86 | FUN_00437c86 | cdecl (param_1 | crt | P0 | MSVC new-handler malloc retry loop (the classic _nh_malloc / _heap_alloc-with-handler pattern). Calls _malloc(param_1); on success |
| 0x00437d41 | Catch@00437d41 | cdecl? (EH cat | crt | P3? | Worker-thread exception catch funclet. Detaches a CWnd at [EBP-0x50] (CWnd::Detach), then signals failure on the thread's launch h |
| 0x00437de8 | AfxGetThread | stdcall | core | P0 | MFC runtime accessor that returns the CWinThread* for the current thread. It fetches the per-thread MFC module state via AfxGetMod |
| 0x00437e7e | AfxEndThread | stdcall | crt | P0 | MFC 라이브러리 AfxEndThread. 현재 모듈의 스레드 상태에서 활성 CWinThread 객체(pAVar2+4)를 꺼내, 비어있지 않으면 OnIdle/종료 콜백(piVar1[0x15])(1,0)을 호출하고, param_2(bD |
| 0x00438365 | AfxInternalProcessWndProcExc | stdcall | ui | P0 | MFC AfxInternalProcessWndProcException — 윈도우 프로시저 내 예외의 기본 처리. 예외 발생 메시지(param_2->message)가 WM_CREATE(1)이면 -1(창 생성 실패) 반환, WM_PAIN |
| 0x00438710 | FUN_00438710 | cdecl (stack a | crt | P0 | Constructs a C++ exception object on the heap and throws it. It calls FUN_00437c86(0x14) (operator new for a 0x14-byte object), ru |
| 0x00439447 | CDialog::~CDialog | thiscall (ecx= | ui | P0 | MFC CDialog virtual destructor. Restores the CDialog vtable (PTR_FUN_00441c94) on the object, and if member at +0x1c is non-zero ( |
| 0x004396aa | Catch@004396aa | cdecl? (MSVC S | crt | P0 | MFC 예외 처리 catch 펀클릿. 부모 프레임(unaff_EBP)에서 -0x2c 위치의 객체(CException 계열 핸들)를 FUN_004385e8로 해제(Delete)하고, -0x24 위치 객체의 +0x2c 필드를 0xffff |
| 0x0043978a | PreModal | thiscall (ecx= | ui | P0 | MFC CDialog::PreModal. 모달 다이얼로그 표시 직전 준비. 스레드 상태(FUN_0043ce6e)에서 +4가 비어있지 않으면 FUN_0043bd05(0)으로 모달 메시지 펌프/툴팁을 비활성화한다. 부모 윈도우 핸들을 ( |
| 0x004397c4 | PostModal | thiscall (ecx= | ui | P0 | MFC CDialog::PostModal — 모달 다이얼로그 종료 정리(PreModal의 짝). FUN_00434d16(임시맵 재등록 헬퍼) 후 CWnd::Detach로 다이얼로그 윈도우 핸들을 분리한다. 보관된 모달 부모 hWnd( |
| 0x004398ff | Catch@004398ff | cdecl? (MSVC S | crt | P0 | MFC 예외 처리 catch 펀클릿(0x004396aa와 동일 패턴, 프레임 오프셋만 상이). 부모 프레임 -0x24의 CException 객체를 FUN_004385e8로 해제하고, -0x1c 객체의 +0x2c 필드를 0xffffff |
| 0x00439f5f | CStdioFile::`scalar_deleting | thiscall (ecx  | file | P0 | Compiler-generated scalar deleting destructor for MFC CStdioFile. Runs the CStdioFile destructor, then if bit 0 of param_1 is set  |
| 0x0043a014 | ~CStdioFile | thiscall (ecx= | file | P0 | MFC CStdioFile destructor (VS2003). Installs the CStdioFile vtable PTR_FUN_00441de0, and if the file is open (handle at this[4]/+0 |
| 0x0043a608 | Catch@0043a608 | MSVC C++ EH ca | crt | P0 | C++ exception-handling catch funclet. On the catch/unwind path it calls cleanup routine FUN_00437c74 with the argument at EBP+8 (t |
| 0x0043a7bf | Detach | thiscall (ecx= | ui | P0 | MFC GDI/리스트 계열 Detach (CGdiObject/CImageList/CMenu 다중매치). 객체의 핸들(param_1+4)을 로컬에 보관하고, 0이 아니면 핸들↔객체 임시 맵(FUN_0043a71a 스레드상태)에서 FUN |
| 0x0043ad2e | Detach | thiscall (ecx= | render | P0 | MFC CDC::Detach — 디바이스 컨텍스트 핸들 분리. m_hDC(this+4)를 보관 후 0이 아니면 스레드상태 임시 맵(FUN_0043ac70)에서 FUN_004342b8로 매핑 제거한다. 가상함수(vtable+0x14,  |
| 0x0043ad5f | DeleteDC | thiscall (ecx  | render | P0 | MFC CDC::DeleteDC. If the output HDC (this+4) is null, returns 0. Otherwise detaches the HDC from the CDC via Detach (zeroing the  |
| 0x0043ad75 | FUN_0043ad75 | thiscall (ecx  | render | P0 | Destructor for an MFC CDC (device-context wrapper) object. It first runs the base/member sub-destructor (FUN_00409bd8) and recover |
| 0x0043b1e9 | LineTo | thiscall (ecx  | render | P0 | MFC CDC::LineTo wrapper. Draws a line from the current GDI position to (param_1,param_2). If the CDC has a distinct attribute-DC ( |
| 0x0043b2c5 | FID_conflict:~CClientDC | thiscall (ecx= | render | P0 | Shared MFC device-context destructor (FID-collapsed across CClientDC and CWindowDC). Installs the DC vtable PTR_FUN_00441600, deta |
| 0x0043b35d | CPaintDC::`scalar_deleting_d | thiscall (ecx  | render | P0 | Compiler-generated scalar deleting destructor for MFC CPaintDC. Runs the CPaintDC destructor (which calls EndPaint), then if bit 0 |
| 0x0043b379 | ~CPaintDC | thiscall (ecx= | render | P0 | MFC CPaintDC destructor (VS2003). Installs the CPaintDC vtable PTR_FUN_00441678, calls EndPaint with the associated HWND (this+0x1 |
| 0x0043b474 | Detach | thiscall (ecx= | ui | P0 | MFC GDI/리스트 계열 Detach (0x0043a7bf와 동일 코드, 스레드상태 게터만 FUN_0043b3c0). 핸들(param_1+4)을 보관 후 임시 맵에서 FUN_004342b8로 제거, 슬롯을 0으로 비우고 원래 핸들을 |
| 0x0043c33a | FID_conflict:~CHotKeyCtrl | thiscall (ecx= | ui | P0 | Shared MFC control destructor body (FID-collapsed across 21 CWnd-derived control classes: CAnimateCtrl, CButton, CComboBox, CDateT |
| 0x0043c3ae | thunk_FUN_0043c3b3 | cdecl? (썽크, 인자 | core | P0 | 전역 char 플래그 초기화 썽크. FUN_00408510(&LAB_0043c3a3)로 SEH 보호된 콜백(LAB_0043c3a3 코드)을 실행하고 반환값 하위 바이트를 DAT_004515ac에 저장한다. 1회성 환경/능력 판정 결과 |
| 0x0043c3c4 | FillSolidRect | thiscall (ecx  | render | P0 | MFC CDC::FillSolidRect(RECT, COLORREF). Fills the given rectangle with a solid color by setting the DC background color (SetBkColo |
| 0x0043c506 | thunk_FUN_0043c50b | cdecl (no args | core | P0 | Static initializer thunk that resets a 4-DWORD global structure to its sentinel/empty state: two DWORDs set to 0 and two to 0x8000 |
| 0x0043c529 | thunk_FUN_0043c52e | cdecl? (썽크, 인자 | input | P0 | 마우스 휠 메시지 초기화 썽크. GetVersion으로 OS 종류를 판별해, Windows 9x(최상위 비트 set)에서 major==4이거나 NT 계열에서 major==3인 경우(휠 메시지 지원 OS)엔 RegisterWindowM |
| 0x0043c60b | ~CWnd | thiscall | ui | P0 | MFC CWnd destructor. ecx=this. Installs the CWnd vtable PTR_FUN_00440fe0 into *this, then (unless 'this' is one of five static per |
| 0x0043c8ee | thunk_FUN_0043ad75 | cdecl? (EH-ins | render | P0 | MFC CDC destructor thunk with SEH frame setup. Calls FUN_00409bd8 (frame/state setup), installs the CDC vtable (&PTR_FUN_00441588) |
| 0x0043c9e4 | CWinThread | thiscall (ecx= | core | P0 | MFC CWinThread constructor taking a thread proc and parameter (VS2003). Sets up the SEH frame, calls base constructor FUN_00437184 |
| 0x0043ca28 | CWinThread::`scalar_deleting | thiscall (ecx  | core | P0 | Compiler-generated scalar deleting destructor for MFC CWinThread. Runs the CWinThread destructor, then if bit 0 of param_1 is set  |
| 0x0043ca44 | CWinThread::CWinThread | thiscall (ecx= | crt | P0 | MFC CWinThread constructor. Installs the SEH frame (FUN_00409bd8 / ExceptionList save), runs base initialization via FUN_00437184, |
| 0x0043cd60 | thunk_FUN_0043d874 | fastcall (para | ui | P0 | MFC 임시 객체 정리 썽크. *param_1(임시 윈도우/맵 항목 핸들)이 0이 아니고 전역 맵 DAT_004515c4가 유효하면 FUN_0043d57b(맵, *param_1)로 항목을 제거한 뒤, *param_1을 0으로 비운다. |
| 0x0043ce6e | FUN_0043ce6e | cdecl (no args | crt | P0 | Run-once / lazy-init guard helper. Looks up (or inserts) an entry for the table &DAT_004515a4 keyed by the callback LAB_0043c656 v |
| 0x0043ce94 | AfxGetModuleThreadState | stdcall | core | P0 | MFC runtime accessor returning the per-thread AFX_MODULE_THREAD_STATE for the current module/thread. Computes the module state bas |
| 0x0043ceab | Unlock | thiscall (ecx= | core | P0 | MFC/ATL CTypeLibCache::Unlock: decrements the reference/lock count at this+0x20 via InterlockedDecrement. When it reaches zero, re |
| 0x0043cf23 | thunk_FUN_0043cceb | thiscall thunk | ui | P3? | Thunk/destructor body for an MFC document-or-CDialog-like object. Installs vtable PTR_FUN_00441a24, releases the COM/aggregate sub |
| 0x0043d32f | thunk_FUN_0043d334 | cdecl (no args | crt | P0 | Thin thunk that tail-calls FUN_004390a1 with the constant pointer 0x44ab70. The constant is almost certainly a static record/regis |
| 0x0043d7d0 | FUN_0043d7d0 | thiscall | crt | P0 | MSVC CRT 'once-per-thread lazy initializer' / TLS-slot getter (an _Init_thread / __get-once-style helper). ecx=this is a small tok |
| 0x0043d8dd | Catch@0043d8dd | MSVC EH catch  | crt | P0 | Compiler-generated catch handler. Calls FUN_0043dd30(0x10) (same resource-release helper as Catch@0043542d but with selector 0x10, |
| 0x0043db52 | thunk_FUN_0043db57 | cdecl? (썽크, 인자 | core | P0 | 불리언 캐시 초기화 썽크. FUN_0043db2f()의 bool 결과를 CONCAT31(쓰레기상위3바이트, bool)로 합쳐 전역 DAT_00451674에 저장한다. MFC 환경 1회 능력 판정 플래그 캐싱(예: 특정 OS/UI 기능 |
| 0x0043dfbb | GetSectionKey | thiscall (ecx= | file | P0 | MFC CWinApp::GetSectionKey: opens (creating if needed) the registry subkey for an INI section under the application's root registr |
| 0x0043e007 | ~CWinThread | thiscall (ecx= | core | P0 | MFC CWinThread destructor (VS2003). Sets up SEH frame via FUN_00409bd8, restores the vtable pointer to PTR_FUN_00441800, closes th |
| 0x0043e083 | AfxPostQuitMessage | stdcall | core | P0 | MFC AfxPostQuitMessage. Notifies the current CWinThread that it is exiting by calling its virtual at vtable offset +0x54 (if non-n |
| 0x0043e178 | Unwind@0043e178 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Unconditionally destroys the sub-object at member offset +0x40 of the object poin |
| 0x0043e183 | Unwind@0043e183 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Unconditionally destroys the sub-object at member offset +0xa8 of [EBP-0x10] via  |
| 0x0043e191 | Unwind@0043e191 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Unconditionally destroys the sub-object at member offset +0x110 of [EBP-0x10] via |
| 0x0043e19f | Unwind@0043e19f | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Unconditionally destroys the sub-object at member offset +0x178 of [EBP-0x10] via |
| 0x0043e1d8 | Unwind@0043e1d8 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Destroys the sub-object at member offset +0x40 of [EBP-0x10] via destructor FUN_0 |
| 0x0043e1e3 | Unwind@0043e1e3 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Destroys the sub-object at member offset +0xa8 of [EBP-0x10] via destructor FUN_0 |
| 0x0043e1f1 | Unwind@0043e1f1 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Destroys the sub-object at member offset +0x110 of [EBP-0x10] via destructor FUN_ |
| 0x0043e1ff | Unwind@0043e1ff | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Destroys the sub-object at member offset +0x178 of [EBP-0x10] via destructor FUN_ |
| 0x0043e2f0 | Unwind@0043e2f0 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Unconditionally destroys the sub-object at member offset +0x1c of the object poin |
| 0x0043e310 | Unwind@0043e310 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet, identical in behavior to Unwind@0043e2f0: destroys the sub-object at member offse |
| 0x0043e31b | Unwind@0043e31b | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Destroys the sub-object at member offset +0xd0 of [EBP-0x14] via FUN_00403110 (th |
| 0x0043e448 | Unwind@0043e448 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Destroys the sub-object at member offset +0xc of [EBP-0x14] via FUN_004041e0 (fas |
| 0x0043e848 | Unwind@0043e848 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Destroys the sub-object at member offset +0x5c of [EBP-0x10] via FUN_00401120 (cl |
| 0x0043e86f | Unwind@0043e86f | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Destroys the sub-object at member offset +0x2b8 of [EBP-0x10] via destructor FUN_ |
| 0x0043e87d | Unwind@0043e87d | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Destroys the sub-object at member offset +0x340 of [EBP-0x10] via FUN_00404790 (f |
| 0x0043e88b | Unwind@0043e88b | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Destroys the sub-object at member offset +0x35c of [EBP-0x10] via FUN_00402240 (t |
| 0x0043e899 | Unwind@0043e899 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. Destroys the sub-object at member offset +0x464 of [EBP-0x10] via FUN_00407860 (c |
| 0x0043e8c8 | Unwind@0043e8c8 | cdecl (compile | crt | P0 | MSVC C++ exception-handling unwind funclet. During stack unwinding it loads the object pointer saved at [EBP-0x14] and calls the d |
| 0x0043e8ef | Unwind@0043e8ef | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Loads the object at [EBP-0x14] and invokes cleanup FUN_00403960 on its member at offset +0x2b8. Com |
| 0x0043e8fd | Unwind@0043e8fd | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Loads the object at [EBP-0x14] and invokes cleanup FUN_00404790 on its member at offset +0x340. Com |
| 0x0043e90b | Unwind@0043e90b | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Loads the object at [EBP-0x14] and invokes cleanup FUN_00402240 on its member at offset +0x35c. Com |
| 0x0043e919 | Unwind@0043e919 | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Loads the object at [EBP-0x14] and invokes cleanup FUN_00407860 on its member at offset +0x464. Com |
| 0x0043ec18 | Unwind@0043ec18 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. If the unwind-state bit [EBP-0x14]&1 is set, cleans up the object passed as the p |
| 0x0043ee3c | Unwind@0043ee3c | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Differs from the others in that the object pointer is saved at [EBP-0x10] (not -0x14) and the clean |
| 0x0043eee0 | Unwind@0043eee0 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. If [EBP-0x10]&1 is set, cleans up the object passed as the parent's first argumen |
| 0x0043ef28 | Unwind@0043ef28 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. If [EBP-0x14]&1 is set, cleans up the object passed as the parent's first argumen |
| 0x0043ef54 | Unwind@0043ef54 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet, identical in behavior to Unwind@0043ef28: if [EBP-0x14]&1 is set, cleans up the p |
| 0x0043f224 | Unwind@0043f224 | MSVC SEH unwin | crt | P0 | SEH/C++ destructor-unwind funclet. Conditionally runs a cleanup only if the parent's local destructor-state bitmask at EBP-0x10 ha |
| 0x0043f248 | Unwind@0043f248 | MSVC SEH unwin | crt | P0 | SEH/C++ destructor-unwind funclet, identical in form to Unwind@0043f224. If parent local flags at EBP-0x10 have bit0 set, it calls |
| 0x0043f26c | Unwind@0043f26c | MSVC SEH unwin | crt | P0 | SEH/C++ destructor-unwind funclet. If parent local flags at EBP-0x10 have bit0 set, it calls FUN_00414897 on object field (*(EBP-0 |
| 0x0043f290 | Unwind@0043f290 | MSVC SEH unwin | crt | P0 | SEH/C++ destructor-unwind funclet, identical in form to Unwind@0043f26c. If parent local flags at EBP-0x10 have bit0 set, it calls |
| 0x0043f3f4 | Unwind@0043f3f4 | MSVC SEH unwin | crt | P0 | SEH/C++ destructor-unwind funclet. If parent local flags at EBP-0x10 have bit0 set, it calls a different cleanup routine FUN_00415 |
| 0x0043f418 | Unwind@0043f418 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. When an exception propagates through the parent frame and the unwind-state bit at |
| 0x0043f43c | Unwind@0043f43c | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet. If [EBP-0x10]&1 is set, destroys the member at offset +8 of the object pointed to |
| 0x0043f460 | Unwind@0043f460 | MSVC EH unwind | crt | P0 | Compiler-generated stack-unwind cleanup funclet identical in shape to Unwind@0043f43c: if [EBP-0x10]&1 is set, destroys the member |
| 0x0043f540 | Unwind@0043f540 | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Loads the object at [EBP-0x10] and calls FUN_0041d5a0 on its member at offset +0x18. Compiler-gener |
| 0x0043f54b | Unwind@0043f54b | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Loads the object at [EBP-0x10] and calls FUN_0041d5d0 on its member at offset +0x28. Compiler-gener |
| 0x0043f560 | Unwind@0043f560 | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Loads the object at [EBP-0x10] and calls FUN_0041d5a0 on its member at offset +0x18 (same target/of |
| 0x0043fec0 | Unwind@0043fec0 | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Loads the object at [EBP-0x10] and calls FUN_0041d5a0 on its member at offset +0x24. Compiler-gener |
| 0x0043fee0 | Unwind@0043fee0 | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Identical body to Unwind@0043fec0: loads the object at [EBP-0x10] and calls FUN_0041d5a0 on its mem |
| 0x0043ff00 | Unwind@0043ff00 | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Identical body: loads the object at [EBP-0x10] and calls FUN_0041d5a0 on its member at offset +0x24 |
| 0x0043ff20 | Unwind@0043ff20 | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Identical body: loads the object at [EBP-0x10] and calls FUN_0041d5a0 on its member at offset +0x24 |
| 0x0043ff60 | Unwind@0043ff60 | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Loads the object at [EBP-0x10] and calls FUN_00431950 on its member at offset +0xc. Compiler-genera |
| 0x0043ff80 | Unwind@0043ff80 | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Identical body to Unwind@0043ff60: loads the object at [EBP-0x10] and calls FUN_00431950 on its mem |
| 0x0043ff8b | Unwind@0043ff8b | cdecl (EH unwi | crt | P0 | MSVC exception unwind funclet. Loads the object at [EBP-0x10] and calls FUN_00431cf0 on its member at offset +0x44. Compiler-gener |

> verifier 정정 파일 없음(이 웨이브는 verifier가 세션한도로 일부/전부 실패했거나 구버전 워크플로). confidence는 maker self-flagged 기준.
