import axios from "axios";

async function testURLStructure() {
  console.log("🔍 Testing URL Structure");
  console.log("========================");

  const baseUrl = "https://www.comprasestatales.gub.uy";
  
  try {
    // Test 1: Check if the main site is accessible
    console.log("\n1️⃣ Testing main site accessibility...");
    const mainResponse = await axios.get(baseUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    console.log(`✅ Main site accessible: ${mainResponse.status} ${mainResponse.statusText}`);

    // Test 2: Try different RSS URL patterns
    const testUrls = [
      'https://www.comprasestatales.gub.uy/ocds/rss/2025/01',
      'https://www.comprasestatales.gub.uy/ocds/rss/2024/12',
      'https://www.comprasestatales.gub.uy/rss/2025/01',
      'https://www.comprasestatales.gub.uy/rss/2024/12',
      'https://www.comprasestatales.gub.uy/ocds/releases/2025/01',
      'https://www.comprasestatales.gub.uy/releases/2025/01',
    ];

    console.log("\n2️⃣ Testing different RSS URL patterns...");
    for (const testUrl of testUrls) {
      try {
        const response = await axios.head(testUrl, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
          }
        });
        console.log(`✅ ${testUrl} - ${response.status} ${response.statusText}`);
      } catch (error: any) {
        console.log(`❌ ${testUrl} - ${error.response?.status || 'Network Error'} ${error.response?.statusText || error.message}`);
      }
    }

    // Test 3: Try to GET one of the URLs to see the actual content
    console.log("\n3️⃣ Testing actual content retrieval...");
    const testUrl = 'https://www.comprasestatales.gub.uy/ocds/rss/2024/12';
    try {
      const response = await axios.get(testUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
        },
        maxRedirects: 5,
      });
      
      console.log(`✅ Retrieved content from ${testUrl}`);
      console.log(`Content-Type: ${response.headers['content-type']}`);
      console.log(`Content-Length: ${response.headers['content-length']}`);
      
      // Show first 500 characters of content
      const content = response.data.toString();
      console.log(`Content preview (first 500 chars):`);
      console.log(content.substring(0, 500));
      
      if (content.includes('<rss') || content.includes('<?xml')) {
        console.log("✅ Content appears to be XML/RSS format");
      } else {
        console.log("❌ Content does not appear to be XML/RSS format");
      }
      
    } catch (error: any) {
      console.log(`❌ Failed to retrieve content: ${error.response?.status || 'Network Error'} - ${error.message}`);
    }

  } catch (error: any) {
    console.error("❌ Main site test failed:", error.message);
  }
}

// Run the test
testURLStructure()
  .then(() => {
    console.log("\n🎉 URL structure testing completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ URL testing failed:", error);
    process.exit(1);
  });
