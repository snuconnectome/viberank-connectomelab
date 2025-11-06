/**
 * Lab Statistics API Route
 * GET /api/lab/stats - Returns lab-wide statistics and department breakdown
 * GET /api/lab/stats?department=<dept> - Returns department-specific statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

// Initialize Convex client
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  console.error("NEXT_PUBLIC_CONVEX_URL is not set!");
}
const convex = new ConvexHttpClient(CONVEX_URL || "");

export async function GET(request: NextRequest) {
  try {
    // Check if Convex URL is configured
    if (!CONVEX_URL) {
      console.error("NEXT_PUBLIC_CONVEX_URL environment variable is not set");
      return NextResponse.json(
        { error: "Server configuration error. Please contact support." },
        { status: 500 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const department = searchParams.get("department");
    const includeActivity = searchParams.get("includeActivity");
    const activityLimit = searchParams.get("activityLimit");

    // Log request details
    console.log("Stats request received:", {
      department: department || "all",
      includeActivity,
      activityLimit,
      url: request.url,
    });

    let stats;

    if (department) {
      // Department-specific statistics
      stats = await convex.query(api.labLeaderboard.getDepartmentStats, {
        department,
      });

      return NextResponse.json({
        success: true,
        stats,
        scope: "department",
        department,
      });
    } else {
      // Lab-wide statistics
      const labStats = await convex.query(api.labLeaderboard.getLabStats, {});

      // Optionally include activity timeline
      let activity = null;
      if (includeActivity === "true") {
        const limit = activityLimit ? parseInt(activityLimit) : undefined;
        if (limit !== undefined && (isNaN(limit) || limit < 1)) {
          return NextResponse.json(
            {
              error:
                "Invalid 'activityLimit' parameter. Must be a positive integer.",
            },
            { status: 400 }
          );
        }

        activity = await convex.query(api.labLeaderboard.getActivityTimeline, {
          limit,
        });
      }

      return NextResponse.json({
        success: true,
        stats: labStats,
        activity,
        scope: "lab",
      });
    }
  } catch (error) {
    console.error("Stats query error:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error occurred";

    return NextResponse.json(
      {
        error: `Failed to retrieve statistics: ${errorMessage}. Please try again.`,
      },
      { status: 500 }
    );
  }
}

// Support OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
