#!/usr/bin/env node
/**
 * Quick Manual Test for Mission Control
 *
 * Usage: node test/quick-test.ts
 */

const MC_URL = process.env.MISSION_CONTROL_URL || "http://localhost:3000";

async function quickTest() {
  console.log("🧪 Quick Mission Control Test\n");

  try {
    // 1. Create a test task
    console.log("1. Creating test task...");
    const createRes = await fetch(`${MC_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Quick Test ${Date.now()}`,
        description: "Testing Mission Control workflow",
        type: "test",
        priority: 1,
      }),
    });

    const createData = await createRes.json();
    if (!createData.ok) {
      console.error("❌ Failed to create task:", createData.error);
      process.exit(1);
    }

    const jobId = createData.job.id;
    console.log(`   ✅ Created: ${jobId.slice(0, 8)} - "${createData.job.title}"`);
    console.log(`   Status: ${createData.job.status}`);

    // 2. List tasks
    console.log("\n2. Listing all tasks...");
    const listRes = await fetch(`${MC_URL}/api/tasks`);
    const listData = await listRes.json();
    console.log(`   ✅ Found ${listData.jobs.length} tasks`);

    // 3. Show the task we created
    const ourTask = listData.jobs.find((j: any) => j.id === jobId);
    if (ourTask) {
      console.log(`   Our task is in column: ${ourTask.status}`);
    }

    // 4. Clean up
    console.log("\n3. Cleaning up...");
    const deleteRes = await fetch(`${MC_URL}/api/tasks/${jobId}`, {
      method: "DELETE",
    });

    if (deleteRes.ok) {
      console.log(`   ✅ Deleted test task`);
    } else {
      console.log(`   ⚠️ Failed to delete: ${deleteRes.statusText}`);
    }

    console.log("\n✨ Quick test complete!");
    console.log("\nTo test agent assignment:");
    console.log(`  curl -X POST ${MC_URL}/api/tasks/${jobId}/assign`);
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

quickTest();
