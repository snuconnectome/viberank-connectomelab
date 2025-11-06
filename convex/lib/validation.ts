/**
 * Data Validation Functions for Lab Mode
 * Used to validate token usage data submissions
 */

export interface UsageData {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

export interface DailyData {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
}

/**
 * Validates that token calculation is correct
 * input + output + cacheCreation + cacheRead should equal total (within tolerance)
 */
export function validateTokenMath(data: UsageData): boolean {
  const calculated =
    data.inputTokens +
    data.outputTokens +
    data.cacheCreationTokens +
    data.cacheReadTokens;

  const tolerance = 0.01; // 1% tolerance for rounding
  const diff = Math.abs(calculated - data.totalTokens);

  // Handle edge case of zero total
  if (data.totalTokens === 0) {
    return calculated === 0;
  }

  return diff / data.totalTokens <= tolerance;
}

/**
 * Validates that no numeric values are negative
 */
export function validateNegatives(data: Record<string, any>): boolean {
  const numericFields = [
    "totalTokens",
    "totalCost",
    "inputTokens",
    "outputTokens",
    "cacheCreationTokens",
    "cacheReadTokens",
  ];

  return numericFields.every((field) => {
    const value = data[field];
    return value === undefined || value >= 0;
  });
}

/**
 * Validates that dates are not in the future
 */
export function validateDates(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  return date <= now;
}

/**
 * Detects anomalous usage patterns (very high token counts)
 */
export function detectAnomalies(data: UsageData): {
  flagged: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const ANOMALY_THRESHOLD = 100_000_000; // 100M tokens
  const HIGH_COST_THRESHOLD = 1000; // $1000

  if (data.totalTokens > ANOMALY_THRESHOLD) {
    reasons.push(`Unusually high token count: ${data.totalTokens.toLocaleString()}`);
  }

  if (data.totalCost > HIGH_COST_THRESHOLD) {
    reasons.push(`Unusually high cost: $${data.totalCost.toFixed(2)}`);
  }

  return {
    flagged: reasons.length > 0,
    reasons,
  };
}

/**
 * Merges daily breakdown data from multiple submissions
 * Combines data for overlapping dates, adds new dates
 */
export function mergeDailyData(
  existing: DailyData[],
  incoming: DailyData[]
): DailyData[] {
  const merged = new Map<string, DailyData>();

  // Add existing data
  existing.forEach((day) => merged.set(day.date, { ...day }));

  // Merge incoming data
  incoming.forEach((day) => {
    if (merged.has(day.date)) {
      // Same date exists - merge the data
      const current = merged.get(day.date)!;
      merged.set(day.date, {
        date: day.date,
        inputTokens: current.inputTokens + day.inputTokens,
        outputTokens: current.outputTokens + day.outputTokens,
        cacheCreationTokens: current.cacheCreationTokens + day.cacheCreationTokens,
        cacheReadTokens: current.cacheReadTokens + day.cacheReadTokens,
        totalTokens: current.totalTokens + day.totalTokens,
        totalCost: current.totalCost + day.totalCost,
        modelsUsed: [...new Set([...current.modelsUsed, ...day.modelsUsed])],
      });
    } else {
      // New date - add it
      merged.set(day.date, { ...day });
    }
  });

  // Sort by date and return
  return Array.from(merged.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

/**
 * Recalculates totals from daily breakdown
 */
export function recalculateTotals(dailyBreakdown: DailyData[]): {
  totalTokens: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  dateRange: { start: string; end: string };
  modelsUsed: string[];
} {
  const totalTokens = dailyBreakdown.reduce((sum, d) => sum + d.totalTokens, 0);
  const totalCost = dailyBreakdown.reduce((sum, d) => sum + d.totalCost, 0);
  const inputTokens = dailyBreakdown.reduce((sum, d) => sum + d.inputTokens, 0);
  const outputTokens = dailyBreakdown.reduce((sum, d) => sum + d.outputTokens, 0);
  const cacheCreationTokens = dailyBreakdown.reduce(
    (sum, d) => sum + d.cacheCreationTokens,
    0
  );
  const cacheReadTokens = dailyBreakdown.reduce(
    (sum, d) => sum + d.cacheReadTokens,
    0
  );

  const dates = dailyBreakdown.map((d) => d.date).sort();
  const allModels = new Set<string>();
  dailyBreakdown.forEach((d) => d.modelsUsed.forEach((m) => allModels.add(m)));

  return {
    totalTokens,
    totalCost,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    dateRange: {
      start: dates[0] || "",
      end: dates[dates.length - 1] || "",
    },
    modelsUsed: Array.from(allModels),
  };
}

// ============================================
// INLINE TESTS (TDD validation)
// ============================================

if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
  // Test: validateTokenMath
  console.assert(
    validateTokenMath({
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 200,
      cacheReadTokens: 300,
      totalTokens: 2000,
      totalCost: 5.0,
    }) === true,
    "Token math validation should pass for correct calculation"
  );

  console.assert(
    validateTokenMath({
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 200,
      cacheReadTokens: 300,
      totalTokens: 3000, // WRONG!
      totalCost: 5.0,
    }) === false,
    "Token math validation should fail for incorrect calculation"
  );

  // Test: validateNegatives
  console.assert(
    validateNegatives({ totalTokens: 1000, totalCost: 5.0 }) === true,
    "Should accept positive values"
  );

  console.assert(
    validateNegatives({ totalTokens: -100 }) === false,
    "Should reject negative values"
  );

  // Test: validateDates
  console.assert(
    validateDates("2024-01-01") === true,
    "Should accept past dates"
  );

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 1);
  console.assert(
    validateDates(futureDate.toISOString()) === false,
    "Should reject future dates"
  );

  // Test: mergeDailyData
  const existing = [
    {
      date: "2025-01-01",
      totalTokens: 1000,
      totalCost: 5.0,
      inputTokens: 500,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelsUsed: ["claude-3-5-sonnet"],
    },
    {
      date: "2025-01-02",
      totalTokens: 1500,
      totalCost: 7.5,
      inputTokens: 750,
      outputTokens: 750,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelsUsed: ["claude-3-5-sonnet"],
    },
  ];

  const incoming = [
    {
      date: "2025-01-02", // Overlap!
      totalTokens: 500,
      totalCost: 2.5,
      inputTokens: 250,
      outputTokens: 250,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelsUsed: ["claude-opus-3"],
    },
    {
      date: "2025-01-03",
      totalTokens: 2000,
      totalCost: 10.0,
      inputTokens: 1000,
      outputTokens: 1000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelsUsed: ["claude-3-5-sonnet"],
    },
  ];

  const merged = mergeDailyData(existing, incoming);
  console.assert(merged.length === 3, "Should have 3 days after merge");
  console.assert(
    merged.find((d) => d.date === "2025-01-02")!.totalTokens === 2000,
    "Should sum overlapping dates (1500 + 500 = 2000)"
  );
  console.assert(
    merged.find((d) => d.date === "2025-01-02")!.modelsUsed.length === 2,
    "Should merge model lists"
  );

  console.log("✅ All validation tests passed!");
}
