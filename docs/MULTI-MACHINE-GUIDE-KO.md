# 여러 컴퓨터에서 토큰 사용량 합치기

## 📖 개요

viberank는 **자동으로** 여러 컴퓨터의 Claude Code 사용량을 합쳐줍니다. 별도의 설정 없이, 같은 사용자 이름으로 제출하기만 하면 됩니다.

## 🎯 기본 원리

### 자동 병합 로직

```
컴퓨터 A (MacBook)
├─ 2025-01-01: 100만 토큰, $5
├─ 2025-01-02: 150만 토큰, $7
└─ 2025-01-03: 200만 토큰, $10

컴퓨터 B (dgx-spark)
├─ 2025-01-02: 80만 토큰, $4      ← 같은 날짜!
├─ 2025-01-03: 120만 토큰, $6     ← 같은 날짜!
└─ 2025-01-04: 90만 토큰, $5      ← 새로운 날짜

자동 병합 결과:
├─ 2025-01-01: 100만 토큰, $5     (A만)
├─ 2025-01-02: 230만 토큰, $11    (A + B 합산)
├─ 2025-01-03: 320만 토큰, $16    (A + B 합산)
└─ 2025-01-04: 90만 토큰, $5      (B만)

총계: 740만 토큰, $37
```

## 🚀 사용 방법

### 방법 1: 개인 모드 (GitHub 계정 기반)

모든 컴퓨터에서 **같은 GitHub 계정**으로 제출하면 자동으로 합쳐집니다.

#### MacBook에서
```bash
cd ~/Documents/git/my-project

# GitHub 계정 설정 (한 번만)
git config --global user.name "hong-gildong"
git config --global user.email "hong@example.com"

# 사용량 제출
npx viberank
```

#### dgx-spark에서
```bash
cd ~/git/my-project

# 같은 GitHub 계정 설정 (중요!)
git config --global user.name "hong-gildong"  # ← MacBook과 동일
git config --global user.email "hong@example.com"

# 사용량 제출
npx viberank
```

#### 결과
- 두 컴퓨터의 사용량이 `hong-gildong` 계정으로 자동 합산
- 프로필 페이지 한 곳에서 전체 사용량 확인
- 리더보드에도 합산된 총량으로 표시

### 방법 2: 연구실 모드 (헤더 기반)

연구실 모드에서는 **같은 username**으로 제출합니다.

#### 컴퓨터 A에서
```bash
npx ccusage@latest --json > cc.json

curl -X POST http://localhost:3001/api/lab/submit \
  -H "Content-Type: application/json" \
  -H "X-Researcher-Username: hong-gildong" \
  -H "X-Researcher-Department: Connectome Lab" \
  -d @cc.json
```

#### 컴퓨터 B에서
```bash
npx ccusage@latest --json > cc.json

curl -X POST http://localhost:3001/api/lab/submit \
  -H "Content-Type: application/json" \
  -H "X-Researcher-Username: hong-gildong" \    # ← 같은 이름!
  -H "X-Researcher-Department: Connectome Lab" \
  -d @cc.json
```

#### 헬퍼 스크립트 사용 (추천)
```bash
# submit-lab-usage.sh 수정
export RESEARCHER_USERNAME="hong-gildong"      # 모든 컴퓨터에서 동일하게
export RESEARCHER_DEPARTMENT="Connectome Lab"

./submit-lab-usage.sh
```

## 🔄 병합 동작 상세

### 날짜별 병합

viberank는 **날짜(YYYY-MM-DD)** 단위로 데이터를 병합합니다.

```typescript
// 병합 알고리즘 의사코드
function mergeDailyData(existing, new) {
  const merged = new Map();

  // 기존 데이터 추가
  for (const day of existing.dailyBreakdown) {
    merged.set(day.date, day);
  }

  // 새 데이터 병합
  for (const day of new.dailyBreakdown) {
    if (merged.has(day.date)) {
      // 같은 날짜 → 합산
      const current = merged.get(day.date);
      merged.set(day.date, {
        date: day.date,
        inputTokens: current.inputTokens + day.inputTokens,
        outputTokens: current.outputTokens + day.outputTokens,
        cacheCreationTokens: current.cacheCreationTokens + day.cacheCreationTokens,
        cacheReadTokens: current.cacheReadTokens + day.cacheReadTokens,
        totalTokens: current.totalTokens + day.totalTokens,
        totalCost: current.totalCost + day.totalCost,
        modelsUsed: [...new Set([...current.modelsUsed, ...day.modelsUsed])]
      });
    } else {
      // 새로운 날짜 → 추가
      merged.set(day.date, day);
    }
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}
```

