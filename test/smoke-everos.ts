import { createMemoryProvider } from "../src/index.js";

async function main() {
  const memory = await createMemoryProvider({
    provider: "everos",
    apiKey: process.env.EVEROS_API_KEY,
    userId: process.env.EVEROS_USER_ID ?? "smoke-test-user",
  });

  console.log(`Provider: ${memory.name}`);

  // 1. remember
  console.log("\n--- remember ---");
  await memory.remember([
    { role: "user", content: "I prefer dark mode and use Neovim." },
    { role: "assistant", content: "Noted! Dark mode + Neovim." },
  ]);
  console.log("Remembered 2 messages.");

  // 2. flush
  console.log("\n--- flush ---");
  await memory.flush!();
  console.log("Flushed. Waiting 3s for async processing...");
  await new Promise((r) => setTimeout(r, 3000));

  // 3. recall
  console.log("\n--- recall ---");
  const results = await memory.recall("editor preferences", { topK: 3 });
  console.log(`Recalled ${results.length} memories:`);
  for (const r of results) {
    console.log(`  [${r.type}] ${r.content.slice(0, 100)}`);
  }

  // 4. list
  console.log("\n--- list (episodes) ---");
  const episodes = await memory.list!({ type: "episodic_memory", pageSize: 3 });
  console.log(`Listed ${episodes.length} episodes:`);
  for (const e of episodes) {
    console.log(`  [${e.id}] ${e.content.slice(0, 100)}`);
  }

  // 5. facts
  console.log("\n--- facts ---");
  const userFacts = await memory.facts!();
  console.log(`Got ${userFacts.length} facts:`);
  for (const f of userFacts.slice(0, 5)) {
    console.log(`  ${f.subject} --[${f.predicate}]--> ${f.object.slice(0, 80)}`);
  }

  // 6. entities
  console.log("\n--- entities ---");
  const ents = await memory.entities!();
  console.log(`Got ${ents.length} entities:`);
  for (const e of ents.slice(0, 5)) {
    console.log(`  [${e.type}] ${e.name}: ${e.description?.slice(0, 80)}`);
  }

  console.log("\nSmoke test passed.");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
