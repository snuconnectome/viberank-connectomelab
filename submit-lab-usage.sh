#!/bin/bash

# Submit lab usage data to Viberank Lab Mode
# Usage: ./submit-lab-usage.sh [username] [department]
#
# Example: ./submit-lab-usage.sh jiookcha "Psychology"
#
# If username/department are not provided, will prompt interactively

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔬 Viberank Lab Mode Submission Tool${NC}"
echo ""

# Generate machine ID from hostname or environment variable
generate_machine_id() {
    # Use environment variable if set
    if [ -n "$VIBERANK_MACHINE_ID" ]; then
        echo "$VIBERANK_MACHINE_ID"
        return
    fi

    # Get hostname
    local hostname=$(hostname)

    # If hostname is too short or generic, add unique suffix
    if [ ${#hostname} -lt 5 ] || [[ "$hostname" =~ ^localhost|^ubuntu|^debian ]]; then
        local suffix=$(date +%s | md5sum 2>/dev/null | head -c 6 || date +%s | shasum | head -c 6)
        echo "${hostname}-${suffix}"
    else
        echo "$hostname"
    fi
}

# Generate machine ID
MACHINE_ID=$(generate_machine_id)
MACHINE_NAME="${VIBERANK_MACHINE_NAME:-$MACHINE_ID}"

# Check if ccusage is available
if ! command -v npx &> /dev/null; then
    echo -e "${RED}Error: npx is not installed. Please install Node.js first.${NC}"
    exit 1
fi

# Get researcher username (from argument or prompt)
if [ -n "$1" ]; then
    RESEARCHER_USERNAME="$1"
else
    DEFAULT_USERNAME=$(whoami)
    echo -n "Researcher username [$DEFAULT_USERNAME]: "
    read RESEARCHER_USERNAME
    RESEARCHER_USERNAME=${RESEARCHER_USERNAME:-$DEFAULT_USERNAME}
fi

# Get department (from argument or prompt)
if [ -n "$2" ]; then
    DEPARTMENT="$2"
else
    echo -n "Department: "
    read DEPARTMENT

    if [ -z "$DEPARTMENT" ]; then
        echo -e "${RED}Error: Department is required${NC}"
        exit 1
    fi
fi

echo ""
echo -e "Researcher: ${GREEN}$RESEARCHER_USERNAME${NC}"
echo -e "Department: ${GREEN}$DEPARTMENT${NC}"
echo -e "Machine ID: ${GREEN}$MACHINE_ID${NC}"
echo -e "Machine Name: ${GREEN}$MACHINE_NAME${NC}"
echo ""

# Generate ccusage data
echo -e "${YELLOW}Generating usage data...${NC}"
npx ccusage@latest --json > cc.json

if [ ! -f "cc.json" ]; then
    echo -e "${RED}Error: Failed to generate cc.json${NC}"
    exit 1
fi

# Display summary
echo -e "${GREEN}✓ Generated cc.json successfully${NC}"
echo ""
echo "Summary:"
jq -r '.totals | "  Total Cost: $\(.totalCost | tonumber | round)\n  Total Tokens: \(.totalTokens | tonumber | .*0.000001 | round) million\n  Days Tracked: \(.daily | length)"' cc.json 2>/dev/null || echo "  (install jq for summary)"
echo ""

# Prepare submission data (ccusage format to lab mode format)
echo -e "${YELLOW}Preparing lab submission data...${NC}"

# Extract data from ccusage format
LAB_DATA=$(jq --arg username "$RESEARCHER_USERNAME" --arg dept "$DEPARTMENT" '{
  researcherUsername: $username,
  department: $dept,
  totalTokens: .totals.totalTokens,
  totalCost: .totals.totalCost,
  inputTokens: .totals.inputTokens,
  outputTokens: .totals.outputTokens,
  cacheCreationTokens: .totals.cacheCreationTokens,
  cacheReadTokens: .totals.cacheReadTokens,
  dateRange: {
    start: (.daily | map(.date) | min),
    end: (.daily | map(.date) | max)
  },
  modelsUsed: (.daily | map(.modelsUsed // []) | add | unique),
  dailyBreakdown: .daily
}' cc.json)

# Save processed data
echo "$LAB_DATA" > lab-data.json
echo -e "${GREEN}✓ Prepared lab-data.json${NC}"
echo ""

# Submit to Viberank Lab Mode
echo -e "${YELLOW}Submitting to Viberank Lab Mode...${NC}"

# Determine API URL (use localhost for dev, production for prod)
API_URL="${VIBERANK_LAB_API_URL:-http://localhost:3000/api/lab/submit}"
echo "API URL: $API_URL"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Researcher-Username: $RESEARCHER_USERNAME" \
  -H "X-Researcher-Department: $DEPARTMENT" \
  -H "X-Machine-Id: $MACHINE_ID" \
  -H "X-Machine-Name: $MACHINE_NAME" \
  -d @lab-data.json)

# Extract HTTP status code and body
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Check HTTP status
if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "${GREEN}✓ Successfully submitted to Viberank Lab Mode!${NC}"
    echo ""

    # Parse response
    IS_NEW=$(echo "$BODY" | jq -r '.isNew // false')
    FLAGGED=$(echo "$BODY" | jq -r '.flagged // false')
    MESSAGE=$(echo "$BODY" | jq -r '.message // "Submission successful"')

    echo -e "${BLUE}$MESSAGE${NC}"

    if [ "$IS_NEW" = "true" ]; then
        echo "  • First submission for $RESEARCHER_USERNAME"
    else
        echo "  • Data merged with existing submission"
    fi

    if [ "$FLAGGED" = "true" ]; then
        echo -e "  ${YELLOW}⚠ Flagged for review:${NC}"
        echo "$BODY" | jq -r '.flagReasons[]' | sed 's/^/    - /'
    fi

    echo ""
    echo -e "View lab stats at: ${GREEN}${VIBERANK_LAB_WEB_URL:-http://localhost:3000}/lab${NC}"
else
    echo -e "${RED}Error: Failed to submit (HTTP $HTTP_STATUS)${NC}"
    echo "Response: $BODY"
    exit 1
fi

# Cleanup
echo ""
echo -n "Remove generated files (cc.json, lab-data.json)? (y/N): "
read -n 1 REMOVE
echo ""
if [[ $REMOVE =~ ^[Yy]$ ]]; then
    rm -f cc.json lab-data.json
    echo -e "${GREEN}✓ Cleaned up generated files${NC}"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
