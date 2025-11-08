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
    const trajectory = submission.ccData.daily.map(day => ({
      date: day.date,
      inputTokens: day.inputTokens,
      outputTokens: day.outputTokens,
      cacheTokens: day.cacheCreationTokens + day.cacheReadTokens,
      totalTokens: day.totalTokens,
      cost: day.totalCost,
      models: day.modelsUsed
    }));

    // Calculate summary statistics
    const totalDays = submission.ccData.daily.length;
    const averageDailyTokens = Math.round(submission.ccData.totals.totalTokens / totalDays);
    const averageDailyCost = submission.ccData.totals.totalCost / totalDays;

    const peakDay = submission.ccData.daily.reduce((max, day) =>
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
          start: submission.ccData.daily[0]?.date,
          end: submission.ccData.daily[totalDays - 1]?.date
        },
        totals: submission.ccData.totals,
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
