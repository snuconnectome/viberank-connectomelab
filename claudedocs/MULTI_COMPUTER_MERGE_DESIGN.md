# Multi-Computer Data Merging Design

## 문제 정의 (Problem Definition)

### 현재 상황
한 연구자가 여러 대의 컴퓨터에서 Claude를 사용하는 경우, 각 컴퓨터에서 ccusage를 실행하면 동일한 날짜에 대한 사용량 데이터가 중복으로 생성됩니다.

**예시:**
- 컴퓨터 A (MacBook): 1월 1일 = 10,000 tokens (연구 작업)
- 컴퓨터 B (Lab Desktop): 1월 1일 = 10,000 tokens (동일한 연구 작업, 다른 컴퓨터)

### 현재 시스템의 문제점
현재 `mergeDailyData` 함수는 같은 날짜의 데이터를 **무조건 합산**합니다:
```typescript
// 현재 동작 (validation.ts:119-128)
if (merged.has(day.date)) {
  const current = merged.get(day.date)!;
  merged.set(day.date, {
    inputTokens: current.inputTokens + day.inputTokens,  // 합산!
    totalTokens: current.totalTokens + day.totalTokens,  // 합산!
    // ...
  });
}
```

**결과:** 1월 1일 = 20,000 tokens (❌ 중복 집계!)

### 요구사항
1. 서로 다른 컴퓨터의 데이터를 구분할 수 있어야 함
2. 동일한 작업의 중복 집계를 방지해야 함
3. 여러 컴퓨터에서의 진짜 다른 작업은 합산되어야 함
4. 기존 제출 데이터와의 호환성 유지

---

## 설계 방안 (Design Solutions)

### 방안 1: Machine ID 기반 개별 제출 관리 (권장)

#### 개요
각 컴퓨터를 고유하게 식별하고, 컴퓨터별로 독립적인 제출을 유지한 후, 조회 시점에 통합합니다.

#### 아키텍처

**1. 데이터 모델 변경**

```typescript
// 새로운 스키마: labSubmissions 테이블
{
  researcherUsername: string,      // 연구자 식별자
  department: string,              // 소속
  machineId: string,               // NEW: 컴퓨터 고유 식별자
  machineName?: string,            // NEW: 사용자 지정 컴퓨터 이름 (optional)

  // 기존 필드들
  totalTokens: number,
  dailyBreakdown: DailyData[],
  // ...
}

// 복합 인덱스 추가
by_researcher_machine: (researcherUsername, machineId)
```

**2. Machine ID 생성 전략**

```typescript
// submit-lab-usage.sh 수정
// 방법 A: 시스템 정보 기반 (권장)
MACHINE_ID=$(hostname)-$(uname -m)-$(date +%s | md5sum | head -c 8)

// 방법 B: 사용자 지정 (더 간단)
MACHINE_ID="${MACHINE_NAME:-$(hostname)}"

// 방법 C: ccusage 확장 (ideal, 향후)
npx ccusage --json --machine-id "macbook-pro"
```

**3. 제출 API 변경**

```typescript
// POST /api/lab/submit
// 헤더 추가
X-Machine-Id: string (required)
X-Machine-Name: string (optional)

// Convex mutation 변경
export const submit = mutation({
  args: {
    researcherUsername: v.string(),
    department: v.string(),
    machineId: v.string(),        // NEW
    machineName: v.optional(v.string()),  // NEW
    // ... 기존 필드들
  },
  handler: async (ctx, args) => {
    // 동일 researcher + machineId 조합으로 기존 제출 찾기
    const existing = await ctx.db
      .query("labSubmissions")
      .withIndex("by_researcher_machine", (q) =>
        q.eq("researcherUsername", args.researcherUsername)
         .eq("machineId", args.machineId)
      )
      .first();

    if (existing) {
      // 같은 컴퓨터의 데이터만 merge (기존 로직 유지)
      const mergedDaily = mergeDailyData(
        existing.dailyBreakdown,
        args.dailyBreakdown
      );
      // ...
    } else {
      // 새 컴퓨터 제출
      await ctx.db.insert("labSubmissions", {
        ...args,
        machineId: args.machineId,
        machineName: args.machineName,
      });
    }
  }
});
```

**4. 조회 시 데이터 통합**

