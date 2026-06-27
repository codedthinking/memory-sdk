import { createMemoryProvider } from "../src/index.js";

async function main() {
  const memory = await createMemoryProvider({
    provider: "nams",
    apiKey: process.env.NAMS_API_KEY!,
    workspaceId: process.env.NAMS_WORKSPACE_ID!,
  });

  console.log(`Provider: ${memory.name}`);

  // 1. remember
  console.log("\n--- remember ---");
  await memory.remember([
    { role: "user", content: "I built a Memory SDK that abstracts EverOS, Hindsight, NAMS, Zep, Mem0 and Supermemory." },
    { role: "assistant", content: "That's a solid set of providers to unify!" },
  ]);
  console.log("Remembered 2 messages.");

  // wait for extraction
  console.log("Waiting 8s for entity extraction...");
  await new Promise((r) => setTimeout(r, 8000));

  // 2. recall (search entities)
  console.log("\n--- recall ---");
  const results = await memory.recall("memory SDK");
  console.log(`Recalled ${results.length} results:`);
  for (const r of results) {
    console.log(`  [${r.type}] (${r.score?.toFixed(3)}) ${r.content.slice(0, 100)}`);
  }

  // 3. list (entities as memories)
  console.log("\n--- list ---");
  const memories = await memory.list!();
  console.log(`Listed ${memories.length} items:`);
  for (const m of memories) {
    console.log(`  [${m.type}] ${m.content.slice(0, 100)}`);
  }

  // 4. entities
  console.log("\n--- entities ---");
  const ents = await memory.entities!();
  console.log(`Got ${ents.length} entities:`);
  for (const e of ents) {
    console.log(`  [${e.type}] ${e.name}: ${e.description?.slice(0, 80)}`);
  }

  // 5. facts (graph)
  console.log("\n--- facts ---");
  const f = await memory.facts!();
  console.log(`Got ${f.length} facts:`);
  for (const fact of f.slice(0, 10)) {
    console.log(`  ${fact.subject} --[${fact.predicate}]--> ${fact.object} (${fact.confidence?.toFixed(3)})`);
  }

  console.log("\nSmoke test passed.");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
