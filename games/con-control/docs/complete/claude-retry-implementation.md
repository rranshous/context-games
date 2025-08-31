# Claude API Retry Implementation

## Overview
Added retry logic to handle Claude API overload errors (status 529) with exponential backoff.

## Implementation
- Added `retryClaudeCall()` method to `ClaudeClient` class
- Wraps both `initialCall()` and `followUpCall()` methods with retry logic
- Uses exponential backoff: 1s, 2s, 4s delays
- Maximum 3 retry attempts before failing

## Error Handling
- Only retries on overloaded errors (status 529 or `overloaded_error` type)
- Other errors fail immediately
- Preserves original error if all retries exhausted

## Files Modified
- `backend/claude-client.js`: Added retry wrapper and updated API calls

## Usage
The retry logic is transparent - existing code continues to work without changes. Error handling for failed retries remains at the server level in `server.js`.
