/**
 * Lab Leaderboard API Route
 * GET /api/lab/leaderboard - Returns ranked leaderboard with optional filters
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
    const limitParam = searchParams.get("limit");
    const daysParam = searchParams.get("days");

    // Log request details
    console.log("Leaderboard request received:", {
      limit: limitParam,
      days: daysParam,
      url: request.url,
    });

    let leaderboard;

    if (daysParam) {
      // Date-filtered leaderboard
      const days = parseInt(daysParam);

      if (isNaN(days) || days < 1) {
        return NextResponse.json(
          { error: "Invalid 'days' parameter. Must be a positive integer." },
          { status: 400 }
        );
      }

      const limit = limitParam ? parseInt(limitParam) : undefined;
      if (limit !== undefined && (isNaN(limit) || limit < 1)) {
        return NextResponse.json(
          { error: "Invalid 'limit' parameter. Must be a positive integer." },
          { status: 400 }
        );
      }

      leaderboard = await convex.query(
        api.labLeaderboard.getLeaderboardByDateRange,
        {
          days,
          limit,
        }
      );
    } else {
      // All-time leaderboard
      const limit = limitParam ? parseInt(limitParam) : undefined;
      if (limit !== undefined && (isNaN(limit) || limit < 1)) {
        return NextResponse.json(
          { error: "Invalid 'limit' parameter. Must be a positive integer." },
          { status: 400 }
        );
      }

      leaderboard = await convex.query(api.labLeaderboard.getLeaderboard, {
        limit,
      });
    }

    return NextResponse.json({
      success: true,
      leaderboard,
      count: leaderboard.length,
      filters: {
        days: daysParam ? parseInt(daysParam) : null,
        limit: limitParam ? parseInt(limitParam) : null,
      },
    });
  } catch (error) {
    console.error("Leaderboard query error:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error occurred";

    return NextResponse.json(
      {
        error: `Failed to retrieve leaderboard: ${errorMessage}. Please try again.`,
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
