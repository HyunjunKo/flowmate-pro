# FlowMate Pro ⚡

노코드 워크플로우 자동화 플랫폼 — 한국 서비스 특화

> 카카오톡, 네이버, Gmail, Slack, Google Sheets를 드래그 앤 드롭으로 연결해 자동화 워크플로우를 만드세요.  
> 코딩 지식 없이도 누구나 사용할 수 있습니다.

---

## 주요 기능

- **노드 기반 편집기** — React Flow 기반 드래그 앤 드롭 인터페이스
- **한국 서비스 연동** — 카카오톡 메시지, 카카오 알림톡, 네이버 서비스
- **글로벌 서비스 연동** — Gmail, Slack, Google Sheets, Google Calendar
- **AI 노드** — Claude 기반 텍스트 생성, 요약, 번역, 감정 분석
- **흐름 제어** — 조건 분기, 지연(Delay), 변수 전달(`{{node_id.field}}`)
- **실행 모니터링** — 노드별 실행 상태 및 입출력 실시간 확인
- **OAuth 2.0** — 모든 서비스를 클릭 한 번으로 안전하게 연결

---

## 기술 스택

| 구분 | 기술 |
|---|---|
| **프론트엔드** | Next.js 16 (App Router), TypeScript, Tailwind CSS, React Flow |
| **백엔드** | FastAPI (Python 3.9), Uvicorn |
| **데이터베이스** | Supabase (PostgreSQL + Auth + RLS) |
| **AI** | Anthropic Claude (claude-haiku) |
| **보안** | Fernet 암호화, JWT, Row Level Security |

---

## 프로젝트 구조

```
flowmate-pro/
├── frontend/                  # Next.js 16 App
│   └── src/
│       ├── app/
│       │   ├── dashboard/
│       │   │   ├── page.tsx              # 대시보드 홈
│       │   │   ├── workflows/[id]/       # 워크플로우 편집기
│       │   │   └── integrations/         # 서비스 연동 관리
│       │   ├── oauth/                    # OAuth 콜백 (kakao/naver/google/slack)
│       │   └── login/                    # 로그인 페이지
│       ├── components/workflow/
│       │   ├── WorkflowEditor.tsx        # 메인 편집기 (React Flow)
│       │   ├── NodePanel.tsx             # 노드 카탈로그 패널
│       │   ├── NodeSettingsPanel.tsx     # 노드 설정 폼 (JSON Schema 기반)
│       │   ├── ExecutionPanel.tsx        # 실행 모니터링 패널
│       │   ├── EditorToolbar.tsx         # 저장/실행 툴바
│       │   └── CustomNode.tsx            # 커스텀 노드 컴포넌트
│       └── lib/
│           ├── api/                      # API 클라이언트
│           └── supabase/                 # Supabase 클라이언트
│
├── backend/                   # FastAPI App
│   └── app/
│       ├── api/v1/endpoints/
│       │   ├── workflows.py              # 워크플로우 CRUD
│       │   ├── executions.py             # 실행 관리
│       │   └── integrations.py           # OAuth 토큰 교환 + 연동 관리
│       ├── services/
│       │   ├── executor.py               # 워크플로우 실행 엔진 (위상 정렬)
│       │   └── integrations/
│       │       ├── token_manager.py      # 암호화 토큰 조회 + 자동 갱신
│       │       ├── kakao.py              # 카카오톡 API
│       │       ├── gmail.py              # Gmail API
│       │       ├── slack.py              # Slack API
│       │       └── google_sheets.py      # Google Sheets API
│       ├── core/
│       │   ├── config.py                 # 환경 변수 설정
│       │   └── security.py               # 암호화 / JWT
│       └── db/
│           └── supabase.py               # Supabase 클라이언트
│
├── supabase/migrations/       # DB 마이그레이션
└── schema.sql                 # 전체 스키마 (참고용)
```

---

## 로컬 개발 환경 설정

### 사전 준비

