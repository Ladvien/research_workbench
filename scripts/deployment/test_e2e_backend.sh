#!/bin/bash

# E2E Backend Testing Script
# Tests all major authentication and chat functionality

set -e

API_BASE="http://localhost:4512"
COOKIE_FILE="test_cookies.txt"
TEST_EMAIL="e2etest$(date +%s)@example.com"
TEST_USERNAME="e2etest$(date +%s)"
TEST_PASSWORD="testpassword123"

echo "============================================"
echo "E2E Backend Testing Script"
echo "============================================"

# Function to check HTTP status
check_status() {
    local expected=$1
    local actual=$2
    local test_name=$3

    if [ "$actual" -eq "$expected" ]; then
        echo "✅ $test_name - Status: $actual"
        return 0
    else
        echo "❌ $test_name - Expected: $expected, Got: $actual"
        return 1
    fi
}

# Clean up function
cleanup() {
    rm -f "$COOKIE_FILE" 2>/dev/null
    echo "Cleaned up test files"
}

trap cleanup EXIT

echo ""
echo "TEST 1: Backend Health Check"
echo "--------------------------------------------"
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/health_response.json "$API_BASE/api/health")
HTTP_STATUS="${RESPONSE: -3}"
check_status 200 "$HTTP_STATUS" "Health Check"
echo "Response: $(cat /tmp/health_response.json)"

echo ""
echo "TEST 2: User Registration"
echo "--------------------------------------------"
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/register_response.json \
  -X POST "$API_BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"username\":\"$TEST_USERNAME\",\"password\":\"$TEST_PASSWORD\"}")
HTTP_STATUS="${RESPONSE: -3}"
check_status 201 "$HTTP_STATUS" "User Registration"
echo "Response: $(cat /tmp/register_response.json)"

echo ""
echo "TEST 3: User Login"
echo "--------------------------------------------"
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/login_response.json \
  -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" \
  -c "$COOKIE_FILE")
HTTP_STATUS="${RESPONSE: -3}"
check_status 200 "$HTTP_STATUS" "User Login"
echo "Response: $(cat /tmp/login_response.json)"

echo ""
echo "TEST 4: Get Current User (Protected Endpoint)"
echo "--------------------------------------------"
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/me_response.json \
  -X GET "$API_BASE/api/auth/me" \
  -b "$COOKIE_FILE")
HTTP_STATUS="${RESPONSE: -3}"
check_status 200 "$HTTP_STATUS" "Get Current User"
echo "Response: $(cat /tmp/me_response.json)"

echo ""
echo "TEST 5: Get User Conversations (Empty Initially)"
echo "--------------------------------------------"
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/conversations_response.json \
  -X GET "$API_BASE/api/conversations" \
  -b "$COOKIE_FILE")
HTTP_STATUS="${RESPONSE: -3}"
check_status 200 "$HTTP_STATUS" "Get Conversations"
echo "Response: $(cat /tmp/conversations_response.json)"

echo ""
echo "TEST 6: Create New Conversation"
echo "--------------------------------------------"
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/create_conv_response.json \
  -X POST "$API_BASE/api/conversations" \
  -H "Content-Type: application/json" \
  -d '{"title":"E2E Test Conversation","model":"gpt-4"}' \
  -b "$COOKIE_FILE")
HTTP_STATUS="${RESPONSE: -3}"
check_status 201 "$HTTP_STATUS" "Create Conversation"
echo "Response: $(cat /tmp/create_conv_response.json)"

# Extract conversation ID if creation was successful
if [ "$HTTP_STATUS" -eq 201 ]; then
    CONVERSATION_ID=$(cat /tmp/create_conv_response.json | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "Extracted Conversation ID: $CONVERSATION_ID"

    echo ""
    echo "TEST 7: Get Specific Conversation"
    echo "--------------------------------------------"
    RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/get_conv_response.json \
      -X GET "$API_BASE/api/conversations/$CONVERSATION_ID" \
      -b "$COOKIE_FILE")
    HTTP_STATUS="${RESPONSE: -3}"
    check_status 200 "$HTTP_STATUS" "Get Specific Conversation"
    echo "Response: $(cat /tmp/get_conv_response.json)"
fi

echo ""
echo "TEST 8: Test Search Endpoints"
echo "--------------------------------------------"
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/search_response.json \
  -X GET "$API_BASE/api/search?q=test&limit=5" \
  -b "$COOKIE_FILE")
HTTP_STATUS="${RESPONSE: -3}"
check_status 200 "$HTTP_STATUS" "Search Messages"
echo "Response: $(cat /tmp/search_response.json)"

echo ""
echo "TEST 9: Test Search Health"
echo "--------------------------------------------"
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/search_health_response.json \
  -X GET "$API_BASE/api/search/health" \
  -b "$COOKIE_FILE")
HTTP_STATUS="${RESPONSE: -3}"
check_status 200 "$HTTP_STATUS" "Search Health"
echo "Response: $(cat /tmp/search_health_response.json)"

echo ""
echo "TEST 10: Test Authentication Error Handling (No Cookie)"
echo "--------------------------------------------"
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/no_auth_response.json \
  -X GET "$API_BASE/api/conversations")
HTTP_STATUS="${RESPONSE: -3}"
check_status 401 "$HTTP_STATUS" "Unauthenticated Request"
echo "Response: $(cat /tmp/no_auth_response.json)"

echo ""
echo "TEST 11: User Logout"
echo "--------------------------------------------"
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/logout_response.json \
  -X POST "$API_BASE/api/auth/logout" \
  -b "$COOKIE_FILE")
HTTP_STATUS="${RESPONSE: -3}"
check_status 200 "$HTTP_STATUS" "User Logout"
echo "Response: $(cat /tmp/logout_response.json)"

echo ""
echo "TEST 12: Verify Logout (Should Fail)"
echo "--------------------------------------------"
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/after_logout_response.json \
  -X GET "$API_BASE/api/auth/me" \
  -b "$COOKIE_FILE")
HTTP_STATUS="${RESPONSE: -3}"
check_status 401 "$HTTP_STATUS" "Access After Logout"
echo "Response: $(cat /tmp/after_logout_response.json)"

echo ""
echo "============================================"
echo "E2E Backend Testing Complete"
echo "============================================"

# Clean up temp files
rm -f /tmp/*_response.json 2>/dev/null

echo "All tests completed!"