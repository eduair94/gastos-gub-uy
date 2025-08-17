import axios from "axios";
import * as xml2js from "xml2js";

/**
 * Interface for RSS feed item
 */
interface RSSItem {
  title?: string[];
  link?: string[];
  description?: string[];
  pubDate?: string[];
  guid?: string[];
}

/**
 * Interface for RSS feed channel
 */
interface RSSChannel {
  title?: string[];
  link?: string[];
  description?: string[];
  item?: RSSItem[];
}

/**
 * Interface for RSS feed structure
 */
interface RSSFeed {
  rss: {
    channel: RSSChannel[];
  };
}

/**
 * Interface for release information extracted from RSS
 */
interface ReleaseInfo {
  id: string;
  title: string;
  link: string;
  description: string;
  publishDate: Date;
  guid?: string;
}

interface ReleaseData extends ReleaseInfo {
  ocdsData?: any; // The actual OCDS JSON data from the release URL
  fetchError?: string; // Error message if fetching the release data failed
}

/**
 * Service class for fetching release IDs from Uruguay government procurement RSS feed
 */
export class ReleaseRSSFetcher {
  private readonly baseUrl = "https://www.comprasestatales.gub.uy/ocds/rss";
  private readonly timeout = 30000; // 30 seconds timeout

  /**
   * Creates an instance of ReleaseRSSFetcher
   * @param userAgent Optional user agent string for HTTP requests
   */
  constructor(private userAgent: string = "Mozilla/5.0 (compatible; GastosGubBot/1.0)") {}

  /**
   * Fetches release IDs for a specific year and month
   * @param year The year (e.g., 2025)
   * @param month The month (1-12)
   * @returns Promise<ReleaseInfo[]> Array of release information
   */
  async fetchReleaseIds(year: number, month: number): Promise<ReleaseInfo[]> {
    try {
      console.log(`🔍 Fetching releases for ${year}/${month.toString().padStart(2, '0')}...`);
      
      // Validate input parameters
      this.validateInputs(year, month);

      // Build the RSS URL
      const rssUrl = this.buildRSSUrl(year, month);
      console.log(`📡 RSS URL: ${rssUrl}`);

      // Fetch the RSS feed
      const rssContent = await this.fetchRSSContent(rssUrl);

      // Parse the XML content
      const parsedFeed = await this.parseXMLContent(rssContent);

      // Extract release information
      const releases = this.extractReleaseInfo(parsedFeed);

      console.log(`✅ Found ${releases.length} releases for ${year}/${month.toString().padStart(2, '0')}`);
      return releases;

    } catch (error) {
      console.error(`❌ Error fetching releases for ${year}/${month}:`, error);
      throw new Error(`Failed to fetch releases for ${year}/${month}: ${error}`);
    }
  }

  /**
   * Fetches release IDs for multiple months
   * @param year The year
   * @param months Array of months (1-12)
   * @returns Promise<ReleaseInfo[]> Combined array of release information
   */
  async fetchReleaseIdsForMultipleMonths(year: number, months: number[]): Promise<ReleaseInfo[]> {
    console.log(`🔍 Fetching releases for ${year} - months: ${months.join(', ')}`);
    
    const allReleases: ReleaseInfo[] = [];
    
    for (const month of months) {
      try {
        const monthReleases = await this.fetchReleaseIds(year, month);
        allReleases.push(...monthReleases);
        
        // Add a small delay between requests to be respectful
        await this.delay(1000);
      } catch (error) {
        console.warn(`⚠️ Failed to fetch releases for ${year}/${month}:`, error);
        // Continue with other months even if one fails
      }
    }

    console.log(`✅ Total releases found: ${allReleases.length}`);
    return allReleases;
  }

  /**
   * Fetches release IDs for an entire year (all 12 months)
   * @param year The year
   * @returns Promise<ReleaseInfo[]> Combined array of release information for the entire year
   */
  async fetchReleaseIdsForYear(year: number): Promise<ReleaseInfo[]> {
    const months = Array.from({ length: 12 }, (_, i) => i + 1); // [1, 2, 3, ..., 12]
    return this.fetchReleaseIdsForMultipleMonths(year, months);
  }

