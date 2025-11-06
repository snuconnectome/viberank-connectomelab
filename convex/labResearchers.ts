/**
 * Lab Researchers - Profile and Stats Management
 * Handles researcher profile creation and statistics aggregation
 */

import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get researcher profile by username
 */
export const getProfile = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const researcher = await ctx.db
      .query("labResearchers")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (!researcher) {
      return null;
    }

    // Get the researcher's submission data
    const submission = await ctx.db
      .query("labSubmissions")
      .withIndex("by_researcher", (q) =>
        q.eq("researcherUsername", args.username)
      )
      .first();

    return {
      ...researcher,
      submission,
    };
  },
});

/**
 * Get all researchers for a department
 */
export const getByDepartment = query({
  args: {
    department: v.string(),
  },
  handler: async (ctx, args) => {
    const researchers = await ctx.db
      .query("labResearchers")
      .withIndex("by_department", (q) => q.eq("department", args.department))
      .collect();

    return researchers;
  },
});

/**
 * Get top researchers by total cost
 */
export const getTopResearchers = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    const top = await ctx.db
      .query("labResearchers")
      .withIndex("by_total_cost")
      .order("desc")
      .take(limit);

    return top;
  },
});

/**
 * Internal mutation to update researcher stats
 * Called automatically after submission updates
 */
export const updateResearcherStats = internalMutation({
  args: {
    username: v.string(),
    department: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the researcher's submission
    const submission = await ctx.db
      .query("labSubmissions")
      .withIndex("by_researcher", (q) =>
        q.eq("researcherUsername", args.username)
      )
      .first();

    if (!submission) {
      // No submission found - this shouldn't happen but handle gracefully
      return { success: false, error: "No submission found" };
    }

    // Check if researcher profile exists
    const existingResearcher = await ctx.db
      .query("labResearchers")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    // Get all submissions for this researcher to calculate total submissions
    const allSubmissions = await ctx.db
      .query("labSubmissions")
      .withIndex("by_researcher", (q) =>
        q.eq("researcherUsername", args.username)
      )
      .collect();

    const totalSubmissions = allSubmissions.length;

    // Find earliest and latest submission times
    const submissionTimes = allSubmissions.map((s) => s.submittedAt);
    const firstSubmission = Math.min(...submissionTimes);
    const lastSubmission = Math.max(...submissionTimes);

    if (existingResearcher) {
      // Update existing researcher profile
      await ctx.db.patch(existingResearcher._id, {
        department: args.department, // Allow department changes
        totalSubmissions,
        totalTokens: submission.totalTokens,
        totalCost: submission.totalCost,
        firstSubmission,
        lastSubmission,
      });

      return {
        success: true,
        updated: true,
        researcherId: existingResearcher._id,
      };
    } else {
      // Create new researcher profile
      const researcherId = await ctx.db.insert("labResearchers", {
        username: args.username,
        department: args.department,
        totalSubmissions,
        totalTokens: submission.totalTokens,
        totalCost: submission.totalCost,
        firstSubmission,
        lastSubmission,
        createdAt: Date.now(),
      });

      return {
        success: true,
        updated: false,
        researcherId,
      };
    }
  },
});

/**
 * Get total researcher count
 */
export const getResearcherCount = query({
  args: {},
  handler: async (ctx) => {
    const researchers = await ctx.db.query("labResearchers").collect();
    return researchers.length;
  },
});

/**
 * Get researcher stats summary
 */
export const getResearcherStats = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const researcher = await ctx.db
      .query("labResearchers")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (!researcher) {
      return null;
    }

    const submission = await ctx.db
      .query("labSubmissions")
      .withIndex("by_researcher", (q) =>
        q.eq("researcherUsername", args.username)
      )
      .first();

    if (!submission) {
      return {
        ...researcher,
        dailyBreakdown: [],
        modelsUsed: [],
      };
    }

    return {
      ...researcher,
      dailyBreakdown: submission.dailyBreakdown,
      modelsUsed: submission.modelsUsed,
      dateRange: submission.dateRange,
    };
  },
});
