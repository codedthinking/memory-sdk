import { createMemoryProvider } from "../src/index.js";

async function main() {
  const memory = await createMemoryProvider({
    provider: "everos",
    apiKey: process.env.EVEROS_API_KEY,
    userId: process.env.EVEROS_USER_ID ?? "smoke-test-user",
  });

  console.log(`Provider: ${memory.name}`);

  // 1. Store
  console.log("\n--- store ---");
  await memory.store([
    { role: "user", content: "I prefer dark mode and use Neovim." },
    { role: "assistant", content: "Noted! Dark mode + Neovim." },
  ]);
  console.log("Stored 2 messages.");

  // 2. Flush (force extraction)
  console.log("\n--- flush ---");
  await memory.flush!();
  console.log("Flushed. Waiting 3s for async processing...");
  await new Promise((r) => setTimeout(r, 3000));

  // 3. Search
  console.log("\n--- search ---");
  const results = await memory.search("editor preferences", { topK: 3 });
  console.log(`Found ${results.length} results:`);
  for (const r of results) {
    console.log(`  [${r.type}] ${r.text.slice(0, 100)}`);
  }

  // 4. Get (episodes)
  console.log("\n--- get (episodes) ---");
  const episodes = await memory.get({ type: "episodic_memory", pageSize: 3 });
  console.log(`Got ${episodes.length} episodes:`);
  for (const e of episodes) {
    console.log(`  [${e.id}] ${e.text.slice(0, 100)}`);
  }

  // 5. Analyze
  console.log("\n--- analyze ---");
  const analysis = await memory.analyze("user preferences");
  console.log(`Analysis (${analysis.sources?.length ?? 0} sources):`);
  console.log(`  ${analysis.text.slice(0, 200)}`);

  console.log("\nSmoke test passed.");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
