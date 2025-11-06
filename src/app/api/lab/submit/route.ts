import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

// Initialize Convex client
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  console.error("NEXT_PUBLIC_CONVEX_URL is not set!");
}
const convex = new ConvexHttpClient(CONVEX_URL || "");

export async function POST(request: NextRequest) {
  try {
    // Check if Convex URL is configured
    if (!CONVEX_URL) {
      console.error("NEXT_PUBLIC_CONVEX_URL environment variable is not set");
      return NextResponse.json(
        { error: "Server configuration error. Please contact support." },
        { status: 500 }
      );
    }

    // Get researcher authentication headers
    const researcherUsername = request.headers.get("X-Researcher-Username");
    const department = request.headers.get("X-Researcher-Department");

    // Validate required headers
    if (!researcherUsername || !department) {
      return NextResponse.json(
        {
          error:
            "Missing required headers. Please provide X-Researcher-Username and X-Researcher-Department.",
        },
        { status: 400 }
      );
    }

    // Log request details
    console.log("Lab submission request received:", {
      researcherUsername,
      department,
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
      url: request.url,
      method: request.method,
    });

    // Check request size (Vercel has a 4.5MB limit for API routes)
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 4.5 * 1024 * 1024) {
      return NextResponse.json(
        {
          error:
            "Request body too large. Please submit data in smaller batches.",
        },
        { status: 413 }
      );
    }

    // Parse the request body (expecting ccusage JSON format)
    let ccData;
    try {
      ccData = await request.json();
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return NextResponse.json(
        {
          error:
            "Invalid JSON format. Please ensure your cc.json file is valid JSON.",
        },
        { status: 400 }
      );
    }

    // Validate ccData structure
    if (!ccData || typeof ccData !== "object") {
      console.error("Invalid cc.json data: ccData is null or not an object", {
        ccData: ccData,
        type: typeof ccData,
      });
      return NextResponse.json(
        {
          error:
            "Invalid submission data. Please ensure your cc.json file contains valid data.",
        },
        { status: 400 }
      );
    }

    // Validate the cc.json structure
    if (!ccData.daily || !ccData.totals) {
      console.error("Invalid cc.json structure:", {
        hasDaily: !!ccData.daily,
        hasTotals: !!ccData.totals,
        keys: Object.keys(ccData || {}),
      });
      return NextResponse.json(
        {
          error:
            "Invalid cc.json format. Missing 'daily' or 'totals' field. Please regenerate using: npx ccusage@latest --json > cc.json",
        },
        { status: 400 }
      );
    }

    // Validate totals structure
    const requiredTotalFields = [
      "inputTokens",
      "outputTokens",
      "cacheCreationTokens",
      "cacheReadTokens",
      "totalCost",
      "totalTokens",
    ];
    const missingTotalFields = requiredTotalFields.filter(
      (field) =>
        ccData.totals[field] === undefined || ccData.totals[field] === null
    );

    if (missingTotalFields.length > 0) {
      console.error("Missing total fields:", missingTotalFields);
      return NextResponse.json(
        {
          error: `Invalid cc.json format. Missing fields in totals: ${missingTotalFields.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate daily entries
    if (!Array.isArray(ccData.daily) || ccData.daily.length === 0) {
      return NextResponse.json(
        { error: "Invalid cc.json format. 'daily' must be a non-empty array." },
        { status: 400 }
      );
    }

    // Extract date range from daily data
    const dates = ccData.daily
      .map((day: any) => day.date)
      .sort();
    const dateRange = {
      start: dates[0],
      end: dates[dates.length - 1],
    };

    // Extract models used
    const modelsSet = new Set<string>();
    ccData.daily.forEach((day: any) => {
      if (day.models) {
        Object.keys(day.models).forEach((model) => modelsSet.add(model));
      }
    });
    const modelsUsed = Array.from(modelsSet);

    // Transform daily data to match schema
    const dailyBreakdown = ccData.daily.map((day: any) => ({
      date: day.date,
      inputTokens: day.inputTokens || 0,
      outputTokens: day.outputTokens || 0,
      cacheCreationTokens: day.cacheCreationTokens || 0,
      cacheReadTokens: day.cacheReadTokens || 0,
      totalTokens: day.totalTokens || 0,
      totalCost: day.totalCost || 0,
      modelsUsed: day.models ? Object.keys(day.models) : [],
    }));

    // Log submission details before sending to Convex
    console.log("Submitting to Convex:", {
      researcherUsername,
      department,
      dataSize: JSON.stringify(ccData).length,
      dailyCount: dailyBreakdown.length,
      totals: ccData.totals,
      dateRange,
      modelsUsed,
    });

    // Submit to Convex with timeout handling
    let result;
    try {
      const submissionPromise = convex.mutation(api.labSubmissions.submit, {
        researcherUsername,
        department,
        totalTokens: ccData.totals.totalTokens,
        totalCost: ccData.totals.totalCost,
        inputTokens: ccData.totals.inputTokens,
        outputTokens: ccData.totals.outputTokens,
        cacheCreationTokens: ccData.totals.cacheCreationTokens,
        cacheReadTokens: ccData.totals.cacheReadTokens,
        dateRange,
        modelsUsed,
        dailyBreakdown,
      });

      // Add a timeout of 25 seconds
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database operation timed out")), 25000)
      );

      result = await Promise.race([submissionPromise, timeoutPromise]);
    } catch (convexError: any) {
      console.error("Convex mutation error:", {
        message: convexError?.message,
        data: convexError?.data,
        code: convexError?.code,
      });

      // Extract meaningful error message
      let errorMessage = "Database operation failed";

      if (convexError?.message) {
        errorMessage = convexError.message;
      } else if (typeof convexError === "string") {
        errorMessage = convexError;
      } else if (convexError?.data?.message) {
        errorMessage = convexError.data.message;
      }

      throw new Error(errorMessage);
    }

    return NextResponse.json({
      success: true,
      ...result,
      message: result.message || `Successfully submitted data for ${researcherUsername}`,
      profileUrl: `${request.nextUrl.origin}/lab/profile/${researcherUsername}`,
    });
  } catch (error) {
    console.error("Lab submission error:", error);

    if (error instanceof Error) {
      console.error("Detailed error:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });

      // Handle specific validation errors
      const validationErrors = [
        "Token calculation invalid",
        "Negative values detected",
        "Future date",
        "Invalid date format",
      ];

      if (validationErrors.some((msg) => error.message.includes(msg))) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      // Handle timeout errors
      if (
        error.message.includes("timeout") ||
        error.message.includes("deadline")
      ) {
        return NextResponse.json(
          {
            error:
              "Request timed out. Please try again or submit smaller batches of data.",
          },
          { status: 504 }
        );
      }

      // Handle server errors
      if (error.message.includes("Server Error")) {
        return NextResponse.json(
          {
            error:
              "The database service is temporarily unavailable. Please try again in a few moments.",
          },
          { status: 503 }
        );
      }
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error occurred";

    return NextResponse.json(
      {
        error: `Submission failed: ${errorMessage}. Please try again or contact support if the issue persists.`,
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-Researcher-Username, X-Researcher-Department",
    },
  });
}
