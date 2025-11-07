# Viberank Lab Mode

External submission and leaderboard system for research labs to track Claude API usage across team members.

## Overview

Lab Mode allows research labs to:
- Track token usage across multiple researchers and departments
- Maintain lab-wide and department-specific leaderboards
- Monitor daily usage patterns and model preferences
- Detect anomalous usage patterns for review
- View researcher profiles with detailed statistics

## Architecture

### Backend (Convex)

**Database Tables:**
- `labSubmissions` - Raw submission data from external sources
- `labResearchers` - Aggregated researcher profiles with statistics

**Functions:**
- `labSubmissions.submit` - Accept and validate external submissions
- `labSubmissions.get/getAll/getFlagged` - Query submission data
- `labResearchers.getProfile/getResearcherStats/updateResearcherStats` - Researcher profiles
- `labLeaderboard.*` - Leaderboard and statistics queries

**Validation:**
- Token math validation (input + output + cache = total)
- Negative value detection
- Future date rejection
- Anomaly detection (100M+ tokens, $1000+ costs)

### API Routes (Next.js)

All routes under `/api/lab/` with CORS support:

**POST /api/lab/submit**
- Headers: `X-Researcher-Username`, `X-Researcher-Department`
- Body: Complete ccusage JSON format
- Returns: `{ success, submissionId, isNew, flagged, flagReasons, message }`

**GET /api/lab/leaderboard**
- Query params: `?limit=N&days=N`
- Returns: Ranked list of researchers by total tokens
- Supports all-time and date-filtered rankings

**GET /api/lab/profile**
- Query params: `?username=<username>` (required)
- Returns: Researcher profile with enriched submission data and daily breakdown
- 404 if profile not found

**GET /api/lab/stats**
- Query params: `?department=<dept>&includeActivity=true&activityLimit=N`
- Returns: Lab-wide or department-specific statistics
- Optionally includes activity timeline

## Submission Workflow

### 1. Using the Script (Recommended)

```bash
# Interactive mode
./submit-lab-usage.sh

# Command-line mode
./submit-lab-usage.sh <username> <department>

# Example
./submit-lab-usage.sh jiookcha "Psychology"
```

The script will:
1. Generate usage data using `ccusage`
2. Transform to lab mode format
3. Submit to the lab API
4. Display submission results
5. Optionally clean up temporary files

### 2. Manual Submission

```bash
# Generate ccusage data
npx ccusage@latest --json > cc.json

# Transform to lab format (see Data Format below)
# ...

# Submit
curl -X POST http://localhost:3000/api/lab/submit \
  -H "Content-Type: application/json" \
  -H "X-Researcher-Username: jiookcha" \
  -H "X-Researcher-Department: Psychology" \
  -d @lab-data.json
```

### 3. Programmatic Submission

```javascript
const response = await fetch('http://localhost:3000/api/lab/submit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Researcher-Username': 'jiookcha',
    'X-Researcher-Department': 'Psychology'
  },
  body: JSON.stringify({
    researcherUsername: 'jiookcha',
    department: 'Psychology',
    totalTokens: 50000,
    totalCost: 2.5,
    inputTokens: 30000,
    outputTokens: 15000,
    cacheCreationTokens: 2500,
    cacheReadTokens: 2500,
    dateRange: {
      start: '2025-01-01',
      end: '2025-01-05'
    },
    modelsUsed: ['claude-3-5-sonnet-20241022'],
    dailyBreakdown: [ /* array of daily usage */ ]
  })
});
```

## Data Format

### Submission Request Body

```json
{
  "researcherUsername": "string (required)",
  "department": "string (required)",
  "totalTokens": "number (required, >= 0)",
  "totalCost": "number (required, >= 0)",
  "inputTokens": "number (required, >= 0)",
  "outputTokens": "number (required, >= 0)",
  "cacheCreationTokens": "number (required, >= 0)",
  "cacheReadTokens": "number (required, >= 0)",
  "dateRange": {
    "start": "YYYY-MM-DD (required, not future)",
    "end": "YYYY-MM-DD (required, not future)"
  },
  "modelsUsed": ["string array (required)"],
  "dailyBreakdown": [
    {
      "date": "YYYY-MM-DD (required, not future)",
      "inputTokens": "number (required)",
      "outputTokens": "number (required)",
      "cacheCreationTokens": "number (required)",
      "cacheReadTokens": "number (required)",
      "totalTokens": "number (required)",
      "totalCost": "number (required)",
      "modelsUsed": ["string array (required)"]
    }
  ]
}
```

