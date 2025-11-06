# Viberank 구현 요약 (Connectome Lab Edition)

## 📌 한눈에 보기

### 기존 시스템 (viberank 원본)
```
개인 사용자 → GitHub OAuth → 글로벌 리더보드
```

### 확장 시스템 (Connectome Lab 버전)
```
개인 사용자 → GitHub OAuth → 글로벌 리더보드
     +
연구실 사용자 → 헤더 인증 → 연구실 리더보드
```

## 🎯 주요 구현 사항

### 1단계: 연구실 데이터 모델 설계 ✅

#### 새로운 스키마
```typescript
// labSubmissions - 연구실 제출 데이터
{
  researcherUsername: string,
  department: string,
  totalTokens: number,
  totalCost: number,
  dateRange: { start, end },
  dailyBreakdown: [...],
  submittedAt: number
}

// labResearchers - 연구원 프로필
{
  username: string,
  department: string,
  totalTokens: number,
  totalCost: number,
  totalSubmissions: number
}
```

### 2단계: API 엔드포인트 설계 ✅

```
POST /api/lab/submit
  ← X-Researcher-Username: hong-gildong
  ← X-Researcher-Department: Connectome Lab
  ← { ccusage JSON data }
  → { success, submissionId, stats }

GET /api/lab/leaderboard
  ? dateRange=7d|30d|all
  → [ { username, department, totalCost, rank }, ... ]

GET /api/lab/profile
  ? username=hong-gildong
  → { username, stats, history, charts }

GET /api/lab/stats
  → { totalResearchers, totalTokens, totalCost, topModels }
```

### 3단계: Convex 쿼리 함수 설계 ✅

```typescript
// convex/labLeaderboard.ts
export const getLeaderboard = query({...});
export const getLeaderboardByDateRange = query({...});
export const getLabStats = query({...});

// convex/labResearchers.ts
export const getProfile = query({...});
export const updateStats = mutation({...});

// convex/labSubmissions.ts
export const submitUsage = mutation({...});
export const mergeData = internalMutation({...});
```

### 4단계: 데이터 검증 시스템 설계 ✅

```typescript
✅ validateTokenMath()      // input + output + cache = total
✅ validateDates()           // 미래 날짜 차단
✅ validateNegatives()       // 음수 값 차단
✅ detectAnomalies()         // 비정상 사용량 플래그
✅ mergeDailyData()          // 중복 제출 병합
```

### 5단계: 헬퍼 스크립트 작성 ✅

```bash
#!/bin/bash
# submit-lab-usage.sh

npx ccusage@latest --json > cc.json

curl -X POST http://localhost:3001/api/lab/submit \
  -H "Content-Type: application/json" \
  -H "X-Researcher-Username: ${RESEARCHER_USERNAME}" \
  -H "X-Researcher-Department: ${RESEARCHER_DEPARTMENT}" \
  -d @cc.json

rm cc.json
```

## 📊 구현 완료도

| 영역 | 상태 | 완료율 |
|-----|------|--------|
| **백엔드 설계** | ✅ 완료 | 100% |
| └─ 데이터 모델 | ✅ | 100% |
| └─ API 설계 | ✅ | 100% |
| └─ Convex 쿼리 | ✅ | 100% |
| └─ 데이터 검증 | ✅ | 100% |
| **도구/스크립트** | ✅ 완료 | 100% |
| └─ submit-lab-usage.sh | ✅ | 100% |
| **문서화** | ✅ 완료 | 100% |
| └─ README-KO.md | ✅ | 100% |
| └─ ARCHITECTURE-KO.md | ✅ | 100% |
| └─ MULTI-MACHINE-GUIDE-KO.md | ✅ | 100% |
| **프론트엔드** | ⏳ 대기 | 0% |
| └─ 연구실 대시보드 | ⏳ | 0% |
| └─ 연구원 프로필 페이지 | ⏳ | 0% |
| └─ 통계 차트 | ⏳ | 0% |
| **테스트** | ⏳ 대기 | 0% |
| └─ 단위 테스트 | ⏳ | 0% |
| └─ 통합 테스트 | ⏳ | 0% |
| **배포** | ⏳ 대기 | 0% |
| └─ Docker 설정 | ⏳ | 0% |
| └─ 프로덕션 배포 | ⏳ | 0% |

**전체 진행률: 설계 단계 100% 완료, 구현 단계 0% (준비 완료)**

## 🔄 다음 단계

### Phase 1: 백엔드 구현 (예상: 1-2일)
1. Convex 스키마 적용
   ```bash
   cd viberank-connectomelab
   # convex/schema.ts에 labSubmissions, labResearchers 추가
   npx convex dev
   ```