  /**
   * Gets only the release IDs (without additional metadata)
   * @param year The year
   * @param month The month
   * @returns Promise<string[]> Array of release IDs
   */
  async getReleaseIds(year: number, month: number): Promise<string[]> {
    const releases = await this.fetchReleaseIds(year, month);
    return releases.map(release => release.id);
  }

  /**
   * Fetches the actual OCDS release data from a release URL
   * @param releaseUrl The release URL (e.g., "http://www.comprasestatales.gub.uy/ocds/release/adjudicacion-1219109")
   * @returns Promise<any> The OCDS JSON data
   */
  async fetchReleaseData(releaseUrl: string): Promise<any> {
    console.log(`🔗 Fetching release data from: ${releaseUrl}`);
    
    try {
      const response = await axios.get(releaseUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        },
        timeout: 30000, // 30 second timeout
      });

      return response.data;
    } catch (error) {
      console.error(`❌ Error fetching release data from ${releaseUrl}:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Fetches releases with their complete OCDS data using parallel processing
   * @param year The year
   * @param month The month
   * @param maxReleases Optional limit on number of releases to fetch data for
   * @param concurrency Number of parallel requests (default: 10)
   * @returns Promise<ReleaseData[]> Array of releases with OCDS data
   */
  async fetchReleasesWithDataParallel(
    year: number, 
    month: number, 
    maxReleases?: number,
    concurrency: number = 10
  ): Promise<ReleaseData[]> {
    console.log(`🔍 Fetching releases with complete OCDS data for ${year}/${month.toString().padStart(2, '0')} (parallel mode)...`);
    
    // First get the basic release info
    const releases = await this.fetchReleaseIds(year, month);
    console.log(`📋 Found ${releases.length} releases to fetch data for`);
    
    // Limit releases if specified
    const releasesToProcess = maxReleases ? releases.slice(0, maxReleases) : releases;
    
    if (maxReleases && releases.length > maxReleases) {
      console.log(`⚠️  Limited to first ${maxReleases} releases for processing`);
    }

    const releasesWithData: ReleaseData[] = [];
    let successful = 0;
    let failed = 0;

    console.log(`🚀 Starting parallel fetch of OCDS data for ${releasesToProcess.length} releases (concurrency: ${concurrency})...`);

    // Process releases in parallel batches
    for (let i = 0; i < releasesToProcess.length; i += concurrency) {
      const batch = releasesToProcess.slice(i, i + concurrency);
      const batchNumber = Math.floor(i / concurrency) + 1;
      const totalBatches = Math.ceil(releasesToProcess.length / concurrency);
      
      console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} releases)...`);

      // Process all releases in this batch in parallel
      const batchPromises = batch.map(async (release, index) => {
        try {
          const globalIndex = i + index + 1;
          console.log(`📥 (${globalIndex}/${releasesToProcess.length}) Fetching: ${release.id}`);
          
          const ocdsData = await this.fetchReleaseData(release.link);
          
          console.log(`   ✅ Success - ${release.id}`);
          
          return {
            ...release,
            ocdsData: ocdsData
          };
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`   ❌ Failed - ${release.id}: ${errorMessage}`);
          
          return {
            ...release,
            fetchError: errorMessage
          };
        }
      });

      // Wait for all requests in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Count results and add to main array
      for (const result of batchResults) {
        releasesWithData.push(result as ReleaseData);
        if ('ocdsData' in result && result.ocdsData) {
          successful++;
        } else {
          failed++;
        }
      }

      console.log(`✅ Batch ${batchNumber} complete: ${batchResults.filter(r => 'ocdsData' in r && r.ocdsData).length} successful, ${batchResults.filter(r => 'fetchError' in r && r.fetchError).length} failed`);

      // Add delay between batches to be respectful to the server
      if (i + concurrency < releasesToProcess.length) {
        const delay = 2000; // 2 second delay between batches
        console.log(`⏱️  Waiting ${delay/1000}s before next batch...`);
        await this.delay(delay);
      }
    }

    console.log(`📊 Parallel fetch summary: ${successful} successful, ${failed} failed`);
    return releasesWithData;
  }

  /**
   * Fetches releases with their complete OCDS data
   * @param year The year
   * @param month The month
   * @param maxReleases Optional limit on number of releases to fetch data for (for testing)
   * @returns Promise<ReleaseData[]> Array of releases with OCDS data
   */
  async fetchReleasesWithData(year: number, month: number, maxReleases?: number): Promise<ReleaseData[]> {
    console.log(`🔍 Fetching releases with complete OCDS data for ${year}/${month.toString().padStart(2, '0')}...`);
    
    // First get the basic release info
    const releases = await this.fetchReleaseIds(year, month);
    console.log(`📋 Found ${releases.length} releases to fetch data for`);
    
    // Limit releases if specified (useful for testing)
    const releasesToProcess = maxReleases ? releases.slice(0, maxReleases) : releases;
    
    if (maxReleases && releases.length > maxReleases) {
      console.log(`⚠️  Limited to first ${maxReleases} releases for processing`);
    }

    const releasesWithData: ReleaseData[] = [];
    let successful = 0;
    let failed = 0;

    console.log(`🚀 Starting to fetch OCDS data for ${releasesToProcess.length} releases...`);

    for (let i = 0; i < releasesToProcess.length; i++) {
      const release = releasesToProcess[i];
      const progress = `(${i + 1}/${releasesToProcess.length})`;
      
      try {
        console.log(`📥 ${progress} Fetching data for release: ${release.id}`);
        
        const ocdsData = await this.fetchReleaseData(release.link);
        
        releasesWithData.push({
          ...release,
          ocdsData: ocdsData
        });
        
        successful++;
        console.log(`   ✅ Success - ${release.id}`);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        releasesWithData.push({
          ...release,
          fetchError: errorMessage
        });
        
        failed++;
        console.log(`   ❌ Failed - ${release.id}: ${errorMessage}`);
      }

      // Add delay between requests to be respectful
      if (i < releasesToProcess.length - 1) {
        await this.delay(1000); // 1 second delay
      }
    }

    console.log(`📊 Fetch summary: ${successful} successful, ${failed} failed`);
    return releasesWithData;
  }

  /**
   * Validates input parameters
   */
  private validateInputs(year: number, month: number): void {
    if (!Number.isInteger(year) || year < 2000 || year > new Date().getFullYear() + 1) {
      throw new Error(`Invalid year: ${year}. Year must be between 2000 and ${new Date().getFullYear() + 1}`);
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error(`Invalid month: ${month}. Month must be between 1 and 12`);
    }
  }

  /**
   * Builds the RSS URL for the given year and month
   */
  private buildRSSUrl(year: number, month: number): string {
    const paddedMonth = month.toString().padStart(2, '0');
    return `${this.baseUrl}/${year}/${paddedMonth}`;
  }

  /**
   * Fetches RSS content from the URL
   */
  private async fetchRSSContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'es-UY,es;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      if (!response.data) {
        throw new Error('Empty response received');
      }

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`RSS feed not found for the specified period. The feed may not exist yet.`);
      } else if (error.response?.status === 406) {
        throw new Error(`Server rejected the request (406 Not Acceptable). The RSS feed may have content negotiation requirements or may not be available for this period.`);
      } else if (error.response?.status) {
        throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout - the server took too long to respond');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('Network error - could not reach the server');
      } else {
        throw new Error(`Network error: ${error.message}`);
      }
    }
  }

  /**
   * Parses XML content into a JavaScript object
   */
  private async parseXMLContent(xmlContent: string): Promise<RSSFeed> {
    try {
      const parser = new xml2js.Parser({
        explicitArray: true,
        ignoreAttrs: false,
        trim: true,
      });

      const result = await parser.parseStringPromise(xmlContent);
      
      if (!result.rss || !result.rss.channel) {
        throw new Error('Invalid RSS feed structure - missing rss/channel elements');
      }

      return result as RSSFeed;
    } catch (error: any) {
      throw new Error(`XML parsing error: ${error.message}`);
    }
  }

  /**
   * Extracts release information from the parsed RSS feed
   */
  private extractReleaseInfo(feed: RSSFeed): ReleaseInfo[] {
    try {
      const channel = feed.rss.channel[0];
      
      if (!channel.item || !Array.isArray(channel.item)) {
        console.warn('⚠️ No items found in RSS feed');
        return [];
      }

      const releases: ReleaseInfo[] = [];

      for (const item of channel.item) {
        try {
          const releaseInfo = this.parseRSSItem(item);
          if (releaseInfo) {
            releases.push(releaseInfo);
          }
        } catch (error) {
          console.warn('⚠️ Failed to parse RSS item:', error);
          // Continue processing other items
        }
      }

      return releases;
    } catch (error: any) {
      throw new Error(`Failed to extract release information: ${error.message}`);
    }
  }

  /**
   * Parses a single RSS item into release information
   */
  private parseRSSItem(item: RSSItem): ReleaseInfo | null {
    try {
      // Extract basic fields
      const title = item.title?.[0] || '';
      const link = item.link?.[0] || '';
      const description = item.description?.[0] || '';
      const pubDateStr = item.pubDate?.[0] || '';
      const guid = item.guid?.[0];

      if (!title && !link) {
        console.warn('⚠️ RSS item missing both title and link, skipping');
        return null;
      }

      // Extract release ID from title or link
      const releaseId = this.extractReleaseId(title, link, guid);
      
      if (!releaseId) {
        console.warn(`⚠️ Could not extract release ID from item: ${title}`);
        return null;
      }

      // Parse publish date
      const publishDate = this.parseDate(pubDateStr);

      return {
        id: releaseId,
        title,
        link,
        description,
        publishDate,
        ...(guid && { guid })
      };
    } catch (error) {
      console.warn('⚠️ Error parsing RSS item:', error);
      return null;
    }
  }

  /**
   * Extracts release ID from title, link, or guid
   */
  private extractReleaseId(title: string, link: string, guid?: string): string | null {
    // Try different patterns to extract release ID
    const sources = [title, link, guid].filter(Boolean) as string[];
    
    for (const source of sources) {
      // Look for specific patterns in the Uruguay OCDS RSS feed
      
      // Pattern 1: "id_compra:XXX,release_id:YYY" - extract the YYY part
      const compraPattern = /release_id:([^,\s]+)/i;
      const compraMatch = source.match(compraPattern);
      if (compraMatch && compraMatch[1]) {
        return compraMatch[1];
      }
      
      // Pattern 2: Full OCDS ID like "ocds-70d2nz-XXXXX"
      const ocdsPattern = /ocds-70d2nz-([a-zA-Z0-9\-_]+)/i;
      const ocdsMatch = source.match(ocdsPattern);
      if (ocdsMatch && ocdsMatch[1]) {
        return `ocds-70d2nz-${ocdsMatch[1]}`;
      }
      
      // Pattern 3: "adjudicacion-XXXXX" or similar prefixed IDs
      const prefixedPattern = /(adjudicacion|contrato|compra|licitacion)-([a-zA-Z0-9\-_]+)/i;
      const prefixedMatch = source.match(prefixedPattern);
      if (prefixedMatch && prefixedMatch[0]) {
        return prefixedMatch[0];
      }
      
      // Pattern 4: "release/ID" or "release ID"
      const releasePattern = /release[\/\s]*([a-zA-Z0-9\-_]+)/i;
      const releaseMatch = source.match(releasePattern);
      if (releaseMatch && releaseMatch[1]) {
        return releaseMatch[1];
      }
      
      // Pattern 5: "id/ID" or "id ID"
      const idPattern = /\bid[\/\s]*([a-zA-Z0-9\-_]{3,})/i;
      const idMatch = source.match(idPattern);
      if (idMatch && idMatch[1]) {
        return idMatch[1];
      }
      
      // Pattern 6: Any numeric ID of reasonable length (6+ digits)
      const numericPattern = /\b(\d{6,})\b/;
      const numericMatch = source.match(numericPattern);
      if (numericMatch && numericMatch[1]) {
        return numericMatch[1];
      }
    }

    // If no pattern matches, try to use title or guid as-is if they look like IDs
    if (title && /^[a-zA-Z0-9\-_]+$/.test(title) && title.length >= 6) {
      return title;
    }

    if (guid && /^[a-zA-Z0-9\-_]+$/.test(guid) && guid.length >= 6) {
      return guid;
    }

    return null;
  }

  /**
   * Parses date string into Date object
   */
  private parseDate(dateStr: string): Date {
    if (!dateStr) {
      return new Date();
    }

    try {
      return new Date(dateStr);
    } catch {
      // If parsing fails, return current date
      return new Date();
    }
  }

  /**
   * Adds a delay for respectful API usage
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets available months for a given year (useful for checking what's available)
   * @param year The year to check
   * @returns Promise<number[]> Array of available months
   */
  async getAvailableMonths(year: number): Promise<number[]> {
    const availableMonths: number[] = [];
    
    for (let month = 1; month <= 12; month++) {
      try {
        const url = this.buildRSSUrl(year, month);
        await axios.head(url, { timeout: 10000 });
        availableMonths.push(month);
      } catch {
        // Month not available, continue checking others
      }
      
      // Small delay between checks
      await this.delay(500);
    }
    
    return availableMonths;
  }
}

