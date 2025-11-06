/**
 * Lab Leaderboard - Rankings and Aggregate Statistics
 * Handles leaderboard generation and lab-wide statistics
 */

import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get leaderboard sorted by total cost
 */
export const getLeaderboard = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Get top researchers by cost
    const topResearchers = await ctx.db
      .query("labResearchers")
      .withIndex("by_total_cost")
      .order("desc")
      .take(limit);

    // Enrich with submission details for each researcher
    const enriched = await Promise.all(
      topResearchers.map(async (researcher, index) => {
        const submission = await ctx.db
          .query("labSubmissions")
          .withIndex("by_researcher", (q) =>
            q.eq("researcherUsername", researcher.username)
          )
          .first();

        return {
          rank: index + 1,
          username: researcher.username,
          department: researcher.department,
          totalCost: researcher.totalCost,
          totalTokens: researcher.totalTokens,
          totalSubmissions: researcher.totalSubmissions,
          dateRange: submission?.dateRange,
          modelsUsed: submission?.modelsUsed,
          lastSubmission: researcher.lastSubmission,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get leaderboard filtered by date range
 */
export const getLeaderboardByDateRange = query({
  args: {
    days: v.number(), // 7, 30, or custom
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const cutoffTime = Date.now() - args.days * 24 * 60 * 60 * 1000;

    // Get all submissions
    const allSubmissions = await ctx.db
      .query("labSubmissions")
      .withIndex("by_submitted_at")
      .order("desc")
      .collect();

    // Filter by submissions within date range
    const recentSubmissions = allSubmissions.filter(
      (s) => s.submittedAt >= cutoffTime
    );

    // Calculate stats for each researcher based on their daily breakdown within range
    const researcherStats = new Map<
      string,
      {
        username: string;
        department: string;
        totalCost: number;
        totalTokens: number;
        dateRange: { start: string; end: string };
        modelsUsed: string[];
      }
    >();

    for (const submission of recentSubmissions) {
      // Filter daily breakdown to only include dates within range
      const cutoffDate = new Date(cutoffTime);
      const relevantDays = submission.dailyBreakdown.filter((day) => {
        const dayDate = new Date(day.date);
        return dayDate >= cutoffDate;
      });

      if (relevantDays.length === 0) continue;

      // Calculate totals from relevant days
      const totalCost = relevantDays.reduce((sum, d) => sum + d.totalCost, 0);
      const totalTokens = relevantDays.reduce(
        (sum, d) => sum + d.totalTokens,
        0
      );

      // Collect all models used
      const allModels = new Set<string>();
      relevantDays.forEach((day) => {
        day.modelsUsed.forEach((model) => allModels.add(model));
      });

      // Get date range from relevant days
      const dates = relevantDays.map((d) => d.date).sort();
      const dateRange = {
        start: dates[0],
        end: dates[dates.length - 1],
      };

      researcherStats.set(submission.researcherUsername, {
        username: submission.researcherUsername,
        department: submission.department,
        totalCost,
        totalTokens,
        dateRange,
        modelsUsed: Array.from(allModels),
      });
    }

    // Convert to array and sort by total cost
    const leaderboard = Array.from(researcherStats.values())
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, limit)
      .map((item, index) => ({
        rank: index + 1,
        ...item,
      }));

    return leaderboard;
  },
});

/**
 * Get department-level statistics
 */
export const getDepartmentStats = query({
  args: {
    department: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all researchers in department
    const researchers = await ctx.db
      .query("labResearchers")
      .withIndex("by_department", (q) => q.eq("department", args.department))
      .collect();

    // Calculate aggregate stats
    const totalResearchers = researchers.length;
    const totalTokens = researchers.reduce(
      (sum, r) => sum + r.totalTokens,
      0
    );
    const totalCost = researchers.reduce((sum, r) => sum + r.totalCost, 0);

    // Get all submissions for this department
    const submissions = await ctx.db
      .query("labSubmissions")
      .withIndex("by_department", (q) => q.eq("department", args.department))
      .collect();

    // Collect all models used
    const allModels = new Set<string>();
    submissions.forEach((s) => {
      s.modelsUsed.forEach((model) => allModels.add(model));
    });

    return {
      department: args.department,
      totalResearchers,
      totalTokens,
      totalCost,
      averageCostPerResearcher:
        totalResearchers > 0 ? totalCost / totalResearchers : 0,
      averageTokensPerResearcher:
        totalResearchers > 0 ? totalTokens / totalResearchers : 0,
      modelsUsed: Array.from(allModels),
    };
  },
});

/**
 * Get lab-wide statistics across all departments
 */
export const getLabStats = query({
  args: {},
  handler: async (ctx) => {
    // Get all researchers
    const allResearchers = await ctx.db.query("labResearchers").collect();

    // Get all submissions
    const allSubmissions = await ctx.db.query("labSubmissions").collect();

    // Calculate totals
    const totalResearchers = allResearchers.length;
    const totalTokens = allResearchers.reduce(
      (sum, r) => sum + r.totalTokens,
      0
    );
    const totalCost = allResearchers.reduce((sum, r) => sum + r.totalCost, 0);

    // Get unique departments
    const departments = new Set<string>();
    allResearchers.forEach((r) => departments.add(r.department));

    // Get all models used
    const allModels = new Set<string>();
    allSubmissions.forEach((s) => {
      s.modelsUsed.forEach((model) => allModels.add(model));
    });

    // Count model usage
    const modelUsageCounts = new Map<string, number>();
    allSubmissions.forEach((s) => {
      s.modelsUsed.forEach((model) => {
        modelUsageCounts.set(model, (modelUsageCounts.get(model) || 0) + 1);
      });
    });

    // Sort models by usage count
    const topModels = Array.from(modelUsageCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([model, count]) => ({ model, usageCount: count }));

    // Find most recent submission
    const recentSubmission = allSubmissions.reduce(
      (latest, s) => (s.submittedAt > latest ? s.submittedAt : latest),
      0
    );

    return {
      totalResearchers,
      totalDepartments: departments.size,
      totalTokens,
      totalCost,
      averageCostPerResearcher:
        totalResearchers > 0 ? totalCost / totalResearchers : 0,
      averageTokensPerResearcher:
        totalResearchers > 0 ? totalTokens / totalResearchers : 0,
      topModels,
      lastSubmissionAt: recentSubmission,
    };
  },
});

/**
 * Get activity timeline (recent submissions)
 */
export const getActivityTimeline = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const recentSubmissions = await ctx.db
      .query("labSubmissions")
      .withIndex("by_submitted_at")
      .order("desc")
      .take(limit);

    return recentSubmissions.map((s) => ({
      username: s.researcherUsername,
      department: s.department,
      totalCost: s.totalCost,
      totalTokens: s.totalTokens,
      submittedAt: s.submittedAt,
      dateRange: s.dateRange,
    }));
  },
});