### Submission Response

```json
{
  "success": true,
  "submissionId": "convex-id",
  "isNew": true,
  "flagged": false,
  "flagReasons": [],
  "message": "New submission created for jiookcha"
}
```

## Querying Data

### Get Leaderboard

```bash
# All-time top 10
curl http://localhost:3000/api/lab/leaderboard

# Top 20
curl "http://localhost:3000/api/lab/leaderboard?limit=20"

# Last 30 days, top 10
curl "http://localhost:3000/api/lab/leaderboard?days=30"

# Last 7 days, all researchers
curl "http://localhost:3000/api/lab/leaderboard?days=7&limit=100"
```

### Get Researcher Profile

```bash
# Get profile with stats
curl "http://localhost:3000/api/lab/profile?username=jiookcha"
```

Response includes:
- Basic info (username, department, join date)
- Total usage statistics
- Daily breakdown
- Models used
- Submissions list

### Get Lab Statistics

```bash
# Lab-wide stats
curl http://localhost:3000/api/lab/stats

# Lab-wide stats with activity timeline
curl "http://localhost:3000/api/lab/stats?includeActivity=true"

# Department-specific stats
curl "http://localhost:3000/api/lab/stats?department=Psychology"
```

## Data Merging

When a researcher submits multiple times:

1. **Daily data is merged**: Overlapping dates combine token counts
2. **Models are combined**: Unique models across all submissions
3. **Totals are recalculated**: Accurate sums from merged daily data
4. **Verification status preserved**: Maintains approval state

Example:
```
Submission 1: Jan 1-3 (10k tokens)
Submission 2: Jan 2-5 (15k tokens)

Merged Result:
- Jan 1: 10k tokens (from sub 1)
- Jan 2: Combined tokens (from both)
- Jan 3: Combined tokens (from both)
- Jan 4-5: 15k tokens (from sub 2)
```

## Validation Rules

1. **Token Math**: `input + output + cacheCreation + cacheRead = total` (1% tolerance)
2. **No Negatives**: All numeric values must be >= 0
3. **No Future Dates**: All dates must be <= today
4. **Anomaly Detection**:
   - > 100M tokens: Flagged for review
   - > $1000 cost: Flagged for review

## Testing

### Run Integration Tests

```bash
npm test
```

Tests cover:
- Full submission workflow
- Data merging from multiple machines
- Validation error handling
- Anomaly detection
- Query operations (leaderboard, stats, profiles)

### Manual Testing Checklist

- [ ] Submit new researcher data
- [ ] Submit update for existing researcher
- [ ] Test validation errors (invalid math, negatives, future dates)
- [ ] Test anomaly flagging (large token counts)
- [ ] Query leaderboard (all-time and date-filtered)
- [ ] Query researcher profile
- [ ] Query lab stats (lab-wide and department-specific)

## Environment Variables

```bash
# For submit-lab-usage.sh script
export VIBERANK_LAB_API_URL="http://localhost:3000/api/lab/submit"  # Default
export VIBERANK_LAB_WEB_URL="http://localhost:3000"  # Default

# For production
export VIBERANK_LAB_API_URL="https://viberank.app/api/lab/submit"
export VIBERANK_LAB_WEB_URL="https://viberank.app"
```

## Development Workflow

1. **Start dev server**: `npm run dev`
2. **Run Convex backend**: `npx convex dev`
3. **Submit test data**: `./submit-lab-usage.sh test-user "Test Dept"`
4. **Query results**: Use curl or browser to test API endpoints
5. **Run tests**: `npm test`

## Production Deployment

1. Deploy Convex backend: `npx convex deploy`
2. Deploy Next.js app: `npm run build && npm start`
3. Update environment variables for production URLs
4. Test submission workflow end-to-end
5. Monitor for flagged submissions requiring review

## Security Considerations

- **No authentication**: Lab mode trusts external clients
- **Rate limiting**: Not implemented - add if needed
- **Input validation**: Comprehensive validation in Convex functions
- **CORS**: Enabled for all lab endpoints
- **Anomaly detection**: Flags suspicious usage for manual review

## Support

For issues or questions:
1. Check test results: `npm test`
2. Review submission logs in console
3. Query flagged submissions: `curl http://localhost:3000/api/lab/flagged`
4. Verify data with Convex dashboard

## License

Same as Viberank project