2. Convex 함수 구현
   - `convex/labLeaderboard.ts` 작성
   - `convex/labResearchers.ts` 작성
   - `convex/labSubmissions.ts` 작성

3. API Routes 구현
   - `src/app/api/lab/submit/route.ts`
   - `src/app/api/lab/leaderboard/route.ts`
   - `src/app/api/lab/profile/route.ts`
   - `src/app/api/lab/stats/route.ts`

### Phase 2: 테스트 (예상: 1일)
```bash
# 로컬 테스트
./submit-lab-usage.sh

# API 테스트
curl http://localhost:3001/api/lab/leaderboard
curl http://localhost:3001/api/lab/stats

# 데이터 검증
npx tsx test/validate-lab-data.ts
```

### Phase 3: 프론트엔드 (예상: 2-3일)
1. 연구실 대시보드 페이지
   - `src/app/lab/page.tsx`
   - 전체 통계 표시
   - 리더보드 테이블

2. 연구원 프로필 페이지
   - `src/app/lab/profile/[username]/page.tsx`
   - 개인 사용량 차트
   - 제출 이력

3. 통계 차트 컴포넌트
   - `src/components/lab/StatsChart.tsx`
   - `src/components/lab/LeaderboardTable.tsx`

### Phase 4: 배포 (예상: 1일)
```bash
# Docker 설정
docker-compose.yml 작성
Dockerfile 작성

# 빌드 및 테스트
docker-compose build
docker-compose up -d

# 프로덕션 배포
git push origin main  # Vercel 자동 배포
```

## 💻 실제 코드 예시

### Convex 스키마 (추가 부분)
```typescript
// convex/schema.ts에 추가
export default defineSchema({
  // ... 기존 submissions, profiles ...

  labSubmissions: defineTable({
    researcherUsername: v.string(),
    department: v.string(),
    totalTokens: v.number(),
    totalCost: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheCreationTokens: v.number(),
    cacheReadTokens: v.number(),
    dateRange: v.object({
      start: v.string(),
      end: v.string(),
    }),
    modelsUsed: v.array(v.string()),
    dailyBreakdown: v.array(
      v.object({
        date: v.string(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        cacheCreationTokens: v.number(),
        cacheReadTokens: v.number(),
        totalTokens: v.number(),
        totalCost: v.number(),
        modelsUsed: v.array(v.string()),
      })
    ),
    submittedAt: v.number(),
    verified: v.boolean(),
    flaggedForReview: v.optional(v.boolean()),
    flagReasons: v.optional(v.array(v.string())),
  })
    .index("by_researcher", ["researcherUsername"])
    .index("by_department", ["department"])
    .index("by_total_cost", ["totalCost"])
    .index("by_submitted_at", ["submittedAt"]),

  labResearchers: defineTable({
    username: v.string(),
    department: v.string(),
    totalSubmissions: v.number(),
    totalTokens: v.number(),
    totalCost: v.number(),
    firstSubmission: v.number(),
    lastSubmission: v.number(),
    createdAt: v.number(),
  })
    .index("by_username", ["username"])
    .index("by_department", ["department"])
    .index("by_total_cost", ["totalCost"]),
});
```

### API Route 예시
```typescript
// src/app/api/lab/submit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { fetchMutation } from 'convex/nextjs';

export async function POST(request: NextRequest) {
  try {
    // 헤더 검증
    const username = request.headers.get('X-Researcher-Username');
    const department = request.headers.get('X-Researcher-Department');

    if (!username || !department) {
      return NextResponse.json(
        { error: 'Missing required headers' },
        { status: 400 }
      );
    }

    // 요청 body 파싱
    const data = await request.json();

    // 데이터 검증
    if (!validateTokenMath(data)) {
      return NextResponse.json(
        { error: 'Invalid token calculations' },
        { status: 400 }
      );
    }

    // Convex mutation 호출
    const result = await fetchMutation(api.labSubmissions.submit, {
      researcherUsername: username,
      department,
      ...data
    });

    return NextResponse.json({
      success: true,
      submissionId: result.submissionId,
      message: `Successfully submitted data for ${username}`,
      stats: result.stats
    });
  } catch (error) {
    console.error('Lab submission error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Convex Mutation 예시
```typescript
// convex/labSubmissions.ts
export const submit = mutation({
  args: {
    researcherUsername: v.string(),
    department: v.string(),
    totalTokens: v.number(),
    totalCost: v.number(),
    // ... 나머지 필드
  },
  handler: async (ctx, args) => {
    // 기존 제출 확인
    const existing = await ctx.db
      .query("labSubmissions")
      .withIndex("by_researcher", q =>
        q.eq("researcherUsername", args.researcherUsername)
      )
      .first();

    let submissionId;

    if (existing) {
      // 데이터 병합
      const merged = mergeDailyData(
        existing.dailyBreakdown,
        args.dailyBreakdown
      );

      submissionId = await ctx.db.patch(existing._id, {
        ...args,
        dailyBreakdown: merged,
        totalTokens: merged.reduce((sum, d) => sum + d.totalTokens, 0),
        totalCost: merged.reduce((sum, d) => sum + d.totalCost, 0),
      });
    } else {
      // 새 제출
      submissionId = await ctx.db.insert("labSubmissions", args);
    }

    // 연구원 프로필 업데이트
    await ctx.scheduler.runAfter(0,
      internal.labResearchers.updateStats,
      { username: args.researcherUsername }
    );

    return {
      submissionId,
      stats: await getResearcherStats(ctx, args.researcherUsername)
    };
  },
});
```

## 🧪 테스트 시나리오

### 시나리오 1: 단일 제출
```bash
# 1. ccusage 실행
npx ccusage@latest --json > cc.json

