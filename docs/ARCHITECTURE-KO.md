# Viberank 시스템 아키텍처

## 🏛️ 전체 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│                      클라이언트 계층                           │
├─────────────────────────────────────────────────────────────┤
│  • CLI 도구 (npx viberank)                                   │
│  • MCP Server (Claude Desktop 통합)                          │
│  • 웹 브라우저 (Next.js 프론트엔드)                            │
│  • curl / API 클라이언트                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    API 게이트웨이 계층                         │
├─────────────────────────────────────────────────────────────┤
│  Next.js API Routes                                         │
│  ┌─────────────────┬──────────────────┐                    │
│  │ 개인 모드         │   연구실 모드      │                    │
│  │ /api/submit     │   /api/lab/submit │                    │
│  │ /api/profile    │   /api/lab/profile│                    │
│  │ /api/stats      │   /api/lab/stats  │                    │
│  └─────────────────┴──────────────────┘                    │
│                                                             │
│  • 데이터 검증                                               │
│  • Rate Limiting                                           │
│  • 인증/인가 (OAuth / Header-based)                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    비즈니스 로직 계층                          │
├─────────────────────────────────────────────────────────────┤
│  Convex Serverless Functions                               │
│  ┌────────────────────────────────────────────────┐        │
│  │  submissions.ts                                │        │
│  │  • 데이터 병합 로직                              │        │
│  │  • 중복 제거                                    │        │
│  │  • 일별 breakdown 계산                          │        │
│  └────────────────────────────────────────────────┘        │
│  ┌────────────────────────────────────────────────┐        │
│  │  stats.ts                                      │        │
│  │  • 리더보드 계산                                 │        │
│  │  • 순위 결정                                    │        │
│  │  • 통계 집계                                    │        │
│  └────────────────────────────────────────────────┘        │
│  ┌────────────────────────────────────────────────┐        │
│  │  admin.ts                                      │        │
│  │  • 플래그 관리                                   │        │
│  │  • 스팸 제거                                    │        │
│  └────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      데이터 계층                              │
├─────────────────────────────────────────────────────────────┤
│  Convex Database (실시간, 서버리스)                           │
│  ┌──────────────────┬──────────────────────┐              │
│  │  개인 스키마       │   연구실 스키마         │              │
│  ├──────────────────┼──────────────────────┤              │
│  │  submissions     │   labSubmissions     │              │
│  │  profiles        │   labResearchers     │              │
│  └──────────────────┴──────────────────────┘              │
│                                                             │
│  • 자동 인덱싱                                               │
│  • 실시간 쿼리                                               │
│  • 트랜잭션 지원                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📊 데이터베이스 스키마

### 개인 모드 스키마

#### submissions 테이블
```typescript
{
  _id: Id<"submissions">,
  username: string,                    // 사용자 이름
  githubUsername?: string,             // GitHub 아이디
  githubName?: string,                 // GitHub 표시 이름
  githubAvatar?: string,               // GitHub 아바타 URL

  // 집계 데이터
  totalTokens: number,                 // 총 토큰 사용량
  totalCost: number,                   // 총 비용 ($)
  inputTokens: number,                 // 입력 토큰
  outputTokens: number,                // 출력 토큰
  cacheCreationTokens: number,         // 캐시 생성 토큰
  cacheReadTokens: number,             // 캐시 읽기 토큰

  // 기간 정보
  dateRange: {
    start: string,                     // YYYY-MM-DD
    end: string                        // YYYY-MM-DD
  },

  // 모델 정보
  modelsUsed: string[],                // ["claude-3-5-sonnet", ...]

  // 일별 상세 데이터
  dailyBreakdown: Array<{
    date: string,                      // YYYY-MM-DD
    inputTokens: number,
    outputTokens: number,
    cacheCreationTokens: number,
    cacheReadTokens: number,
    totalTokens: number,
    totalCost: number,
    modelsUsed: string[]
  }>,

  // 메타데이터
  submittedAt: number,                 // Unix timestamp
  verified: boolean,                   // 검증 완료 여부
  source?: "cli" | "oauth",            // 제출 방법
  claimedBy?: Id<"profiles">,          // 프로필 ID
  flaggedForReview?: boolean,          // 리뷰 플래그
  flagReasons?: string[]               // 플래그 사유
}

// 인덱스
- by_total_cost: [totalCost]
- by_total_tokens: [totalTokens]
- by_submitted_at: [submittedAt]
- by_username: [username]
- by_github_username: [githubUsername]
- by_flagged: [flaggedForReview, submittedAt]
```

#### profiles 테이블
```typescript
{
  _id: Id<"profiles">,
  username: string,                    // 고유 사용자명
  githubUsername?: string,             // GitHub 계정
  githubName?: string,                 // 표시 이름
  bio?: string,                        // 자기소개
  avatar?: string,                     // 프로필 이미지
  totalSubmissions: number,            // 총 제출 횟수
  bestSubmission?: Id<"submissions">,  // 최고 제출 ID
  createdAt: number                    // Unix timestamp
}

// 인덱스
- by_username: [username]
- by_github: [githubUsername]
```

