import { createMemoryProvider } from "../src/index.js";

async function main() {
  const memory = await createMemoryProvider({
    provider: "hindsight",
    apiKey: process.env.HINDSIGHT_API_KEY,
    bankId: "hermes",
  });

  console.log(`Provider: ${memory.name}`);

  // 1. remember
  console.log("\n--- remember ---");
  await memory.remember([
    { role: "user", content: "I'm building a Memory SDK that wraps multiple memory backends." },
    { role: "assistant", content: "That sounds like a great project for comparing providers!" },
  ]);
  console.log("Remembered 2 messages (async).");

  // 2. recall
  console.log("\n--- recall ---");
  const results = await memory.recall("memory");
  console.log(`Recalled ${results.length} memories:`);
  for (const r of results) {
    console.log(`  [${r.type}] ${r.content.slice(0, 120)}`);
  }

  // 3. list
  console.log("\n--- list ---");
  const memories = await memory.list!({ pageSize: 5 });
  console.log(`Listed ${memories.length} memories:`);
  for (const m of memories) {
    console.log(`  [${m.id.slice(0, 8)}] ${m.content.slice(0, 100)}`);
  }

  // 4. entities
  console.log("\n--- entities ---");
  const ents = await memory.entities!();
  console.log(`Got ${ents.length} entities:`);
  for (const e of ents.slice(0, 10)) {
    console.log(`  [${e.type ?? "?"}] ${e.name}`);
  }

  // 5. facts (graph)
  console.log("\n--- facts ---");
  const f = await memory.facts!();
  console.log(`Got ${f.length} facts:`);
  for (const fact of f.slice(0, 10)) {
    console.log(`  ${fact.subject} --[${fact.predicate}]--> ${fact.object}`);
  }

  console.log("\nSmoke test passed.");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
