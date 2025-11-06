# viberank - 연구실 리더보드

Claude Code 사용량 추적 및 리더보드 시스템으로, 개인 사용자와 연구실 전체 사용량을 관리할 수 있습니다.

## 📋 시스템 개요

viberank는 두 가지 주요 모드로 운영됩니다:

### 1. 개인 사용자 모드 (기본)
- Claude Code 사용자가 개인 사용량을 제출하고 글로벌 순위를 확인
- GitHub OAuth 기반 인증
- 프로필 페이지 및 사용량 차트 제공

### 2. 연구실 모드 (신규 추가)
- 연구실 전체의 Claude Code 사용량 집계
- 연구원별 사용량 추적 및 순위 제공
- GitHub OAuth 없이 간단한 헤더 인증으로 제출 가능

## 🏗️ 전체 시스템 구조

```
viberank-connectomelab/
├── 프론트엔드 (Next.js 15)
│   ├── src/
│   │   ├── app/              # 페이지 라우팅
│   │   ├── components/       # React 컴포넌트
│   │   ├── lib/              # 유틸리티
│   │   └── types/            # TypeScript 타입
│   └── public/               # 정적 파일
│
├── 백엔드 (Convex 서버리스)
│   └── convex/
│       ├── submissions.ts    # 제출 데이터 처리
│       ├── schema.ts         # 데이터베이스 스키마
│       ├── stats.ts          # 통계 계산
│       └── admin.ts          # 관리 기능
│
└── 패키지
    ├── viberank-cli/         # CLI 제출 도구
    └── viberank-mcp-server/  # MCP 서버 통합
```

## 🔄 데이터 흐름

```
사용자/연구원
    ↓
[CLI / curl / 웹 업로드]
    ↓
API 엔드포인트 (/api/submit 또는 /api/lab/submit)
    ↓
데이터 검증 (토큰 계산, 날짜, 음수 체크)
    ↓
Convex 데이터베이스 저장
    ↓
실시간 리더보드 업데이트
```

## 🎯 연구실 모드 구현 내역

### 새로 추가된 기능

#### 1. 연구실 제출 API
```bash
curl -X POST http://localhost:3001/api/lab/submit \
  -H "Content-Type: application/json" \
  -H "X-Researcher-Username: hong-gildong" \
  -H "X-Researcher-Department: AI Lab" \
  -d @cc.json
```

#### 2. Convex 쿼리 함수들
- **labLeaderboard.getLeaderboard** - 연구실 전체 순위 조회
- **labLeaderboard.getLeaderboardByDateRange** - 기간별 필터링
- **labResearchers.getProfile** - 연구원 개인 프로필
- **labLeaderboard.getLabStats** - 연구실 통계 (총 사용량, 평균 등)

#### 3. 데이터 검증 시스템
- ✅ 토큰 계산 검증 (input + output + cache = total)
- ✅ 날짜 형식 검증 (미래 날짜 차단)
- ✅ 음수 값 체크
- ✅ 비정상적 사용량 플래그

#### 4. 스마트 데이터 병합
- 중복 제출 자동 병합 (날짜별)
- 기존 데이터 손실 없이 업데이트
- 일별 breakdown 유지

#### 5. 연구실 통계 분석
- 총 사용 토큰 및 비용
- 활동 연구원 수
- 모델별 사용 분석 (Claude 3.5 Sonnet, Opus 등)
- 날짜 범위별 필터링 (7일, 30일, 전체)

### 구현 완료된 컴포넌트

#### Backend (Convex)
```typescript
// 스키마 (예상)
labSubmissions {
  researcherUsername: string,
  department: string,
  totalTokens: number,
  totalCost: number,
  dateRange: { start: string, end: string },
  dailyBreakdown: array,
  submittedAt: number
}

labResearchers {
  username: string,
  department: string,
  totalSubmissions: number,
  totalTokens: number,
  totalCost: number
}
```

#### API Routes
- `/api/lab/submit` - 연구실 제출 엔드포인트
- `/api/lab/stats` - 연구실 통계
- `/api/lab/leaderboard` - 연구실 순위

#### 헬퍼 스크립트
```bash
./submit-lab-usage.sh
```
- ccusage 자동 실행
- 헤더 자동 설정
- 로컬 API로 제출

## 📊 기술 스택

### Frontend
- **Framework**: Next.js 15.3.4 (App Router + Turbopack)
- **UI Library**: React 19
- **Styling**: Tailwind CSS 4
- **Animation**: Framer Motion
- **Charts**: Recharts
- **Language**: TypeScript 5.0

### Backend
- **Database**: Convex (실시간, 서버리스)
- **Authentication**: NextAuth.js + GitHub OAuth (개인 모드)
- **API**: Next.js API Routes

### DevOps
- **Package Manager**: pnpm 10.12.4
- **Runtime**: Node.js 18+
- **Deployment**: Vercel (추천)