### 연구실 모드 스키마 (설계안)

#### labSubmissions 테이블
```typescript
{
  _id: Id<"labSubmissions">,
  researcherUsername: string,          // 연구원 이름
  department: string,                  // 소속 부서/랩

  // 집계 데이터 (개인 모드와 동일)
  totalTokens: number,
  totalCost: number,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,

  // 기간 정보
  dateRange: {
    start: string,
    end: string
  },

  // 모델 정보
  modelsUsed: string[],

  // 일별 breakdown
  dailyBreakdown: Array<{
    date: string,
    inputTokens: number,
    outputTokens: number,
    cacheCreationTokens: number,
    cacheReadTokens: number,
    totalTokens: number,
    totalCost: number,
    modelsUsed: string[]
  }>,

  // 메타데이터
  submittedAt: number,
  verified: boolean,
  flaggedForReview?: boolean,
  flagReasons?: string[]
}

// 인덱스
- by_researcher: [researcherUsername]
- by_department: [department]
- by_total_cost: [totalCost]
- by_submitted_at: [submittedAt]
```

#### labResearchers 테이블
```typescript
{
  _id: Id<"labResearchers">,
  username: string,                    // 연구원 이름
  department: string,                  // 소속
  totalSubmissions: number,            // 총 제출 횟수
  totalTokens: number,                 // 누적 토큰
  totalCost: number,                   // 누적 비용
  firstSubmission: number,             // 첫 제출 시각
  lastSubmission: number,              // 마지막 제출 시각
  createdAt: number
}

// 인덱스
- by_username: [username]
- by_department: [department]
- by_total_tokens: [totalTokens]
- by_total_cost: [totalCost]
```

## 🔄 데이터 흐름 상세

### 개인 모드 제출 플로우

```
1. 클라이언트
   npx viberank
   ↓
   ccusage 실행 → cc.json 생성
   ↓
   GitHub 사용자명 확인
   ↓
   API 호출

2. API Layer (/api/submit)
   ↓
   Rate Limiting 체크 (초당 10회 제한)
   ↓
   데이터 검증
   - 토큰 수학 검증: input + output + cache = total
   - 날짜 검증: 미래 날짜 차단
   - 음수 값 체크
   - 비정상적 사용량 체크 (일일 $5000, 250M 토큰 제한)
   ↓
   GitHub username 검증

3. Convex Layer
   ↓
   기존 제출 확인
   ↓
   데이터 병합 로직
   - 날짜별 breakdown 병합
   - 중복 제거
   - 총계 재계산
   ↓
   submissions 테이블에 저장
   ↓
   profiles 테이블 업데이트
   - totalSubmissions++
   - bestSubmission 갱신

4. 응답
   ↓
   성공 메시지 + 프로필 URL 반환
```

### 연구실 모드 제출 플로우

```
1. 클라이언트
   ./submit-lab-usage.sh
   ↓
   ccusage 실행 → cc.json
   ↓
   헤더 설정:
   - X-Researcher-Username
   - X-Researcher-Department
   ↓
   API 호출

2. API Layer (/api/lab/submit)
   ↓
   헤더 검증
   - researcherUsername 필수
   - department 필수
   ↓
   Rate Limiting
   ↓
   데이터 검증 (개인 모드와 동일)

3. Convex Layer
   ↓
   기존 제출 확인 (연구원 + 기간)
   ↓
   데이터 병합
   ↓
   labSubmissions 저장
   ↓
   labResearchers 업데이트
   - 자동 생성 (없으면)
   - 통계 갱신

4. 응답
   ↓
   성공 메시지 + 통계 반환
```

## 🔐 인증 및 권한

### 개인 모드
```
인증 방법: GitHub OAuth (NextAuth.js)

플로우:
1. 사용자가 "Sign in with GitHub" 클릭
2. GitHub OAuth 페이지로 리다이렉트
3. 사용자가 권한 승인
4. Callback으로 돌아옴
5. NextAuth가 세션 생성
6. JWT 토큰 발급

권한 레벨:
- 익명: 리더보드 조회만
- 로그인: 제출 + 프로필 편집
- 관리자: 플래그 관리 + 스팸 제거
```

### 연구실 모드
```
인증 방법: 헤더 기반 (간소화)

플로우:
1. 클라이언트가 헤더에 정보 포함
   - X-Researcher-Username
   - X-Researcher-Department
2. API에서 헤더 검증
3. Rate limiting으로 스팸 방지
4. 데이터 검증으로 조작 방지

향후 개선:
- API 키 기반 인증 추가
- 연구실별 별도 인증
- IP 화이트리스트
```

## ⚡ 성능 최적화

### Convex 쿼리 최적화

