import { ReleaseRSSFetcher } from "../../src/services/release-rss-fetcher";

async function testRSSFetcher() {
  console.log("🧪 Testing Release RSS Fetcher");
  console.log("==============================");

  const fetcher = new ReleaseRSSFetcher();

  try {
    // Test 1: Fetch releases for a specific month
    console.log("\n📅 Test 1: Fetching releases for January 2025...");
    const januaryReleases = await fetcher.fetchReleaseIds(2025, 1);
    console.log(`Found ${januaryReleases.length} releases in January 2025`);

    if (januaryReleases.length > 0) {
      console.log("📋 Sample releases:");
      januaryReleases.slice(0, 3).forEach((release, index) => {
        console.log(`   ${index + 1}. ID: ${release.id}`);
        console.log(`      Title: ${release.title.substring(0, 80)}${release.title.length > 80 ? "..." : ""}`);
        console.log(`      Published: ${release.publishDate.toLocaleDateString()}`);
      });
    }

    // Test 2: Get only release IDs (simpler format)
    console.log("\n📝 Test 2: Getting only release IDs...");
    const releaseIds = await fetcher.getReleaseIds(2025, 1);
    console.log(`Release IDs (first 5): ${releaseIds.slice(0, 5).join(", ")}`);

    // Test 3: Check available months for 2025
    console.log("\n📊 Test 3: Checking available months for 2025...");
    const availableMonths = await fetcher.getAvailableMonths(2025);
    console.log(`Available months in 2025: ${availableMonths.join(", ")}`);

    // Test 4: Fetch multiple months
    if (availableMonths.length > 1) {
      console.log("\n📅 Test 4: Fetching releases for multiple months...");
      const multiMonthReleases = await fetcher.fetchReleaseIdsForMultipleMonths(2025, availableMonths.slice(0, 2));
      console.log(`Found ${multiMonthReleases.length} releases across ${availableMonths.slice(0, 2).length} months`);
    }

    console.log("\n✅ All tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);

    // Try a fallback test with a different year/month
    console.log("\n🔄 Trying fallback test with December 2024...");
    try {
      const fallbackReleases = await fetcher.fetchReleaseIds(2024, 12);
      console.log(`✅ Fallback successful: Found ${fallbackReleases.length} releases in December 2024`);
    } catch (fallbackError) {
      console.error("❌ Fallback also failed:", fallbackError);
      console.log("\n💡 This could mean:");
      console.log("   - The RSS feed structure has changed");
      console.log("   - The server is temporarily unavailable");
      console.log("   - The specified time period has no data yet");
    }
  }
}

// Example usage patterns
async function demonstrateUsagePatterns() {
  console.log("\n\n📚 Usage Pattern Examples");
  console.log("=========================");

  // Example instantiation with custom user agent
  console.log("// Example instantiation:");
  console.log("const fetcher = new ReleaseRSSFetcher('MyApp/1.0 (contact@example.com)');\n");

  console.log("1️⃣ Basic usage - Get releases for specific month:");
  console.log("```typescript");
  console.log("const fetcher = new ReleaseRSSFetcher();");
  console.log("const releases = await fetcher.fetchReleaseIds(2025, 1);");
  console.log("console.log(`Found ${releases.length} releases`);");
  console.log("```");

  console.log("\n2️⃣ Get only IDs (no metadata):");
  console.log("```typescript");
  console.log("const releaseIds = await fetcher.getReleaseIds(2025, 1);");
  console.log("// Returns: ['id1', 'id2', 'id3', ...]");
  console.log("```");

  console.log("\n3️⃣ Get releases for entire year:");
  console.log("```typescript");
  console.log("const yearReleases = await fetcher.fetchReleaseIdsForYear(2024);");
  console.log("console.log(`Total releases in 2024: ${yearReleases.length}`);");
  console.log("```");

  console.log("\n4️⃣ Check what months are available:");
  console.log("```typescript");
  console.log("const months = await fetcher.getAvailableMonths(2025);");
  console.log("console.log(`Available: ${months.join(', ')}`);");
  console.log("```");

  console.log("\n5️⃣ Process releases with full metadata:");
  console.log("```typescript");
  console.log("const releases = await fetcher.fetchReleaseIds(2025, 1);");
  console.log("for (const release of releases) {");
  console.log("  console.log(`Processing ${release.id}:`);");
  console.log("  console.log(`  Title: ${release.title}`);");
  console.log("  console.log(`  Date: ${release.publishDate}`);");
  console.log("  console.log(`  Link: ${release.link}`);");
  console.log("}");
  console.log("```");
}

// Run the tests
testRSSFetcher()
  .then(() => demonstrateUsagePatterns())
  .then(() => {
    console.log("\n🎉 RSS Fetcher demonstration completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Demonstration failed:", error);
    process.exit(1);
  });