```typescript
// 새로운 internal function
export const aggregateResearcherData = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    // 해당 연구자의 모든 컴퓨터 제출 가져오기
    const allSubmissions = await ctx.db
      .query("labSubmissions")
      .withIndex("by_researcher", (q) =>
        q.eq("researcherUsername", args.username)
      )
      .collect();

    // 모든 제출의 dailyBreakdown을 하나로 통합
    const allDailyData: DailyData[] = [];
    allSubmissions.forEach(sub => {
      allDailyData.push(...sub.dailyBreakdown);
    });

    // 같은 날짜의 데이터를 합산 (진짜 다른 컴퓨터의 작업)
    const merged = mergeDailyData([], allDailyData);

    // labResearchers 테이블에 통합 결과 저장
    return recalculateTotals(merged);
  }
});
```

#### 장점
✅ 완전한 투명성: 각 컴퓨터의 데이터를 개별적으로 추적
✅ 중복 방지: 같은 컴퓨터에서의 재제출만 merge
✅ 유연성: 컴퓨터별 통계도 조회 가능
✅ 데이터 무결성: 원본 데이터 보존

#### 단점
⚠️ 스키마 변경 필요 (migration)
⚠️ 기존 제출 데이터에 대한 마이그레이션 필요

---

### 방안 2: Submission Source Tracking (중간 복잡도)

#### 개요
제출마다 고유 ID를 생성하고, 같은 submission ID의 재제출만 replace 처리합니다.

#### 구현

**1. 스키마 변경**
```typescript
{
  researcherUsername: string,
  department: string,
  submissionSources: [              // NEW: 제출 출처 배열
    {
      sourceId: string,             // ccusage 실행 고유 ID
      submittedAt: number,
      dailyBreakdown: DailyData[]
    }
  ],
  // 통합된 데이터 (기존 구조 유지)
  dailyBreakdown: DailyData[],
  totalTokens: number,
  // ...
}
```

**2. Source ID 생성**
```bash
# submit-lab-usage.sh
SOURCE_ID="$(hostname)-$(date +%Y%m%d-%H%M%S)"

# 제출 시 포함
{
  "sourceId": "$SOURCE_ID",
  "researcherUsername": "...",
  # ...
}
```

**3. Merge 로직**
```typescript
if (existing) {
  // 같은 sourceId 찾기
  const existingSource = existing.submissionSources.find(
    s => s.sourceId === args.sourceId
  );

  if (existingSource) {
    // 같은 출처 = REPLACE
    existingSource.dailyBreakdown = args.dailyBreakdown;
  } else {
    // 새로운 출처 = ADD
    existing.submissionSources.push({
      sourceId: args.sourceId,
      dailyBreakdown: args.dailyBreakdown,
    });
  }

  // 전체 통합
  const allDaily = existing.submissionSources.flatMap(s => s.dailyBreakdown);
  existing.dailyBreakdown = mergeDailyData([], allDaily);
}
```

#### 장점
✅ 출처 추적 가능
✅ 같은 출처의 재제출은 replace, 다른 출처는 add
✅ 기존 API 호환성 유지

#### 단점
⚠️ Source ID 관리 복잡
⚠️ 사용자가 실수로 다른 source ID 사용 시 중복

---

### 방안 3: Merge Strategy Parameter (가장 간단)

#### 개요
제출 시 merge 전략을 명시적으로 지정합니다.

#### 구현

**1. API 변경**
```typescript
// POST /api/lab/submit
// 헤더 추가
X-Merge-Strategy: "add" | "replace" | "skip"

export const submit = mutation({
  args: {
    // ... 기존 필드
    mergeStrategy: v.optional(v.union(
      v.literal("add"),
      v.literal("replace"),
      v.literal("skip")
    )),
  },
  handler: async (ctx, args) => {
    const strategy = args.mergeStrategy || "add";

    if (existing) {
      switch (strategy) {
        case "add":
          // 기존 동작: 데이터 합산
          mergedDaily = mergeDailyData(existing.dailyBreakdown, args.dailyBreakdown);
          break;

        case "replace":
          // 전체 데이터 교체
          mergedDaily = args.dailyBreakdown;
          break;

        case "skip":
          // 기존 데이터 유지, 새 데이터 무시
          return { success: true, skipped: true };
      }
    }
  }
});
```

