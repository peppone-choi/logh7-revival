# LOGH VII - 계정 회원가입 포털

게임 클라이언트에는 회원가입 화면이 없고 로그인 화면만 있습니다. 이 포털은 로컬에서 여는
stdlib-only 웹 폼이며, 플레이어가 계정 ID와 비밀번호를 입력하면 인증 서버가 읽는 동일한
`--account-db` 계정 DB에 계정을 등록합니다. 기본 배포 경로는 SQLite(`accounts.sqlite`)입니다.

## 동작 방식

- `serve.py`는 Python 표준 라이브러리 `http.server`로 실행되는 작은 웹 서버입니다.
- 등록 요청은 Node admin CLI로 위임합니다:
  `node src/server/logh7-server.mjs admin create <id> --password-stdin --account-db <db>`
- 비밀번호는 프로세스 명령행에 남기지 않고 stdin으로만 전달합니다.
- 이 CLI가 `createAccountRegistry`의 scrypt salted hashing과 `buildGin7Credential`의 GIN7
  credential blob 생성을 재사용합니다. 포털은 hashing이나 credential encoding을 Python에서
  다시 구현하지 않습니다.

여기서 등록한 계정은 같은 계정 ID와 비밀번호로 실제 클라이언트 로그인에 사용할 수 있습니다.

## 실행

저장소 루트에서 실행하세요.

```powershell
python tools/standalone/signup-portal/serve.py --account-db logh7-runtime/state/accounts.sqlite
```

또는 `tools/standalone/signup-portal/start.bat`를 더블클릭하면 이 폴더 옆의 `accounts.sqlite`를
기본 계정 DB로 사용합니다.

인증 서버도 같은 파일을 보도록 실행합니다.

```powershell
node src/server/logh7-server.mjs serve-auth --account-db logh7-runtime/state/accounts.sqlite
```

인증 서버는 시작할 때 계정 DB를 읽습니다. 클라이언트 로그인 전에 이 포털에서 계정을 먼저
등록하세요. 운영 기본은 SQLite이며, JSON 경로는 개발 호환용으로만 남겨둡니다.

## 요구사항

- PATH에 등록된 Python 3
- PATH에 등록된 Node.js
