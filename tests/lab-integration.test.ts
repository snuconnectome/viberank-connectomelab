/**
 * Lab Mode Integration Tests
 * End-to-end testing for complete lab submission workflow
 */

import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

describe("Lab Mode Integration Tests", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema);
    await t.run(async (ctx) => {
      // Clean up any existing test data
      const submissions = await ctx.db.query("labSubmissions").collect();
      for (const sub of submissions) {
        await ctx.db.delete(sub._id);
      }
      const researchers = await ctx.db.query("labResearchers").collect();
      for (const res of researchers) {
        await ctx.db.delete(res._id);
      }
    });
  });

  describe("Full Submission Workflow", () => {
    it("should handle complete submission flow for new researcher", async () => {
      // Prepare test data
      const submissionData = {
        researcherUsername: "test-researcher",
        department: "Psychology",
        totalTokens: 10000,
        totalCost: 5.0,
        inputTokens: 6000,
        outputTokens: 3000,
        cacheCreationTokens: 500,
        cacheReadTokens: 500,
        dateRange: {
          start: "2025-01-01",
          end: "2025-01-05",
        },
        modelsUsed: ["claude-3-5-sonnet", "claude-opus-3"],
        dailyBreakdown: [
          {
            date: "2025-01-01",
            inputTokens: 1200,
            outputTokens: 600,
            cacheCreationTokens: 100,
            cacheReadTokens: 100,
            totalTokens: 2000,
            totalCost: 1.0,
            modelsUsed: ["claude-3-5-sonnet"],
          },
          {
            date: "2025-01-02",
            inputTokens: 1200,
            outputTokens: 600,
            cacheCreationTokens: 100,
            cacheReadTokens: 100,
            totalTokens: 2000,
            totalCost: 1.0,
            modelsUsed: ["claude-3-5-sonnet"],
          },
          {
            date: "2025-01-03",
            inputTokens: 1200,
            outputTokens: 600,
            cacheCreationTokens: 100,
            cacheReadTokens: 100,
            totalTokens: 2000,
            totalCost: 1.0,
            modelsUsed: ["claude-opus-3"],
          },
          {
            date: "2025-01-04",
            inputTokens: 1200,
            outputTokens: 600,
            cacheCreationTokens: 100,
            cacheReadTokens: 100,
            totalTokens: 2000,
            totalCost: 1.0,
            modelsUsed: ["claude-3-5-sonnet"],
          },
          {
            date: "2025-01-05",
            inputTokens: 1200,
            outputTokens: 600,
            cacheCreationTokens: 100,
            cacheReadTokens: 100,
            totalTokens: 2000,
            totalCost: 1.0,
            modelsUsed: ["claude-opus-3"],
          },
        ],
      };

      // Step 1: Submit data
      const submitResult = await t.mutation(api.labSubmissions.submit, submissionData);

      expect(submitResult.success).toBe(true);
      expect(submitResult.isNew).toBe(true);
      expect(submitResult.flagged).toBe(false);

      // Step 2: Trigger researcher profile update (normally done by scheduler)
      const updateResult = await t.mutation(
        api.labResearchers.updateResearcherStats,
        {
          username: "test-researcher",
          department: "Psychology",
        }
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.updated).toBe(false); // First time, so created not updated

      // Step 3: Query submission data
      const submission = await t.query(api.labSubmissions.getByResearcher, {
        username: "test-researcher",
      });

      expect(submission).toBeDefined();
      expect(submission?.researcherUsername).toBe("test-researcher");
      expect(submission?.totalTokens).toBe(10000);
      expect(submission?.totalCost).toBe(5.0);
      expect(submission?.dailyBreakdown).toHaveLength(5);

      // Step 4: Query researcher profile
      const profile = await t.query(api.labResearchers.getProfile, {
        username: "test-researcher",
      });

      expect(profile).toBeDefined();
      expect(profile?.username).toBe("test-researcher");
      expect(profile?.department).toBe("Psychology");
      expect(profile?.totalTokens).toBe(10000);
      expect(profile?.totalCost).toBe(5.0);
      expect(profile?.totalSubmissions).toBe(1);

      // Step 5: Check leaderboard
      const leaderboard = await t.query(api.labLeaderboard.getLeaderboard, {});

      expect(leaderboard).toHaveLength(1);
      expect(leaderboard[0].username).toBe("test-researcher");
      expect(leaderboard[0].rank).toBe(1);

      // Step 6: Check lab stats
      const labStats = await t.query(api.labLeaderboard.getLabStats, {});

      expect(labStats.totalResearchers).toBe(1);
      expect(labStats.totalTokens).toBe(10000);
      expect(labStats.totalCost).toBe(5.0);
    });

    it("should merge data from multiple submissions (multiple machines)", async () => {
      // First submission from Machine 1
      const submission1 = {
        researcherUsername: "merge-test",
        department: "Neuroscience",
        totalTokens: 5000,
        totalCost: 2.5,
        inputTokens: 3000,
        outputTokens: 1500,
        cacheCreationTokens: 250,
        cacheReadTokens: 250,
        dateRange: {
          start: "2025-01-01",
          end: "2025-01-03",
        },
        modelsUsed: ["claude-3-5-sonnet"],
        dailyBreakdown: [
          {
            date: "2025-01-01",
            inputTokens: 1000,
            outputTokens: 500,
            cacheCreationTokens: 100,
            cacheReadTokens: 100,
            totalTokens: 1700,
            totalCost: 0.85,
            modelsUsed: ["claude-3-5-sonnet"],
          },
          {
            date: "2025-01-02",
            inputTokens: 1000,
            outputTokens: 500,
            cacheCreationTokens: 75,
            cacheReadTokens: 75,
            totalTokens: 1650,
            totalCost: 0.825,
            modelsUsed: ["claude-3-5-sonnet"],
          },
          {
            date: "2025-01-03",
            inputTokens: 1000,
            outputTokens: 500,
            cacheCreationTokens: 75,
            cacheReadTokens: 75,
            totalTokens: 1650,
            totalCost: 0.825,
            modelsUsed: ["claude-3-5-sonnet"],
          },
        ],
      };

      // Second submission from Machine 2 (overlapping dates)
      const submission2 = {
        researcherUsername: "merge-test",
        department: "Neuroscience",
        totalTokens: 3000,
        totalCost: 1.5,
        inputTokens: 1800,
        outputTokens: 900,
        cacheCreationTokens: 150,
        cacheReadTokens: 150,
        dateRange: {
          start: "2025-01-02",
          end: "2025-01-04",
        },
        modelsUsed: ["claude-opus-3"],
        dailyBreakdown: [
          {
            date: "2025-01-02",
            inputTokens: 600,
            outputTokens: 300,
            cacheCreationTokens: 50,
            cacheReadTokens: 50,
            totalTokens: 1000,
            totalCost: 0.5,
            modelsUsed: ["claude-opus-3"],
          },
          {
            date: "2025-01-03",
            inputTokens: 600,
            outputTokens: 300,
            cacheCreationTokens: 50,
            cacheReadTokens: 50,
            totalTokens: 1000,
            totalCost: 0.5,
            modelsUsed: ["claude-opus-3"],
          },
          {
            date: "2025-01-04",
            inputTokens: 600,
            outputTokens: 300,
            cacheCreationTokens: 50,
            cacheReadTokens: 50,
            totalTokens: 1000,
            totalCost: 0.5,
            modelsUsed: ["claude-opus-3"],
          },
        ],
      };

      // Submit first data
      const result1 = await t.mutation(api.labSubmissions.submit, submission1);
      expect(result1.isNew).toBe(true);

      // Submit second data (should merge)
      const result2 = await t.mutation(api.labSubmissions.submit, submission2);
      expect(result2.isNew).toBe(false);

      // Query merged data
      const merged = await t.query(api.labSubmissions.getByResearcher, {
        username: "merge-test",
      });

      expect(merged).toBeDefined();
      expect(merged?.dailyBreakdown).toHaveLength(4); // 4 unique dates: 01, 02, 03, 04

      // Check Jan 2 and Jan 3 were merged (overlapping dates)
      const jan02 = merged?.dailyBreakdown.find((d) => d.date === "2025-01-02");
      expect(jan02?.totalTokens).toBe(2650); // 1650 + 1000

      const jan03 = merged?.dailyBreakdown.find((d) => d.date === "2025-01-03");
      expect(jan03?.totalTokens).toBe(2650); // 1650 + 1000

      // Check models were merged
      expect(jan02?.modelsUsed).toContain("claude-3-5-sonnet");
      expect(jan02?.modelsUsed).toContain("claude-opus-3");

      // Check totals were recalculated
      expect(merged?.totalTokens).toBeGreaterThan(5000);
      expect(merged?.totalCost).toBeGreaterThan(2.5);
    });
  });

  describe("Validation and Error Handling", () => {
    it("should reject submission with invalid token math", async () => {
      const invalidData = {
        researcherUsername: "invalid-user",
        department: "Test",
        totalTokens: 50000, // WRONG: should be 6000 + 3000 + 500 + 500 = 10000
        totalCost: 5.0,
        inputTokens: 6000,
        outputTokens: 3000,
        cacheCreationTokens: 500,
        cacheReadTokens: 500,
        dateRange: { start: "2025-01-01", end: "2025-01-01" },
        modelsUsed: ["claude-3-5-sonnet"],
        dailyBreakdown: [
          {
            date: "2025-01-01",
            inputTokens: 1000,
            outputTokens: 1000,
            cacheCreationTokens: 1000,
            cacheReadTokens: 1000,
            totalTokens: 5000, // WRONG: should be 4000
            totalCost: 1.0,
            modelsUsed: ["claude-3-5-sonnet"],
          },
        ],
      };

      await expect(t.mutation(api.labSubmissions.submit, invalidData)).rejects.toThrow(
        /Token calculation invalid/
      );
    });

    it("should reject submission with negative values", async () => {
      const negativeData = {
        researcherUsername: "negative-user",
        department: "Test",
        totalTokens: -1000, // NEGATIVE!
        totalCost: 5.0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        dateRange: { start: "2025-01-01", end: "2025-01-01" },
        modelsUsed: ["claude-3-5-sonnet"],
        dailyBreakdown: [],
      };

      await expect(t.mutation(api.labSubmissions.submit, negativeData)).rejects.toThrow(
        /Negative values detected/
      );
    });

    it("should reject submission with future dates", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const futureDateStr = futureDate.toISOString().split("T")[0];

      const futureData = {
        researcherUsername: "future-user",
        department: "Test",
        totalTokens: 1000,
        totalCost: 1.0,
        inputTokens: 500,
        outputTokens: 300,
        cacheCreationTokens: 100,
        cacheReadTokens: 100,
        dateRange: { start: "2025-01-01", end: futureDateStr },
        modelsUsed: ["claude-3-5-sonnet"],
        dailyBreakdown: [],
      };

      await expect(t.mutation(api.labSubmissions.submit, futureData)).rejects.toThrow(
        /Future dates not allowed/
      );
    });

    it("should flag anomalous usage patterns", async () => {
      const anomalousData = {
        researcherUsername: "anomaly-user",
        department: "Test",
        totalTokens: 150_000_000, // 150M tokens - ANOMALY!
        totalCost: 75000.0,
        inputTokens: 90_000_000,
        outputTokens: 45_000_000,
        cacheCreationTokens: 7_500_000,
        cacheReadTokens: 7_500_000,
        dateRange: { start: "2025-01-01", end: "2025-01-01" },
        modelsUsed: ["claude-3-5-sonnet"],
        dailyBreakdown: [
          {
            date: "2025-01-01",
            inputTokens: 90_000_000,
            outputTokens: 45_000_000,
            cacheCreationTokens: 7_500_000,
            cacheReadTokens: 7_500_000,
            totalTokens: 150_000_000,
            totalCost: 75000.0,
            modelsUsed: ["claude-3-5-sonnet"],
          },
        ],
      };

      const result = await t.mutation(api.labSubmissions.submit, anomalousData);

      expect(result.flagged).toBe(true);
      expect(result.flagReasons.length).toBe(2);
      expect(result.flagReasons.some((r: string) => r.includes("Unusually high token count"))).toBe(true);
      expect(result.flagReasons.some((r: string) => r.includes("Unusually high cost"))).toBe(true);

      // Verify flagged submission appears in getFlagged query
      const flagged = await t.query(api.labSubmissions.getFlagged, {});
      expect(flagged).toHaveLength(1);
      expect(flagged[0].researcherUsername).toBe("anomaly-user");
    });
  });

  describe("Query Operations", () => {
    beforeEach(async () => {
      // Setup test data for query tests
      const researchers = [
        {
          username: "researcher-1",
          department: "Psychology",
          totalTokens: 50000,
          totalCost: 25.0,
        },
        {
          username: "researcher-2",
          department: "Psychology",
          totalTokens: 30000,
          totalCost: 15.0,
        },
        {
          username: "researcher-3",
          department: "Neuroscience",
          totalTokens: 70000,
          totalCost: 35.0,
        },
      ];

      for (const r of researchers) {
        await t.mutation(api.labSubmissions.submit, {
          researcherUsername: r.username,
          department: r.department,
          totalTokens: r.totalTokens,
          totalCost: r.totalCost,
          inputTokens: Math.floor(r.totalTokens * 0.6),
          outputTokens: Math.floor(r.totalTokens * 0.3),
          cacheCreationTokens: Math.floor(r.totalTokens * 0.05),
          cacheReadTokens: Math.floor(r.totalTokens * 0.05),
          dateRange: { start: "2025-01-01", end: "2025-01-01" },
          modelsUsed: ["claude-3-5-sonnet"],
          dailyBreakdown: [
            {
              date: "2025-01-01",
              inputTokens: Math.floor(r.totalTokens * 0.6),
              outputTokens: Math.floor(r.totalTokens * 0.3),
              cacheCreationTokens: Math.floor(r.totalTokens * 0.05),
              cacheReadTokens: Math.floor(r.totalTokens * 0.05),
              totalTokens: r.totalTokens,
              totalCost: r.totalCost,
              modelsUsed: ["claude-3-5-sonnet"],
            },
          ],
        });

        await t.mutation(api.labResearchers.updateResearcherStats, {
          username: r.username,
          department: r.department,
        });
      }
    });

    it("should return correct leaderboard rankings", async () => {
      const leaderboard = await t.query(api.labLeaderboard.getLeaderboard, {});

      expect(leaderboard).toHaveLength(3);
      expect(leaderboard[0].username).toBe("researcher-3"); // Highest cost
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[1].username).toBe("researcher-1");
      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[2].username).toBe("researcher-2");
      expect(leaderboard[2].rank).toBe(3);
    });

    it("should filter leaderboard by limit", async () => {
      const leaderboard = await t.query(api.labLeaderboard.getLeaderboard, {
        limit: 2,
      });

      expect(leaderboard).toHaveLength(2);
      expect(leaderboard[0].username).toBe("researcher-3");
      expect(leaderboard[1].username).toBe("researcher-1");
    });

    it("should return department statistics", async () => {
      const psychStats = await t.query(api.labLeaderboard.getDepartmentStats, {
        department: "Psychology",
      });

      expect(psychStats.totalResearchers).toBe(2);
      expect(psychStats.totalTokens).toBe(80000); // 50k + 30k
      expect(psychStats.totalCost).toBe(40.0); // 25 + 15

      const neuroStats = await t.query(api.labLeaderboard.getDepartmentStats, {
        department: "Neuroscience",
      });

      expect(neuroStats.totalResearchers).toBe(1);
      expect(neuroStats.totalTokens).toBe(70000);
      expect(neuroStats.totalCost).toBe(35.0);
    });

    it("should return lab-wide statistics", async () => {
      const labStats = await t.query(api.labLeaderboard.getLabStats, {});

      expect(labStats.totalResearchers).toBe(3);
      expect(labStats.totalDepartments).toBe(2);
      expect(labStats.totalTokens).toBe(150000); // 50k + 30k + 70k
      expect(labStats.totalCost).toBe(75.0); // 25 + 15 + 35
      expect(labStats.averageCostPerResearcher).toBe(25.0);
    });
  });
});
