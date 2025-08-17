import { ReleaseRSSFetcher } from "./services/release-rss-fetcher";

async function inspectOCDSData() {
  console.log('🔍 Inspecting OCDS data structure...');
  
  const fetcher = new ReleaseRSSFetcher('GastosGubUy-Inspector/1.0');
  
  try {
    // Get one release with full data
    const releasesWithData = await fetcher.fetchReleasesWithData(2025, 1, 1);
    
    if (releasesWithData.length > 0 && releasesWithData[0].ocdsData) {
      const sampleData = releasesWithData[0];
      console.log(`📋 Inspecting release: ${sampleData.id}`);
      console.log(`🔗 URL: ${sampleData.link}`);
      console.log('');
      
      // Show the full structure
      console.log('📄 Full OCDS Data Structure:');
      console.log(JSON.stringify(sampleData.ocdsData, null, 2));
      
    } else {
      console.log('❌ No OCDS data available to inspect');
    }
    
  } catch (error) {
    console.error('❌ Error inspecting OCDS data:', error);
  }
}

inspectOCDSData().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