// Execute if this module is run directly
if (require.main === module) {
  async function main() {
    console.log('🚀 Starting RSS scraping from 2025-01 until today...');
    
    const fetcher = new ReleaseRSSFetcher('GastosGubUy-Scraper/1.0');
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1; // getMonth() returns 0-11
    
    console.log(`📅 Current date: ${currentYear}-${currentMonth.toString().padStart(2, '0')}`);
    
    try {
      // Determine months to scrape
      const monthsToScrape: number[] = [];
      
      if (currentYear === 2025) {
        // Same year - scrape from January to current month
        for (let month = 1; month <= currentMonth; month++) {
          monthsToScrape.push(month);
        }
      } else if (currentYear > 2025) {
        // Future year - scrape all of 2025 and current year up to current month
        console.log('⚠️  Current year is beyond 2025, adjusting scraping range...');
        // First, scrape all of 2025
        for (let month = 1; month <= 12; month++) {
          monthsToScrape.push(month);
        }
        // Then scrape current year up to current month (if needed)
        // This would require extending the logic for multiple years
      }
      
      console.log(`📋 Will scrape ${monthsToScrape.length} months: ${monthsToScrape.join(', ')}`);
      console.log('');
      
      let totalReleases = 0;
      const results: { [month: number]: number } = {};
      const MAX_RELEASES_PER_MONTH_FOR_DATA = 5; // Limit for testing - fetch full OCDS data for only 5 releases per month
      
      // Scrape each month
      for (const month of monthsToScrape) {
        const monthStr = month.toString().padStart(2, '0');
        console.log(`📥 Fetching releases for 2025-${monthStr}...`);
        
        try {
          // First get basic release info
          const releases = await fetcher.fetchReleaseIds(2025, month);
          results[month] = releases.length;
          totalReleases += releases.length;
          
          console.log(`   ✅ Found ${releases.length} releases`);
          
          // Show sample of release IDs
          if (releases.length > 0) {
            const sampleSize = Math.min(3, releases.length);
            const sample = releases.slice(0, sampleSize).map(r => r.id).join(', ');
            console.log(`   📄 Sample IDs: ${sample}${releases.length > sampleSize ? '...' : ''}`);
          }

          // Fetch full OCDS data for a limited number of releases
          if (releases.length > 0) {
            console.log(`   🔗 Fetching OCDS data for first ${Math.min(MAX_RELEASES_PER_MONTH_FOR_DATA, releases.length)} releases...`);
            
            const releasesWithData = await fetcher.fetchReleasesWithData(2025, month, MAX_RELEASES_PER_MONTH_FOR_DATA);
            
            // Show summary of fetched data
            const successfulDataFetches = releasesWithData.filter(r => r.ocdsData).length;
            const failedDataFetches = releasesWithData.filter(r => r.fetchError).length;
            
            console.log(`   📊 OCDS Data: ${successfulDataFetches} successful, ${failedDataFetches} failed`);
            
            // Show sample of OCDS data
            const successfulReleases = releasesWithData.filter(r => r.ocdsData);
            if (successfulReleases.length > 0) {
              const sampleRelease = successfulReleases[0];
              console.log(`   📋 Sample OCDS data for ${sampleRelease.id}:`);
              if (sampleRelease.ocdsData && sampleRelease.ocdsData.releases && sampleRelease.ocdsData.releases[0]) {
                const release = sampleRelease.ocdsData.releases[0];
                console.log(`      - OCID: ${release.ocid || 'N/A'}`);
                console.log(`      - Release ID: ${release.id || 'N/A'}`);
                console.log(`      - Tender title: ${release.tender?.title || 'N/A'}`);
                console.log(`      - Buyer name: ${release.buyer?.name || 'N/A'}`);
                console.log(`      - Tags: ${release.tag ? release.tag.join(', ') : 'N/A'}`);
                console.log(`      - Date: ${release.date || 'N/A'}`);
                
                // Show parties info
                if (release.parties && release.parties.length > 0) {
                  const suppliers = release.parties.filter((p: any) => p.roles && p.roles.includes('supplier'));
                  const procuringEntities = release.parties.filter((p: any) => p.roles && p.roles.includes('procuringEntity'));
                  console.log(`      - Suppliers: ${suppliers.length}`);
                  console.log(`      - Procuring entities: ${procuringEntities.length}`);
                  if (suppliers.length > 0) {
                    console.log(`      - Sample supplier: ${suppliers[0].name}`);
                  }
                }
                
                // Show award info if available
                if (release.awards && release.awards.length > 0) {
                  const award = release.awards[0];
                  console.log(`      - Award status: ${award.status || 'N/A'}`);
                  console.log(`      - Award value: ${award.value?.amount || 'N/A'} ${award.value?.currency || ''}`);
                }
                
                // Show tender info if available
                if (release.tender) {
                  console.log(`      - Tender value: ${release.tender.value?.amount || 'N/A'} ${release.tender.value?.currency || ''}`);
                }
              }
            }
          }
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`   ❌ Error fetching 2025-${monthStr}:`, errorMessage);
          results[month] = 0;
        }
        
        console.log('');
        
        // Add delay between requests to be respectful
        if (month < monthsToScrape[monthsToScrape.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Summary
      console.log('📊 SCRAPING SUMMARY');
      console.log('='.repeat(50));
      console.log(`🗓️  Period: 2025-01 to 2025-${currentMonth.toString().padStart(2, '0')}`);
      console.log(`📈 Total releases found: ${totalReleases.toLocaleString()}`);
      console.log('');
      
      console.log('📅 Monthly breakdown:');
      for (const month of monthsToScrape) {
        const monthStr = month.toString().padStart(2, '0');
        const count = results[month] || 0;
        console.log(`   2025-${monthStr}: ${count.toLocaleString().padStart(8)} releases`);
      }
      
      console.log('');
      console.log('✅ Scraping completed successfully!');
      
    } catch (error) {
      console.error('❌ Fatal error during scraping:', error);
      process.exit(1);
    }
  }
  
  main().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}