**2. 사용자 워크플로우**
```bash
# 첫 제출 (Computer A)
./submit-lab-usage.sh jiookcha "Psychology"

# 다른 컴퓨터에서 제출 (Computer B)
# 옵션 1: 기존 데이터 교체
MERGE_STRATEGY="replace" ./submit-lab-usage.sh jiookcha "Psychology"

# 옵션 2: 추가 (다른 작업)
MERGE_STRATEGY="add" ./submit-lab-usage.sh jiookcha "Psychology"
```

#### 장점
✅ 구현 매우 간단
✅ 사용자가 명시적으로 제어
✅ 기존 시스템 최소 변경

#### 단점
⚠️ 사용자가 전략을 잘못 선택 가능
⚠️ 자동화 어려움
⚠️ 어느 컴퓨터의 데이터인지 추적 불가

---

## 권장 솔루션: 방안 1 (Machine ID 기반)

### 선택 이유
1. **자동화**: 사용자가 신경쓸 필요 없음
2. **투명성**: 각 컴퓨터의 데이터를 개별 추적
3. **확장성**: 향후 컴퓨터별 통계, 관리 기능 추가 가능
4. **정확성**: 중복 집계 완전 방지

### 마이그레이션 전략

**1. 스키마 마이그레이션**
```typescript
// convex/migrations/add_machine_id.ts
import { internalMutation } from "./_generated/server";

export const addMachineIdToExistingSubmissions = internalMutation({
  handler: async (ctx) => {
    const submissions = await ctx.db.query("labSubmissions").collect();

    for (const sub of submissions) {
      if (!sub.machineId) {
        await ctx.db.patch(sub._id, {
          machineId: "legacy-unknown",
          machineName: "Legacy Data (pre-migration)",
        });
      }
    }
  }
});
```

**2. 스크립트 업데이트**
```bash
# submit-lab-usage.sh에 추가
# Machine ID 생성 (hostname 기반)
MACHINE_ID="${VIBERANK_MACHINE_ID:-$(hostname)}"
MACHINE_NAME="${VIBERANK_MACHINE_NAME:-$MACHINE_ID}"

# 제출 시 헤더 추가
curl -X POST "$API_URL" \
  -H "X-Researcher-Username: $RESEARCHER_USERNAME" \
  -H "X-Researcher-Department: $DEPARTMENT" \
  -H "X-Machine-Id: $MACHINE_ID" \
  -H "X-Machine-Name: $MACHINE_NAME" \
  -d @lab-data.json
```

**3. 환경 변수 설정 (사용자 가이드)**
```bash
# ~/.bashrc 또는 ~/.zshrc
export VIBERANK_MACHINE_ID="macbook-pro-2023"
export VIBERANK_MACHINE_NAME="My MacBook Pro"

# 또는 컴퓨터별로 다르게
# Lab Desktop:
export VIBERANK_MACHINE_ID="lab-desktop-01"
export VIBERANK_MACHINE_NAME="Lab Desktop Computer"
```

---

## 구현 계획 (Implementation Plan)

### Phase 1: 스키마 및 백엔드 (Backend)
**예상 소요시간**: 2-3시간

1. **스키마 변경**
   - `labSubmissions` 테이블에 `machineId`, `machineName` 필드 추가
   - 복합 인덱스 `by_researcher_machine` 추가
   - 마이그레이션 스크립트 작성

2. **Convex Functions 수정**
   - `labSubmissions.submit` mutation 수정
     - machineId, machineName 인자 추가
     - 기존 제출 조회 로직 변경 (researcher + machineId)
   - `labResearchers.updateResearcherStats` 수정
     - 모든 머신의 데이터 통합 로직 추가
   - 새로운 query 추가: `getSubmissionsByMachine`

3. **테스트 작성**
   - 다중 머신 제출 시나리오 테스트
   - 머신별 데이터 격리 검증
   - 통합 조회 시 정확성 검증

### Phase 2: API 및 스크립트 (API & Scripts)
**예상 소요시간**: 1-2시간

1. **API Routes 수정**
   - `/api/lab/submit` 헤더 처리 추가
   - 에러 메시지 개선 (machineId 관련)

2. **submit-lab-usage.sh 업데이트**
   - Machine ID 자동 생성 로직
   - 환경 변수 지원
   - 사용자 안내 메시지 추가

