import { query } from "./_generated/server";
import { v } from "convex/values";

export const getUserTrajectory = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    // Get user's latest submission
    const submission = await ctx.db
      .query("submissions")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .order("desc")
      .first();

    if (!submission) return null;

    // Transform daily data for chart consumption
    const trajectory = submission.dailyBreakdown.map(day => ({
      date: day.date,
      inputTokens: day.inputTokens,
      outputTokens: day.outputTokens,
      cacheTokens: day.cacheCreationTokens + day.cacheReadTokens,
      totalTokens: day.totalTokens,
      cost: day.totalCost,
      models: day.modelsUsed
    }));

    // Calculate summary statistics
    const totalDays = submission.dailyBreakdown.length;
    const averageDailyTokens = Math.round(submission.totalTokens / totalDays);
    const averageDailyCost = submission.totalCost / totalDays;

    const peakDay = submission.dailyBreakdown.reduce((max, day) =>
      day.totalTokens > max.totalTokens ? day : max
    );

    return {
      username: submission.username,
      githubName: submission.githubName,
      githubAvatar: submission.githubAvatar,
      verified: submission.verified,
      trajectory,
      summary: {
        totalDays,
        dateRange: {
          start: submission.dailyBreakdown[0]?.date,
          end: submission.dailyBreakdown[totalDays - 1]?.date
        },
        totals: {
          totalTokens: submission.totalTokens,
          totalCost: submission.totalCost,
          inputTokens: submission.inputTokens,
          outputTokens: submission.outputTokens,
          cacheCreationTokens: submission.cacheCreationTokens,
          cacheReadTokens: submission.cacheReadTokens
        },
        averageDaily: {
          tokens: averageDailyTokens,
          cost: averageDailyCost
        },
        peak: {
          tokens: peakDay.totalTokens,
          cost: peakDay.totalCost,
          date: peakDay.date
        }
      }
    };
  }
});