## 🚀 사용 방법

### 개인 사용자 제출

#### Option 1: CLI (추천)
```bash
npx viberank
```

#### Option 2: curl
```bash
npx ccusage@latest --json > cc.json
GITHUB_USER=$(git config user.name)

curl -X POST https://www.viberank.app/api/submit \
  -H "Content-Type: application/json" \
  -H "X-GitHub-User: $GITHUB_USER" \
  -d @cc.json
```

### 연구실 사용량 제출

```bash
# 1. 사용량 데이터 생성
npx ccusage@latest --json > cc.json

# 2. 연구실 API로 제출
curl -X POST http://localhost:3001/api/lab/submit \
  -H "Content-Type: application/json" \
  -H "X-Researcher-Username: your-username" \
  -H "X-Researcher-Department: Your Lab Name" \
  -d @cc.json

# 또는 헬퍼 스크립트 사용
./submit-lab-usage.sh
```

## 💡 주요 차이점: 개인 vs 연구실 모드

| 기능 | 개인 모드 | 연구실 모드 |
|------|----------|------------|
| **인증** | GitHub OAuth 필수 | 간단한 헤더 인증 |
| **제출 방법** | npx viberank | curl + 헤더 |
| **데이터 범위** | 개인 사용량 | 연구실 전체 집계 |
| **프로필** | GitHub 기반 | 연구원 이름 기반 |
| **순위** | 글로벌 리더보드 | 연구실 내부 순위 |
| **통계** | 개인 사용 패턴 | 연구실 전체 통계 |

## 🔧 개발 환경 설정

### 1. 설치
```bash
git clone https://github.com/YOUR_ORG/viberank-connectomelab.git
cd viberank-connectomelab
pnpm install
```

### 2. 환경 변수 설정
```bash
cp .env.example .env.local
```

`.env.local` 파일 설정:
```env
# Convex
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# NextAuth (개인 모드용)
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=your-secret-here

# GitHub OAuth (개인 모드용 - 선택사항)
GITHUB_ID=your-github-oauth-app-id
GITHUB_SECRET=your-github-oauth-app-secret
```

### 3. Convex 설정
```bash
npx convex dev
```

### 4. 개발 서버 실행
```bash
pnpm dev
```

http://localhost:3001 에서 확인 가능

## 📝 구현 발자취

### Phase 1: 기본 시스템 (완료)
- ✅ 개인 사용자 제출 시스템
- ✅ GitHub OAuth 인증
- ✅ 글로벌 리더보드
- ✅ 프로필 페이지
- ✅ 사용량 차트

### Phase 2: 데이터 검증 (완료)
- ✅ 토큰 계산 검증
- ✅ 날짜 검증
- ✅ 음수 값 차단
- ✅ 비정상 사용량 플래그

### Phase 3: 성능 최적화 (완료)
- ✅ Convex 쿼리 최적화
- ✅ 페이지네이션
- ✅ Rate limiting
- ✅ 캐싱 전략

### Phase 4: 연구실 모드 (진행 중) 🔄
- ✅ 연구실 제출 API 설계
- ✅ Convex 쿼리 함수 설계
- ✅ 데이터 검증 시스템 설계
- ✅ 통계 분석 로직 설계
- ⏳ 프론트엔드 UI 구현
- ⏳ 테스트 및 검증
- ⏳ Docker 프로덕션 배포

### Phase 5: 추가 기능 (계획)
- ⏳ 프론트엔드 연구실 테마 커스터마이징
- ⏳ GitHub OAuth 제거 옵션
- ⏳ Docker Compose 설정
- ⏳ 연구실별 대시보드

## 🧪 테스트

### 로컬 테스트
```bash
# 연구실 제출 테스트
./submit-lab-usage.sh

# 프로필 확인
curl http://localhost:3001/api/lab/profile?username=hong-gildong

# 리더보드 확인
curl http://localhost:3001/api/lab/leaderboard

# 통계 확인
curl http://localhost:3001/api/lab/stats
```

## 🔒 보안 고려사항

### 개인 모드
- GitHub OAuth로 사용자 인증
- 세션 기반 보안
- ccusage 도구 검증

### 연구실 모드
- 헤더 기반 간단 인증 (연구실 내부용)
- Rate limiting으로 스팸 방지
- 데이터 검증으로 조작 방지
- 필요시 API 키 추가 가능

## 📚 참고 자료

- [viberank 공식 GitHub](https://github.com/sculptdotfun/viberank)
- [Convex 문서](https://docs.convex.dev)
- [Next.js 15 문서](https://nextjs.org/docs)
- [ccusage 도구](https://github.com/ryoppippi/ccusage)

## 🤝 기여 방법

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📄 라이선스

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일 참조

---

**Made with 🧡 for Connectome Lab**