3. **새로운 조회 기능**
   - GET `/api/lab/machines?username=<username>`
     - 특정 연구자의 모든 머신 목록 조회
   - GET `/api/lab/profile?username=<username>&machineId=<id>`
     - 특정 머신의 데이터만 조회

### Phase 3: 문서화 및 마이그레이션 (Documentation)
**예상 소요시간**: 1시간

1. **README 업데이트**
   - 다중 컴퓨터 사용 가이드
   - Machine ID 설정 방법
   - 환경 변수 설명

2. **마이그레이션 가이드**
   - 기존 사용자 대상 안내
   - 데이터 마이그레이션 절차

3. **사용 예시**
   - 여러 컴퓨터 설정 시나리오
   - 문제 해결 가이드

---

## 대안 시나리오 (Alternative Scenarios)

### 시나리오 A: 사용자가 한 컴퓨터만 사용하는 경우
- Machine ID는 자동으로 `hostname` 사용
- 사용자는 아무것도 설정하지 않아도 됨
- 기존 동작과 동일하게 작동

### 시나리오 B: 2대의 컴퓨터를 사용하는 경우
```bash
# Computer 1 (MacBook)
export VIBERANK_MACHINE_ID="macbook"
./submit-lab-usage.sh jiookcha "Psychology"

# Computer 2 (Lab Desktop)
export VIBERANK_MACHINE_ID="lab-desktop"
./submit-lab-usage.sh jiookcha "Psychology"

# 결과: 두 컴퓨터의 데이터가 자동으로 통합
# - labSubmissions: 2개 항목 (각 머신별)
# - labResearchers: 1개 항목 (통합된 통계)
```

### 시나리오 C: 실수로 같은 Machine ID 사용
- 같은 machineId로 재제출 시 기존 merge 로직 작동
- 데이터는 합산됨 (기존 동작)
- 해결: Machine ID를 다르게 설정 후 재제출

---

## 기술 스택 및 도구

### 수정 필요 파일
```
convex/
  schema.ts                    # 스키마 변경
  labSubmissions.ts            # mutation 수정
  labResearchers.ts            # aggregation 로직 추가
  migrations/
    add_machine_id.ts          # NEW: 마이그레이션

src/app/api/lab/
  submit/route.ts              # 헤더 처리 추가
  machines/route.ts            # NEW: 머신 목록 API

submit-lab-usage.sh            # Machine ID 지원
LAB_MODE_README.md             # 문서 업데이트

tests/
  lab-integration.test.ts      # 다중 머신 테스트 추가
```

### 데이터베이스 변경
```typescript
// Before
{
  _id: Id<"labSubmissions">,
  researcherUsername: "jiookcha",
  department: "Psychology",
  dailyBreakdown: [...],
  totalTokens: 50000,
}

// After
{
  _id: Id<"labSubmissions">,
  researcherUsername: "jiookcha",
  department: "Psychology",
  machineId: "macbook-pro-2023",      // NEW
  machineName: "My MacBook Pro",      // NEW
  dailyBreakdown: [...],
  totalTokens: 30000,  // 이 머신만의 데이터
}

// 통합 결과는 labResearchers 테이블에
{
  username: "jiookcha",
  totalTokens: 80000,  // 모든 머신 합계
  machines: ["macbook-pro-2023", "lab-desktop-01"],
}
```

---

## 성공 기준 (Success Criteria)

### 기능 요구사항
✅ 같은 연구자가 여러 컴퓨터에서 제출 가능
✅ 각 컴퓨터의 데이터가 자동으로 통합
✅ 중복 집계 발생하지 않음
✅ 기존 단일 컴퓨터 사용 시나리오 정상 동작

### 기술 요구사항
✅ 모든 테스트 통과 (10+ 테스트 케이스)
✅ 기존 API 호환성 유지
✅ 마이그레이션 성공 (기존 데이터 보존)
✅ 성능 저하 없음 (<100ms API 응답)

### 사용성 요구사항
✅ 사용자 설정 최소화 (자동 hostname 사용)
✅ 명확한 에러 메시지
✅ 완전한 문서화

---

## 리스크 및 완화 전략

