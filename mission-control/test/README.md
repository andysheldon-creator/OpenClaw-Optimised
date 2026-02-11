# Mission Control Testing

## Integration Test

The integration test (`test/mission-control.test.ts`) verifies the full Mission Control workflow:

1. **Task Creation** - Creates a test task via API
2. **Agent Assignment** - Spawns sub-agent via OpenClaw Gateway
3. **Model Verification** - Confirms agent uses Kimi 2.5
4. **Review Flow** - Polls until task reaches "review" status (or times out)
5. **Cleanup** - Deletes test task

### Prerequisites

```bash
# Ensure Mission Control is running
cd /Users/claw/.openclaw/workspace/rifthome/mission-control
./start.sh

# Ensure OpenClaw Gateway is running
openclaw --profile dev gateway
```

### Run the Test

```bash
cd /Users/claw/.openclaw/workspace/rifthome/mission-control

# With default URLs
npx tsx test/mission-control.test.ts

# With custom URLs
MISSION_CONTROL_URL=http://localhost:3000 \
OPENCLAW_GATEWAY_URL=http://127.0.0.1:8080 \
npx tsx test/mission-control.test.ts
```

### Expected Output

```
🚀 Mission Control Integration Test

MC URL: http://localhost:3000
Gateway: http://127.0.0.1:8080

📋 Test 1: Create Task
  ✅ PASSED: Create Task

🤖 Test 2: Assign Agent
  ✅ PASSED: Assign Agent

🧠 Test 3: Verify Agent Model (Kimi 2.5)
  ✅ PASSED: Agent Model

⏸️ Test 4: Verify Review Flow (Waits for User Approval)
  Polling job status (checking review flow)...
    Attempt 1: Status = running
    ✓ Agent is working...
    Attempt 2: Status = running
    ✓ Agent is working...
    Attempt 3: Status = review
    ✓ Agent created PR, now in REVIEW (waiting for user)
  ✅ PASSED: Review Flow

🧹 Test 5: Cleanup
  ✓ Deleted test job abc123
  Cleanup complete

==================================================
TEST SUMMARY
==================================================
Total: 5 tests
Passed: 5 ✅
Failed: 0 ❌
==================================================

🎉 All tests passed!
```

## What Each Test Verifies

### 1. Create Task

- POST /api/tasks succeeds
- Returns valid job object with ID
- Task starts in "pending" status

### 2. Assign Agent

- POST /api/tasks/[id]/assign succeeds
- Creates Git branch
- Spawns sub-agent via OpenClaw Gateway
- Returns session key and branch name

### 3. Agent Model (Kimi 2.5)

- Queries OpenClaw Gateway for session details
- Verifies `model` field contains "kimi" and "2.5"
- Fails if wrong model is used

### 4. Review Flow

- Polls /api/tasks every 10 seconds for up to 2 minutes
- Verifies task progresses: pending → running → review
- Confirms task STOPS at "review" (doesn't auto-complete)
- Checks PR number and URL are recorded
- **This verifies the agent waits for your approval**

### 5. Cleanup

- DELETE /api/tasks/[id] removes test task

## Manual Testing

### Quick Test via curl

```bash
# 1. Create task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Task","description":"Quick test"}'

# 2. Assign agent (replace JOB_ID)
curl -X POST http://localhost:3000/api/tasks/JOB_ID/assign

# 3. Check task status
curl http://localhost:3000/api/tasks

# 4. Delete task (when done)
curl -X DELETE http://localhost:3000/api/tasks/JOB_ID
```

### Verify Agent Model

```bash
# Get session details from OpenClaw Gateway
curl http://127.0.0.1:8080/api/sessions/SESSION_KEY \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Look for the `model` field in the response. Should be:

```json
{
  "model": "openrouter/moonshotai/kimi-k2.5",
  ...
}
```

## Troubleshooting

### "Failed to create Git branch"

- Check `GITHUB_TOKEN` and `GITHUB_REPO` env vars
- Ensure token has repo scope

### "OpenClaw spawn failed"

- Verify gateway is running: `openclaw --profile dev gateway`
- Check `OPENCLAW_GATEWAY_TOKEN` matches gateway config

### "Agent still working after 2 minutes"

- Normal for real tasks - increase timeout or check manually
- Look at the spawned agent session in OpenClaw UI/logs

### Wrong model detected

- Check OpenClaw config: `openclaw config.get`
- Default model should be `openrouter/moonshotai/kimi-k2.5`
- Update with: `openclaw config.patch '{"agents":{"defaults":{"model":"openrouter/moonshotai/kimi-k2.5"}}}'`