### 총계 재계산

```typescript
// 병합 후 총계 자동 재계산
const recalculateTotals = (dailyBreakdown) => ({
  totalTokens: sum(dailyBreakdown.map(d => d.totalTokens)),
  totalCost: sum(dailyBreakdown.map(d => d.totalCost)),
  inputTokens: sum(dailyBreakdown.map(d => d.inputTokens)),
  outputTokens: sum(dailyBreakdown.map(d => d.outputTokens)),
  cacheCreationTokens: sum(dailyBreakdown.map(d => d.cacheCreationTokens)),
  cacheReadTokens: sum(dailyBreakdown.map(d => d.cacheReadTokens)),
  dateRange: {
    start: min(dailyBreakdown.map(d => d.date)),
    end: max(dailyBreakdown.map(d => d.date))
  },
  modelsUsed: uniqueModels(dailyBreakdown)
});
```

## 📋 실전 예시

### 시나리오: MacBook + dgx-spark + 연구실 워크스테이션

#### 1단계: 각 컴퓨터에서 Git 설정

```bash
# 모든 컴퓨터에서 실행
git config --global user.name "hong-gildong"
git config --global user.email "hong@snu.ac.kr"
```

#### 2단계: 주기적으로 제출

```bash
# MacBook (매일 저녁)
cd ~/projects && npx viberank

# dgx-spark (매일 저녁)
cd ~/git/project && npx viberank

# 연구실 워크스테이션 (매일 저녁)
cd ~/work && npx viberank
```

#### 3단계: 자동화 (선택사항)

**MacBook (crontab)**
```bash
# 매일 23:59에 자동 제출
59 23 * * * cd ~/projects && npx viberank >> ~/viberank.log 2>&1
```

**dgx-spark (crontab)**
```bash
# 매일 23:55에 자동 제출 (시간 약간 다르게)
55 23 * * * cd ~/git/project && npx viberank >> ~/viberank.log 2>&1
```

#### 4단계: 결과 확인

```bash
# 프로필 조회
curl https://viberank.app/profile/hong-gildong

# 또는 웹 브라우저에서
# https://viberank.app/profile/hong-gildong
```

## 🎨 프로필 페이지에서 확인되는 정보

### 합산된 통계
```yaml
Total Usage:
  - Total Cost: $127.50        # 모든 컴퓨터 합산
  - Total Tokens: 25.5M        # 모든 컴퓨터 합산
  - Days Active: 30
  - Avg Daily Cost: $4.25

Recent Activity:
  - 2025-01-10: 850K tokens, $4.50   # 여러 컴퓨터 자동 합산
  - 2025-01-09: 920K tokens, $5.20
  - 2025-01-08: 780K tokens, $3.90

Models Used:
  - claude-3-5-sonnet-20250129: 75%  # 모든 컴퓨터에서 사용한 모델 집계
  - claude-opus-3: 20%
  - claude-haiku-3: 5%
```

### 차트에 표시
- X축: 날짜 (병합된 날짜)
- Y축: 비용/토큰 (해당 날짜의 모든 컴퓨터 합산)

## ⚠️ 주의사항

### 1. 같은 사용자 이름 사용 필수

```bash
# ❌ 잘못된 예: 컴퓨터마다 다른 이름
# MacBook
git config user.name "hong-gildong"

# dgx-spark
git config user.name "gildong-hong"  # ← 다른 이름! 병합 안됨

# ✅ 올바른 예: 모든 컴퓨터에서 동일
git config user.name "hong-gildong"  # 모든 컴퓨터에서 동일!
```

### 2. 데이터 손실 방지

viberank는 **절대로 기존 데이터를 삭제하지 않습니다**:

```
기존 데이터:
  2025-01-01: 100만 토큰

새로 제출:
  2025-01-01: 50만 토큰  ← 같은 날짜

결과:
  2025-01-01: 150만 토큰  # 합산됨 (덮어쓰기 아님!)
```

### 3. 중복 제출 안전

같은 데이터를 여러 번 제출해도 안전합니다:

```bash
# 실수로 두 번 제출해도
npx viberank
npx viberank  # ← 중복!

# 시스템이 자동으로 처리:
# - 같은 날짜 범위면 병합 (중복 제거)
# - 다른 날짜 범위면 추가
```

