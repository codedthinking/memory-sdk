import { createMemoryProvider } from "../src/index.js";

async function main() {
  // EverOS reflect
  console.log("=== EverOS reflect ===");
  const everos = await createMemoryProvider({
    provider: "everos",
    apiKey: process.env.EVEROS_API_KEY,
    userId: process.env.EVEROS_USER_ID ?? "koren",
  });
  const er = await everos.reflect!("coffee");
  console.log(`  content: ${er.content.slice(0, 200)}`);
  console.log(`  sources: ${er.sources?.length ?? 0}`);
  console.log(`  meta: ${JSON.stringify(er.metadata)}`);

  // Hindsight reflect
  console.log("\n=== Hindsight reflect ===");
  const hs = await createMemoryProvider({
    provider: "hindsight",
    apiKey: process.env.HINDSIGHT_API_KEY,
    bankId: "hermes",
  });
  const hr = await hs.reflect!("What does the user work on?");
  console.log(`  content: ${hr.content.slice(0, 300)}`);
  console.log(`  sources: ${hr.sources?.length ?? 0}`);

  console.log("\nReflect smoke test passed.");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
