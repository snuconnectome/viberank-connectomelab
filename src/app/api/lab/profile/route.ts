/**
 * Lab Researcher Profile API Route
 * GET /api/lab/profile?username=<username> - Returns researcher profile with submission data
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
    const username = searchParams.get("username");

    // Validate required parameters
    if (!username) {
      return NextResponse.json(
        {
          error:
            "Missing required parameter 'username'. Please provide ?username=<researcher_username>",
        },
        { status: 400 }
      );
    }

    // Log request details
    console.log("Profile request received:", {
      username,
      url: request.url,
    });

    // Query researcher profile with enriched submission data
    const profile = await convex.query(api.labResearchers.getProfile, {
      username,
    });

    if (!profile) {
      return NextResponse.json(
        {
          error: `No profile found for researcher: ${username}`,
        },
        { status: 404 }
      );
    }

    // Query detailed stats with daily breakdown
    const stats = await convex.query(api.labResearchers.getResearcherStats, {
      username,
    });

    return NextResponse.json({
      success: true,
      profile: {
        ...profile,
        stats: stats || {
          dailyBreakdown: [],
          modelsUsed: [],
        },
      },
    });
  } catch (error) {
    console.error("Profile query error:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error occurred";

    return NextResponse.json(
      {
        error: `Failed to retrieve profile: ${errorMessage}. Please try again.`,
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