## 🔍 검증 방법

### 로컬에서 확인

```bash
# 각 컴퓨터에서 사용량 확인
npx ccusage@latest

# MacBook
Total: 5M tokens, $25

# dgx-spark
Total: 10M tokens, $50

# 예상 합계: 15M tokens, $75
```

### viberank 프로필에서 확인

```bash
curl https://viberank.app/api/profile?username=hong-gildong | jq
```

```json
{
  "username": "hong-gildong",
  "totalTokens": 15000000,    // ← 15M (MacBook 5M + dgx 10M)
  "totalCost": 75.00,         // ← $75 (MacBook $25 + dgx $50)
  "submissions": [
    {
      "submittedAt": "2025-01-10T10:00:00Z",
      "source": "cli",
      "totalTokens": 10000000   // dgx 제출
    },
    {
      "submittedAt": "2025-01-10T09:30:00Z",
      "source": "cli",
      "totalTokens": 5000000    // MacBook 제출
    }
  ]
}
```

## 🛠️ 트러블슈팅

### 문제: 병합이 안됨

**원인**: 다른 사용자 이름으로 제출

**해결**:
```bash
# 현재 설정 확인
git config user.name
git config user.email

# 모든 컴퓨터에서 동일하게 설정
git config --global user.name "정확한-이름"
git config --global user.email "동일한@email.com"

# 재제출
npx viberank
```

### 문제: 일부 데이터만 보임

**원인**: ccusage가 일부 기간만 포함

**해결**:
```bash
# ccusage에 --all 플래그 사용
npx ccusage@latest --all --json > cc.json

# viberank 제출
npx viberank
```

### 문제: 중복 데이터가 두 배로 계산됨

**원인**: 날짜 범위가 겹치는 데이터를 두 번 제출

**해결**:
- viberank는 자동으로 날짜별 병합을 수행합니다
- 같은 날짜는 합산되므로 문제없습니다
- 정말 중복이라면 관리자에게 문의

## 💡 Best Practices

### 1. 일관된 Git 설정
```bash
# ~/.gitconfig (모든 컴퓨터에서 동일하게)
[user]
    name = hong-gildong
    email = hong@snu.ac.kr
```

### 2. 자동화 스크립트
```bash
#!/bin/bash
# submit-all-machines.sh

# 컴퓨터 이름 확인
MACHINE=$(hostname)

# 사용량 수집
npx ccusage@latest --json > "cc-${MACHINE}.json"

# 제출
npx viberank

# 로그
echo "[$(date)] Submitted from ${MACHINE}" >> ~/viberank-submissions.log
```

### 3. 주기적 제출
```bash
# 매일 23:59 자동 제출 (모든 컴퓨터)
59 23 * * * cd ~/projects && npx viberank
```

### 4. 백업
```bash
# 제출 전 백업 (선택사항)
npx ccusage@latest --json > ~/backups/cc-$(date +%Y%m%d).json
npx viberank
```

## 📊 연구실 모드 활용

연구실에서 여러 워크스테이션을 관리한다면:

```bash
# 각 워크스테이션에 스크립트 배포
cat > /usr/local/bin/submit-lab-usage << 'EOF'
#!/bin/bash
RESEARCHER="${1:-$(whoami)}"
DEPARTMENT="${2:-Connectome Lab}"

npx ccusage@latest --json > /tmp/cc.json

curl -X POST http://lab-server:3001/api/lab/submit \
  -H "Content-Type: application/json" \
  -H "X-Researcher-Username: ${RESEARCHER}" \
  -H "X-Researcher-Department: ${DEPARTMENT}" \
  -d @/tmp/cc.json

rm /tmp/cc.json
EOF

chmod +x /usr/local/bin/submit-lab-usage

# 사용
submit-lab-usage hong-gildong "Connectome Lab"
```

## 🎯 요약

```yaml
핵심 원칙:
  - 같은 사용자 이름 = 자동 병합
  - 날짜별 자동 합산
  - 데이터 손실 없음
  - 중복 제출 안전

권장 워크플로우:
  1. Git 설정 통일
  2. 각 컴퓨터에서 npx viberank 실행
  3. 자동 병합 확인
  4. 프로필 페이지에서 합산 결과 확인

자동화:
  - crontab으로 매일 자동 제출
  - 헬퍼 스크립트 활용
  - 로그 파일로 추적
```

---

**문의사항이 있으시면 이슈를 등록해주세요!**
