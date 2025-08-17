import { ReleaseRSSFetcher } from "../../src/services/release-rss-fetcher";

async function testParallelFetcher() {
  console.log('🧪 Testing parallel OCDS fetcher...');
  
  const fetcher = new ReleaseRSSFetcher('GastosGubUy-ParallelTest/1.0');
  
  try {
    console.log('🔄 Testing with 10 releases in parallel mode (concurrency: 5)...');
    const startTime = Date.now();
    
    const releasesWithData = await fetcher.fetchReleasesWithDataParallel(2025, 1, 10, 5);
    
    const duration = (Date.now() - startTime) / 1000;
    const successful = releasesWithData.filter(r => 'ocdsData' in r && r.ocdsData).length;
    const failed = releasesWithData.filter(r => 'fetchError' in r && r.fetchError).length;
    
    console.log(`\n📊 Results:`);
    console.log(`⏱️  Duration: ${duration.toFixed(2)} seconds`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚡ Avg time per release: ${(duration / 10).toFixed(2)} seconds`);
    
    // Show some sample data
    const successfulReleases = releasesWithData.filter(r => 'ocdsData' in r && r.ocdsData);
    if (successfulReleases.length > 0) {
      console.log(`\n📄 Sample data:`);
      for (let i = 0; i < Math.min(3, successfulReleases.length); i++) {
        const release = successfulReleases[i];
        const ocdsRelease = release.ocdsData.releases?.[0];
        console.log(`  ${i + 1}. ${release.id} - ${ocdsRelease?.buyer?.name || 'No buyer'}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testParallelFetcher().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
