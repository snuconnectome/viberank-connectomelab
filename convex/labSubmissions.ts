/**
 * Lab Submissions - Mutation and Query Functions
 * Handles research lab token usage submissions with data validation and merging
 */

import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  validateTokenMath,
  validateNegatives,
  validateDates,
  detectAnomalies,
  mergeDailyData,
  recalculateTotals,
  type DailyData,
} from "./lib/validation";

/**
 * Submit or update lab usage data for a researcher
 * Merges with existing data if researcher has previous submissions
 */
export const submit = mutation({
  args: {
    researcherUsername: v.string(),
    department: v.string(),
    machineId: v.string(),
    machineName: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    // Validation: Token math
    if (!validateTokenMath(args)) {
      throw new Error(
        "Token calculation invalid: input + output + cache != total"
      );
    }

    // Validation: No negative values
    if (!validateNegatives(args)) {
      throw new Error("Negative values detected in submission");
    }

    // Validation: Date range
    if (!validateDates(args.dateRange.start) || !validateDates(args.dateRange.end)) {
      throw new Error("Future dates not allowed in date range");
    }

    // Validation: Daily breakdown dates
    for (const day of args.dailyBreakdown) {
      if (!validateDates(day.date)) {
        throw new Error(`Future date not allowed: ${day.date}`);
      }
    }

    // Anomaly detection
    const anomalyCheck = detectAnomalies(args);

    // Check for existing submission by this researcher on this machine
    const existing = await ctx.db
      .query("labSubmissions")
      .withIndex("by_researcher_machine", (q) =>
        q.eq("researcherUsername", args.researcherUsername)
         .eq("machineId", args.machineId)
      )
      .first();

    let submissionId;
    let isNew = false;

    if (existing) {
      // Merge with existing data
      const mergedDaily = mergeDailyData(
        existing.dailyBreakdown as DailyData[],
        args.dailyBreakdown as DailyData[]
      );

      // Recalculate totals from merged daily data
      const recalculated = recalculateTotals(mergedDaily);

      // Update existing submission
      submissionId = existing._id;
      await ctx.db.patch(existing._id, {
        ...recalculated,
        dailyBreakdown: mergedDaily,
        submittedAt: Date.now(),
        verified: true,
        flaggedForReview: anomalyCheck.flagged,
        flagReasons: anomalyCheck.flagged ? anomalyCheck.reasons : undefined,
      });
    } else {
      // Create new submission
      isNew = true;
      submissionId = await ctx.db.insert("labSubmissions", {
        researcherUsername: args.researcherUsername,
        department: args.department,
        machineId: args.machineId,
        machineName: args.machineName,
        totalTokens: args.totalTokens,
        totalCost: args.totalCost,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        cacheCreationTokens: args.cacheCreationTokens,
        cacheReadTokens: args.cacheReadTokens,
        dateRange: args.dateRange,
        modelsUsed: args.modelsUsed,
        dailyBreakdown: args.dailyBreakdown,
        submittedAt: Date.now(),
        verified: true,
        flaggedForReview: anomalyCheck.flagged,
        flagReasons: anomalyCheck.flagged ? anomalyCheck.reasons : undefined,
      });
    }

    // Schedule researcher profile update
    await ctx.scheduler.runAfter(
      0,
      internal.labResearchers.updateResearcherStats,
      {
        username: args.researcherUsername,
        department: args.department,
      }
    );

    return {
      success: true,
      submissionId,
      isNew,
      flagged: anomalyCheck.flagged,
      flagReasons: anomalyCheck.reasons,
      message: isNew
        ? `New submission created for ${args.researcherUsername}`
        : `Data merged for ${args.researcherUsername}`,
    };
  },
});

/**
 * Get submission details by researcher username
 */
export const getByResearcher = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db
      .query("labSubmissions")
      .withIndex("by_researcher", (q) =>
        q.eq("researcherUsername", args.username)
      )
      .first();

    return submission;
  },
});

/**
 * Get all submissions for a department
 */
export const getByDepartment = query({
  args: {
    department: v.string(),
  },
  handler: async (ctx, args) => {
    const submissions = await ctx.db
      .query("labSubmissions")
      .withIndex("by_department", (q) => q.eq("department", args.department))
      .collect();

    return submissions;
  },
});

/**
 * Get flagged submissions for review
 */
export const getFlagged = query({
  args: {},
  handler: async (ctx) => {
    const flagged = await ctx.db
      .query("labSubmissions")
      .filter((q) => q.eq(q.field("flaggedForReview"), true))
      .collect();

    return flagged;
  },
});

/**
 * Get recent submissions across all researchers
 */
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const recent = await ctx.db
      .query("labSubmissions")
      .withIndex("by_submitted_at")
      .order("desc")
      .take(limit);

    return recent;
  },
});

/**
 * Get all submissions for a specific researcher and machine
 */
export const getByResearcherAndMachine = query({
  args: {
    username: v.string(),
    machineId: v.string(),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db
      .query("labSubmissions")
      .withIndex("by_researcher_machine", (q) =>
        q.eq("researcherUsername", args.username)
         .eq("machineId", args.machineId)
      )
      .first();

    return submission;
  },
});

/**
 * Get all machines used by a specific researcher
 */
export const getMachinesByResearcher = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const submissions = await ctx.db
      .query("labSubmissions")
      .withIndex("by_researcher", (q) =>
        q.eq("researcherUsername", args.username)
      )
      .collect();

    // Extract unique machine information
    const machinesMap = new Map<string, { machineId: string; machineName?: string }>();

    submissions.forEach((submission) => {
      if (!machinesMap.has(submission.machineId)) {
        machinesMap.set(submission.machineId, {
          machineId: submission.machineId,
          machineName: submission.machineName,
        });
      }
    });

    return Array.from(machinesMap.values());
  },
});