```typescript
// ❌ 비효율적
const allSubmissions = await ctx.db.query("submissions").collect();
const sorted = allSubmissions.sort((a, b) => b.totalCost - a.totalCost);
const top100 = sorted.slice(0, 100);

// ✅ 최적화됨
const top100 = await ctx.db
  .query("submissions")
  .withIndex("by_total_cost")
  .order("desc")
  .take(100);
```

### 페이지네이션

```typescript
// 페이지 단위 로딩
export const getLeaderboardPaginated = query({
  args: {
    page: v.number(),
    pageSize: v.number()
  },
  handler: async (ctx, args) => {
    const skip = args.page * args.pageSize;
    return await ctx.db
      .query("submissions")
      .withIndex("by_total_cost")
      .order("desc")
      .skip(skip)
      .take(args.pageSize);
  }
});
```

### Rate Limiting

```typescript
// convex/rateLimiter.ts
const RATE_LIMITS = {
  submit: { requests: 10, window: 60000 },      // 10회/분
  query: { requests: 100, window: 60000 }       // 100회/분
};

export const checkRateLimit = async (
  ctx: QueryCtx,
  identifier: string,
  action: string
) => {
  const limit = RATE_LIMITS[action];
  const recent = await ctx.db
    .query("rateLimits")
    .withIndex("by_identifier", q =>
      q.eq("identifier", identifier)
        .gt("timestamp", Date.now() - limit.window)
    )
    .collect();

  if (recent.length >= limit.requests) {
    throw new Error("Rate limit exceeded");
  }

  await ctx.db.insert("rateLimits", {
    identifier,
    action,
    timestamp: Date.now()
  });
};
```

## 🔍 데이터 검증 로직

### 토큰 계산 검증

```typescript
function validateTokenMath(data: UsageData): boolean {
  const calculatedTotal =
    data.inputTokens +
    data.outputTokens +
    data.cacheCreationTokens +
    data.cacheReadTokens;

  const tolerance = 0.01; // 1% 허용 오차
  const diff = Math.abs(calculatedTotal - data.totalTokens);
  const ratio = diff / data.totalTokens;

  return ratio <= tolerance;
}
```

### 날짜 검증

```typescript
function validateDates(dateRange: DateRange): boolean {
  const start = new Date(dateRange.start);
  const end = new Date(dateRange.end);
  const now = new Date();

  // 미래 날짜 차단
  if (end > now) return false;

  // start가 end보다 나중이면 안됨
  if (start > end) return false;

  // 날짜 형식 검증
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return false;
  }

  return true;
}
```

### 비정상 사용량 검출

```typescript
function detectAnomalousUsage(data: UsageData): string[] {
  const flags: string[] = [];

  const daysInRange = getDayCount(data.dateRange);
  const dailyAvgCost = data.totalCost / daysInRange;
  const dailyAvgTokens = data.totalTokens / daysInRange;

  // 일일 비용이 $5000 초과
  if (dailyAvgCost > 5000) {
    flags.push("Unusually high daily cost");
  }

  // 일일 토큰이 250M 초과
  if (dailyAvgTokens > 250_000_000) {
    flags.push("Unusually high daily tokens");
  }

  // 토큰당 비용 비율 체크
  const costPerToken = data.totalCost / data.totalTokens;
  if (costPerToken < 0.000001 || costPerToken > 0.1) {
    flags.push("Unusual cost-per-token ratio");
  }

  // 음수 값 체크
  if (data.totalTokens < 0 || data.totalCost < 0 ||
      data.inputTokens < 0 || data.outputTokens < 0) {
    flags.push("Negative values detected");
  }

  return flags;
}
```

## 📈 확장성 고려사항

### 수평 확장
- Convex는 자동으로 스케일링
- API Routes는 Vercel Edge Functions로 전세계 배포
- 정적 에셋은 CDN 캐싱

### 데이터 증가 대응
- 인덱스 최적화로 쿼리 속도 유지
- 아카이빙 전략 (6개월 이상 데이터)
- 페이지네이션으로 대용량 리스트 처리

### 비용 최적화
- Convex 무료 티어: 1M 함수 호출/월
- Vercel 무료 티어: 100GB 대역폭/월
- 캐싱으로 중복 쿼리 방지

## 🔮 향후 개선 계획

### 단기 (1-2주)
- [ ] 연구실 모드 프론트엔드 UI
- [ ] 연구실 대시보드
- [ ] Docker Compose 설정
- [ ] E2E 테스트

### 중기 (1-2개월)
- [ ] 연구실별 테마 커스터마이징
- [ ] 고급 통계 (시간대별, 요일별 분석)
- [ ] 알림 시스템 (일일/주간 리포트)
- [ ] Export 기능 (CSV, PDF)

### 장기 (3개월+)
- [ ] 다국어 지원
- [ ] 모바일 앱
- [ ] Slack/Discord 통합
- [ ] AI 기반 사용 패턴 분석