### 리스크 1: 기존 데이터 손실
**완화**:
- 마이그레이션 전 백업
- 마이그레이션 스크립트 테스트 환경에서 검증
- Rollback 계획 수립

### 리스크 2: Machine ID 충돌
**완화**:
- Hostname + timestamp 조합으로 고유성 보장
- 충돌 시 명확한 에러 메시지
- 수동 설정 옵션 제공

### 리스크 3: 사용자 혼란
**완화**:
- 자동 동작 우선 (설정 불필요)
- 명확한 문서 및 예시 제공
- 단계별 마이그레이션 가이드

---

## 다음 단계 (Next Steps)

### Immediate (즉시)
1. **설계 검토 및 승인**
   - 이 설계 문서 리뷰
   - 대안 방안 재검토
   - 최종 접근 방식 결정

### Short-term (단기: 1주일)
2. **Phase 1 구현**: 백엔드 및 스키마
3. **Phase 2 구현**: API 및 스크립트
4. **Phase 3 구현**: 문서화

### Long-term (장기: 1개월)
5. **프로덕션 배포**
   - 마이그레이션 실행
   - 사용자 공지
   - 모니터링

---

## 부록: 코드 스니펫

### 스키마 변경 예시
```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  labSubmissions: defineTable({
    researcherUsername: v.string(),
    department: v.string(),
    machineId: v.string(),          // NEW
    machineName: v.optional(v.string()),  // NEW

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
    dailyBreakdown: v.array(v.object({
      date: v.string(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      cacheCreationTokens: v.number(),
      cacheReadTokens: v.number(),
      totalTokens: v.number(),
      totalCost: v.number(),
      modelsUsed: v.array(v.string()),
    })),

    submittedAt: v.number(),
    verified: v.boolean(),
    flaggedForReview: v.optional(v.boolean()),
    flagReasons: v.optional(v.array(v.string())),
  })
    .index("by_researcher", ["researcherUsername"])
    .index("by_researcher_machine", ["researcherUsername", "machineId"])  // NEW
    .index("by_department", ["department"])
    .index("by_submitted_at", ["submittedAt"]),

  labResearchers: defineTable({
    username: v.string(),
    department: v.string(),
    machines: v.array(v.string()),  // NEW: 사용한 머신 목록

    totalTokens: v.number(),
    totalCost: v.number(),
    // ... 기존 필드
  })
    .index("by_username", ["username"]),
});
```

### Machine ID 생성 (Bash)
```bash
#!/bin/bash
# submit-lab-usage.sh 일부

# Machine ID 생성
generate_machine_id() {
    # 우선순위:
    # 1. 환경 변수 VIBERANK_MACHINE_ID
    # 2. hostname
    # 3. hostname + random

    if [ -n "$VIBERANK_MACHINE_ID" ]; then
        echo "$VIBERANK_MACHINE_ID"
    else
        local hostname=$(hostname)
        # hostname이 너무 짧거나 generic한 경우 보강
        if [ ${#hostname} -lt 5 ] || [[ "$hostname" =~ ^localhost|^ubuntu|^debian ]]; then
            # random suffix 추가
            local suffix=$(date +%s | md5sum | head -c 6)
            echo "${hostname}-${suffix}"
        else
            echo "$hostname"
        fi
    fi
}

MACHINE_ID=$(generate_machine_id)
MACHINE_NAME="${VIBERANK_MACHINE_NAME:-$MACHINE_ID}"

echo "Machine ID: $MACHINE_ID"
echo "Machine Name: $MACHINE_NAME"

# 제출
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Researcher-Username: $RESEARCHER_USERNAME" \
  -H "X-Researcher-Department: $DEPARTMENT" \
  -H "X-Machine-Id: $MACHINE_ID" \
  -H "X-Machine-Name: $MACHINE_NAME" \
  -d @lab-data.json
```

---

## 요약 (Summary)

**문제**: 여러 컴퓨터 사용 시 데이터 중복 집계
**해결**: Machine ID 기반 개별 제출 관리 + 조회 시 통합
**장점**: 자동화, 투명성, 확장성, 정확성
**구현**: 3개 Phase, 약 4-6시간 소요
**리스크**: 낮음 (마이그레이션 전략 수립)

이 설계는 사용자 편의성과 데이터 무결성을 동시에 만족하는 실용적인 솔루션입니다.