- Node.js 20+
- Python 3.9+
- Supabase 프로젝트 ([supabase.com](https://supabase.com))

### 1. 저장소 클론

```bash
git clone https://github.com/HyunjunKo/flowmate-pro.git
cd flowmate-pro
```

### 2. 데이터베이스 초기화

Supabase 대시보드 → SQL Editor에서 순서대로 실행:

```
supabase/migrations/20260424000000_initial_schema.sql
supabase/migrations/20260425000001_seed_node_catalog.sql
```

### 3. 백엔드 설정

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

`backend/.env` 파일 생성:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-32-byte-encryption-key!!
ALLOWED_ORIGINS=["http://localhost:3000"]
ANTHROPIC_API_KEY=your_anthropic_key

# OAuth 앱 키
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
```

백엔드 실행:

```bash
uvicorn app.main:app --reload --port 8000
```

API 문서: [http://localhost:8000/docs](http://localhost:8000/docs)

### 4. 프론트엔드 설정

```bash
cd frontend
npm install
```

`frontend/.env.local` 파일 생성:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

# OAuth 앱 키 (각 플랫폼 개발자 콘솔에서 발급)
NEXT_PUBLIC_KAKAO_CLIENT_ID=
NEXT_PUBLIC_NAVER_CLIENT_ID=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
NEXT_PUBLIC_SLACK_CLIENT_ID=
```

프론트엔드 실행:

```bash
npm run dev
```

→ [http://localhost:3000](http://localhost:3000)

---

## OAuth 앱 등록 가이드

서비스 연동을 위해 각 플랫폼에서 앱을 등록하고 키를 발급받아야 합니다.

| 서비스 | 개발자 콘솔 | Redirect URI |
|---|---|---|
| 카카오 | [developers.kakao.com](https://developers.kakao.com) | `http://localhost:3000/oauth/kakao` |
| 네이버 | [developers.naver.com](https://developers.naver.com) | `http://localhost:3000/oauth/naver` |
| Google | [console.cloud.google.com](https://console.cloud.google.com) | `http://localhost:3000/oauth/google` |
| Slack | [api.slack.com/apps](https://api.slack.com/apps) | `http://localhost:3000/oauth/slack` |

**Google API 활성화 필요 항목:** Gmail API, Google Sheets API, Google Calendar API

---

## 사용 가능한 노드

### 트리거
| 노드 | 설명 |
|---|---|
| 수동 실행 | 버튼 클릭으로 즉시 시작 |
| 스케줄 | 정해진 시간에 자동 실행 |
| 웹훅 수신 | 외부 이벤트로 자동 시작 |

### 한국 서비스
| 노드 | 설명 |
|---|---|
| 카카오톡 메시지 | 나에게 메시지 전송 |
| 카카오 알림톡 | 비즈니스 알림톡 발송 |

### 이메일 / 메시지
| 노드 | 설명 |
|---|---|
| Gmail 발송 | HTML/텍스트 이메일 전송 |
| Slack 메시지 | 채널/DM 메시지 전송 |

### 생산성
| 노드 | 설명 |
|---|---|
| Google Sheets 행 추가 | 스프레드시트에 데이터 기록 |
| Google Sheets 행 가져오기 | 스프레드시트 데이터 읽기 |

### AI (Claude 기반)
| 노드 | 설명 |
|---|---|
| 텍스트 생성 | 프롬프트로 콘텐츠 생성 |
| 요약 | 긴 텍스트를 핵심만 요약 |
| 번역 | 다국어 번역 |
| 감정 분석 | 긍정/부정/중립 분류 |

### 흐름 제어 / 변환
| 노드 | 설명 |
|---|---|
| 조건 분기 | 조건에 따라 다른 경로 실행 |
| 지연 | 일정 시간 후 다음 노드 실행 |
| 텍스트 변환 | 대소문자, 공백 제거 등 |
| 날짜 포맷 | 날짜 형식 변환 |

---

## 노드 간 변수 전달

노드 설정에서 `{{node_id.field}}` 형태로 이전 노드의 출력값을 참조할 수 있습니다.

```
예시:
  AI 텍스트 생성 노드의 출력 → Gmail 본문에 삽입
  설정값: {{ai_node_1.text}}
```

---

## 배포

### 프론트엔드 — Vercel

```bash
cd frontend
npx vercel --prod
```

환경 변수를 Vercel 대시보드에 동일하게 설정하고, OAuth Redirect URI를 프로덕션 도메인으로 업데이트하세요.

### 백엔드 — Railway

```bash
# railway.toml 이미 포함
railway up
```

---

## 라이선스

MIT License

---

<div align="center">
  <sub>Built with ❤️ for Korean users · Powered by Anthropic Claude</sub>
</div>
