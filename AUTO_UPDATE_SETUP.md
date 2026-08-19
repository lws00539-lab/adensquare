# 아덴 시세 자동 업데이트 설정 방법

매일 자동으로 아덴 시세를 가져와서 사이트에 반영하는 기능입니다.
`GitHub Actions`(무료, 하루 1회 스케줄)가 `scripts/update-aden-price.js`를
실행해서 `Firebase`에 값을 저장하고, 사이트는 그 값을 실시간으로 읽어옵니다.

## 준비물
- GitHub 계정 (이 프로젝트를 올릴 저장소)
- 이미 쓰고 계신 Firebase 프로젝트 (auth.js에 설정되어 있는 그 프로젝트)

## 설정 순서

### 1. 이 폴더 전체를 GitHub 저장소에 올리기
`adensquare_v243` 폴더 전체(코드 + `.github/workflows` + `scripts` 포함)를
GitHub 저장소에 push 하세요. `.github/workflows/update-aden-price.yml`
파일이 저장소 안에 있어야 GitHub Actions가 인식합니다.

### 2. Firebase 서비스 계정 키 발급
1. [Firebase 콘솔](https://console.firebase.google.com/) → 프로젝트 선택
2. ⚙️ 프로젝트 설정 → **서비스 계정** 탭
3. **새 비공개 키 생성** 클릭 → JSON 파일 다운로드
4. 이 JSON 파일 내용을 통째로 복사해두세요 (다음 단계에서 붙여넣습니다)

### 3. Realtime Database 주소 확인
Firebase 콘솔 → Realtime Database 페이지 상단에 나오는 주소를 복사하세요.
보통 이런 형태입니다:
`https://프로젝트이름-default-rtdb.asia-southeast1.firebasedatabase.app`

### 4. GitHub 저장소에 Secrets 등록
저장소 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

두 개를 등록합니다:
| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | 2번에서 복사한 JSON 파일 내용 전체 |
| `FIREBASE_DATABASE_URL` | 3번에서 복사한 Database 주소 |

### 5. 정상 작동 확인
1. 저장소 → **Actions** 탭 → 왼쪽에서 "아덴 시세 매일 업데이트" 선택
2. **Run workflow** 버튼으로 수동 실행해서 테스트
3. 초록색 체크가 뜨면 성공 — Firebase Realtime Database에 `adenPrice` 노드가 생겼는지 확인
4. 사이트에서 "아덴시세" 메뉴를 열어 값이 표시되는지 확인

이후로는 **매일 한국시간 오전 9시**에 자동으로 실행됩니다.
(스케줄을 바꾸고 싶으면 `.github/workflows/update-aden-price.yml`의
`cron: '0 0 * * *'` 부분을 수정하세요 — cron은 UTC 기준입니다.)

## 참고 / 주의사항
- 데이터 출처는 `adena.kr`이며, 이 사이트가 아이템베이·바로템·아이템매니아
  3곳의 최저가를 모아서 보여주는 걸 그대로 가져옵니다.
- adena.kr이 페이지 구조(HTML)를 바꾸면 스크립트의 표 파싱 부분
  (`scripts/update-aden-price.js`의 `fetchServerPrices` 함수)이
  깨질 수 있습니다. Actions 탭에서 실패(빨간 X)가 뜨면 저에게 다시
  말씀해 주시면 셀렉터를 다시 맞춰드릴게요.
- 이 스크립트는 개인/커뮤니티 참고용 데이터 수집이 목적입니다.
  adena.kr의 이용약관을 한 번 확인해 보시는 걸 권장드려요.
- 사이트 쪽은 Firebase에 값이 없거나 아직 한 번도 실행되지 않았을 때는
  기존에 넣어드렸던 고정값(폴백)을 그대로 보여주므로, 설정 전에도
  화면이 비어 보이지 않습니다.