# 2. 제출
curl -X POST http://localhost:3001/api/lab/submit \
  -H "Content-Type: application/json" \
  -H "X-Researcher-Username: test-user" \
  -H "X-Researcher-Department: Test Lab" \
  -d @cc.json

# 3. 확인
curl http://localhost:3001/api/lab/profile?username=test-user
```

### 시나리오 2: 병합 테스트
```bash
# 1. 첫 번째 제출 (2025-01-01 ~ 2025-01-05)
submit_data('2025-01-01', '2025-01-05')

# 2. 두 번째 제출 (2025-01-03 ~ 2025-01-10, 날짜 겹침!)
submit_data('2025-01-03', '2025-01-10')

# 3. 결과 확인
# - 2025-01-01 ~ 2025-01-02: 첫 번째 데이터만
# - 2025-01-03 ~ 2025-01-05: 두 데이터 합산
# - 2025-01-06 ~ 2025-01-10: 두 번째 데이터만
```

### 시나리오 3: 다중 컴퓨터
```bash
# MacBook
submit_from_machine("MacBook", "2025-01-01", "2025-01-10")

# dgx-spark
submit_from_machine("dgx-spark", "2025-01-05", "2025-01-15")

# 결과: 2025-01-05 ~ 2025-01-10 데이터가 자동 합산
```

## 📝 남은 작업 체크리스트

### 즉시 시작 가능
- [ ] Convex 스키마 파일 수정 및 배포
- [ ] Convex 함수 구현 (labSubmissions, labResearchers, labLeaderboard)
- [ ] API Routes 구현
- [ ] 로컬 테스트

### 백엔드 완료 후
- [ ] 프론트엔드 페이지 구현
- [ ] 차트 컴포넌트 작성
- [ ] E2E 테스트 작성

### 최종 단계
- [ ] Docker 설정
- [ ] 프로덕션 배포
- [ ] 모니터링 설정
- [ ] 사용자 가이드 작성

## 🎓 학습 포인트

### 핵심 개념
1. **Convex 서버리스 아키텍처**
   - Mutation, Query, Internal 함수
   - 스키마 정의 및 인덱싱
   - Real-time subscriptions

2. **Next.js API Routes**
   - Server-side validation
   - Header-based authentication
   - Error handling patterns

3. **데이터 병합 알고리즘**
   - 날짜별 breakdown 병합
   - 중복 제거 로직
   - 총계 재계산

4. **Rate Limiting**
   - Window-based counting
   - Distributed rate limiting
   - DDoS 방어

### 적용 기술
- TypeScript 타입 안정성
- Zod 스키마 검증
- React Server Components
- Tailwind CSS 스타일링
- Recharts 데이터 시각화

## 🚀 Quick Start (구현 시작하기)

```bash
# 1. 프로젝트 클론 (이미 완료)
cd viberank-connectomelab

# 2. 의존성 설치
pnpm install

# 3. Convex 개발 서버 시작
npx convex dev

# 4. 스키마 수정 (위의 예시 참조)
# vim convex/schema.ts

# 5. Convex 함수 구현
# vim convex/labSubmissions.ts
# vim convex/labResearchers.ts
# vim convex/labLeaderboard.ts

# 6. API Routes 구현
# vim src/app/api/lab/submit/route.ts
# vim src/app/api/lab/leaderboard/route.ts

# 7. Next.js 개발 서버 시작
pnpm dev

# 8. 테스트
./submit-lab-usage.sh
```

## 📞 지원

문제가 발생하거나 질문이 있으면:
1. GitHub Issues 등록
2. 팀 Slack에 문의
3. 문서 확인: `docs/` 디렉토리

---

**마지막 업데이트: 2025-11-06**
**작성자: Claude Code (AI Assistant)**
**검토자: Connectome Lab**
