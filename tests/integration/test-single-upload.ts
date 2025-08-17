import { ReleaseModel } from "../../shared/models";
import { IRelease } from "../../shared/types";
import { DatabaseService } from "../../src/services/database-service";
import { Logger } from "../../src/services/logger-service";
import { ReleaseRSSFetcher } from "../../src/services/release-rss-fetcher";
import {
    calculateTotalAmounts,
    fetchCurrencyRates,
    fetchUYIRate
} from "../../src/utils/amount-calculator";

async function testSingleUpload() {
    console.log('🧪 Testing single upload for adjudicacion-1217812...');
    
    const mongoUri = process.env.MONGODB_URI || "mongodb://admin:narrcetenak@69.166.230.55:27017/gastos_gub?authSource=admin";
    const databaseService = new DatabaseService();
    const logger = new Logger();
    
    try {
        await databaseService.connect(mongoUri);
        console.log("✅ Connected to MongoDB");

        // Check if the release already exists in database
        console.log("🔍 Checking if release already exists in database...");
        const existingRelease = await ReleaseModel.findOne({ id: "adjudicacion-1217812" });
        if (existingRelease) {
            console.log("📋 Release already exists in database:");
            console.log(`   - ID: ${existingRelease.id}`);
            console.log(`   - Date: ${existingRelease.date}`);
            console.log(`   - Amount: ${JSON.stringify(existingRelease.amount, null, 2)}`);
            console.log(`   - Source: ${existingRelease.sourceFileName || 'unknown'}`);
            console.log(`   - Source Year: ${existingRelease.sourceYear || 'unknown'}`);
        } else {
            console.log("❌ Release not found in database");
        }

        // Fetch currency rates
        console.log("💱 Fetching currency rates...");
        const currencyRates = await fetchCurrencyRates();
        const uyiRate = await fetchUYIRate();
        console.log("✅ Currency rates fetched");

        // Create RSS fetcher and try to fetch the specific release
        const rssFetcher = new ReleaseRSSFetcher('TestUploader/1.0');
        
        // First, let's check if we can find this release in January 2025 RSS
        console.log("📡 Fetching January 2025 release IDs...");
        const januaryReleases = await rssFetcher.fetchReleaseIds(2025, 1);
        const targetRelease = januaryReleases.find(r => r.id === "adjudicacion-1217812");
        
        if (!targetRelease) {
            console.log("❌ Release not found in January 2025 RSS feed");
            
            // Try other months
            console.log("🔄 Searching in other months...");
            for (let month = 2; month <= 8; month++) {
                console.log(`   Checking 2025-${month.toString().padStart(2, '0')}...`);
                const monthReleases = await rssFetcher.fetchReleaseIds(2025, month);
                const foundInMonth = monthReleases.find(r => r.id === "adjudicacion-1217812");
                if (foundInMonth) {
                    console.log(`✅ Found release in 2025-${month.toString().padStart(2, '0')}`);
                    await processRelease(foundInMonth, rssFetcher, currencyRates, uyiRate);
                    break;
                }
            }
        } else {
            console.log("✅ Found release in January 2025");
            await processRelease(targetRelease, rssFetcher, currencyRates, uyiRate);
        }

    } catch (error) {
        console.error("❌ Error during test:", error);
    } finally {
        if (databaseService.isConnected()) {
            await databaseService.disconnect();
            console.log("� Disconnected from MongoDB");
        }
    }
}

async function processRelease(foundRelease: any, rssFetcher: any, currencyRates: any, uyiRate: any) {
    console.log(`   - Title: ${foundRelease.title}`);
    console.log(`   - Link: ${foundRelease.link}`);
    
    // Try to fetch the OCDS data
    console.log("📥 Fetching OCDS data...");
    try {
        const ocdsData = await rssFetcher.fetchReleaseData(foundRelease.link);
        console.log("✅ OCDS data fetched successfully");
        
        // Extract release data
        const ocdsRelease = ocdsData.releases?.[0];
        if (ocdsRelease) {
            console.log(`   - OCDS ID: ${ocdsRelease.id}`);
            console.log(`   - OCID: ${ocdsRelease.ocid}`);
            console.log(`   - Date: ${ocdsRelease.date}`);
            console.log(`   - Awards count: ${ocdsRelease.awards?.length || 0}`);
            
            // Create release object
            const release: IRelease = {
                id: ocdsRelease.id,
                ocid: ocdsRelease.ocid,
                date: ocdsRelease.date ? new Date(ocdsRelease.date) : new Date(),
                tag: ocdsRelease.tag || [],
                initiationType: ocdsRelease.initiationType,
                parties: ocdsRelease.parties || [],
                buyer: ocdsRelease.buyer || null,
                tender: ocdsRelease.tender || null,
                awards: ocdsRelease.awards || [],
            } as IRelease;

            // Process parties
            if (release.parties?.length) {
                const buyer = release.parties.find((p: any) => p.roles && p.roles.includes('buyer'));
                if (buyer) release.buyer = buyer;
                const supplier = release.parties.find((p: any) => p.roles && p.roles.includes('supplier'));
                if (supplier) release.supplier = supplier;
            }

            // Calculate amounts
            console.log("💰 Calculating amounts...");
            const amountData = calculateTotalAmounts(
                release.awards || [], 
                currencyRates, 
                uyiRate,
                {
                    includeVersionInfo: true,
                    wasVersionUpdate: false,
                    previousAmount: null,
                }
            );
            console.log(`   - Amount data: ${JSON.stringify(amountData, null, 2)}`);

            // Create release with metadata
            const releaseWithMetadata = {
                ...release,
                sourceFileName: "web-test",
                sourceYear: 2025,
                amount: amountData,
                webFetchDate: new Date(),
                rssTitle: foundRelease.title,
                rssDescription: foundRelease.description,
                rssPublishDate: foundRelease.publishDate,
                rssLink: foundRelease.link
            };

            // Upload to database
            console.log("📤 Uploading to database...");
            const result = await ReleaseModel.updateOne(
                { id: release.id },
                { $set: releaseWithMetadata },
                { upsert: true }
            );

            console.log("✅ Upload result:");
            console.log(`   - Matched: ${result.matchedCount}`);
            console.log(`   - Modified: ${result.modifiedCount}`);
            console.log(`   - Upserted: ${result.upsertedCount}`);

            if (result.upsertedCount > 0) {
                console.log("🎉 New release inserted!");
            } else if (result.modifiedCount > 0) {
                console.log("🔄 Existing release updated!");
            } else {
                console.log("ℹ️  No changes made (data unchanged)");
            }

        } else {
            console.log("❌ No OCDS release data in response");
        }
        
    } catch (fetchError) {
        console.error("❌ Error fetching OCDS data:", fetchError);
    }
}

// Run the test
testSingleUpload().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
});
