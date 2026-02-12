/**
 * Test script for embeddings functionality
 * Run with: npx tsx scripts/test-embeddings.ts
 */

import "dotenv/config";
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";

async function generateEmbedding(text: string): Promise<number[]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  const sorted = response.data.sort((a, b) => a.index - b.index);
  return sorted.map(item => item.embedding);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function testEmbeddings() {
  console.log("=== Testing OpenAI Embeddings ===\n");

  if (!process.env.OPENAI_API_KEY) {
    console.error("✗ OPENAI_API_KEY not found in environment");
    process.exit(1);
  }
  console.log("✓ OPENAI_API_KEY found\n");

  // Test 1: Single embedding
  console.log("Test 1: Generate single embedding...");
  const testText = "Detta är en testtext för att verifiera att embeddings fungerar korrekt.";

  try {
    const embedding = await generateEmbedding(testText);
    console.log(`✓ Single embedding generated successfully!`);
    console.log(`  - Vector dimensions: ${embedding.length}`);
    console.log(`  - First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(6)).join(", ")}...]`);
  } catch (error) {
    console.error(`✗ Single embedding failed:`, error);
    process.exit(1);
  }

  // Test 2: Batch embeddings
  console.log("\nTest 2: Generate batch embeddings...");
  const testTexts = [
    "Projekthantering för hantverkare",
    "Faktura och betalning för byggprojekt",
    "Tidrapportering och uppgiftshantering",
  ];

  try {
    const embeddings = await generateEmbeddings(testTexts);
    console.log(`✓ Batch embeddings generated successfully!`);
    console.log(`  - Number of embeddings: ${embeddings.length}`);
    console.log(`  - Each vector has ${embeddings[0].length} dimensions`);
  } catch (error) {
    console.error(`✗ Batch embeddings failed:`, error);
    process.exit(1);
  }

  // Test 3: Similarity check
  console.log("\nTest 3: Similarity check...");
  const query = "Hur hanterar jag fakturor?";
  const documents = [
    "Faktura och betalning för byggprojekt",
    "Projekthantering för hantverkare",
    "Väderprognos för Stockholm",
  ];

  try {
    const queryEmbedding = await generateEmbedding(query);
    const docEmbeddings = await generateEmbeddings(documents);

    const similarities = docEmbeddings.map((docEmb, idx) => ({
      text: documents[idx],
      similarity: cosineSimilarity(queryEmbedding, docEmb),
    }));

    similarities.sort((a, b) => b.similarity - a.similarity);

    console.log(`✓ Similarity calculation works!`);
    console.log(`  Query: "${query}"`);
    console.log(`  Results (sorted by relevance):`);
    similarities.forEach((s, idx) => {
      console.log(`    ${idx + 1}. "${s.text}" (${(s.similarity * 100).toFixed(1)}%)`);
    });
  } catch (error) {
    console.error(`✗ Similarity check failed:`, error);
    process.exit(1);
  }

  console.log("\n=== All embedding tests passed! ===");
}

testEmbeddings().catch(console.error);
