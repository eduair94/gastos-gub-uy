import * as dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import type { IRelease } from './shared/types/database';

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gastos_gub';
const dbName = process.env.MONGODB_DB || 'gastos_gub';

function toDate(val: any): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d;
}

function updateDatesInRelease(release: Partial<IRelease> & { _id?: any }): boolean {
  let changed = false;
  
  // Top-level date
  if (release.date && typeof release.date === 'string') {
    const d = toDate(release.date);
    if (d) {
      release.date = d;
      changed = true;
    }
  }
  
  // Awards
  if (Array.isArray(release.awards)) {
    for (const award of release.awards) {
      if (award.date && typeof award.date === 'string') {
        const d = toDate(award.date);
        if (d) {
          award.date = d;
          changed = true;
        }
      }
      // Award documents
      if (Array.isArray(award.documents)) {
        for (const doc of award.documents) {
          if (doc.datePublished && typeof doc.datePublished === 'string') {
            const d = toDate(doc.datePublished);
            if (d) {
              doc.datePublished = d;
              changed = true;
            }
          }
        }
      }
    }
  }
  
  // Tender documents
  if (release.tender && Array.isArray(release.tender.documents)) {
    for (const doc of release.tender.documents) {
      if (doc.datePublished && typeof doc.datePublished === 'string') {
        const d = toDate(doc.datePublished);
        if (d) {
          doc.datePublished = d;
          changed = true;
        }
      }
    }
  }
  
  // Tender tenderPeriod
  if (release.tender && release.tender.tenderPeriod) {
    const tp = release.tender.tenderPeriod;
    if (tp.startDate && typeof tp.startDate === 'string') {
      const d = toDate(tp.startDate);
      if (d) {
        tp.startDate = d;
        changed = true;
      }
    }
    if (tp.endDate && typeof tp.endDate === 'string') {
      const d = toDate(tp.endDate);
      if (d) {
        tp.endDate = d;
        changed = true;
      }
    }
  }
  
  // Tender enquiryPeriod
  if (release.tender && release.tender.enquiryPeriod) {
    const ep = release.tender.enquiryPeriod;
    if (ep.startDate && typeof ep.startDate === 'string') {
      const d = toDate(ep.startDate);
      if (d) {
        ep.startDate = d;
        changed = true;
      }
    }
    if (ep.endDate && typeof ep.endDate === 'string') {
      const d = toDate(ep.endDate);
      if (d) {
        ep.endDate = d;
        changed = true;
      }
    }
  }
  
  return changed;
}

async function migrateCollection(db: any, collectionName: string) {
  console.log(`\n=== Migrating ${collectionName} collection ===`);
  const col = db.collection(collectionName);
  
  // Check if collection exists
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    console.log(`Collection "${collectionName}" does not exist, skipping.`);
    return { updated: 0, total: 0 };
  }
  
  const cursor = col.find({});
  let updated = 0;
  let total = 0;
  
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) continue;
    total++;
    
    if (updateDatesInRelease(doc)) {
      await col.replaceOne({ _id: doc._id }, doc);
      updated++;
      if (updated % 100 === 0) {
        console.log(`  Progress: ${updated} updated, ${total} processed...`);
      }
    }
  }
  
  console.log(`  Completed: Updated ${updated} of ${total} documents in ${collectionName}.`);
  return { updated, total };
}

async function main() {
  console.log('🚀 Starting Date Migration Script');
  console.log(`📦 Database: ${dbName}`);
  console.log(`🔗 URI: ${uri.replace(/:\/\/[^@]*@/, '://***:***@')}`); // Hide credentials in log
  
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(dbName);
    
    // List all collections to show what we're working with
    const collections = await db.listCollections().toArray();
    console.log(`\n📊 Found ${collections.length} collections:`);
    collections.forEach(col => console.log(`  - ${col.name}`));
    
    // Collections that may contain date fields to migrate
    const collectionsToMigrate = ['releases'];
    
    let totalUpdated = 0;
    let totalProcessed = 0;
    
    for (const collectionName of collectionsToMigrate) {
      const result = await migrateCollection(db, collectionName);
      totalUpdated += result.updated;
      totalProcessed += result.total;
    }
    
    console.log(`\n🎉 Migration completed!`);
    console.log(`📈 Summary: Updated ${totalUpdated} documents out of ${totalProcessed} total.`);
    
    if (totalUpdated > 0) {
      console.log(`\n✨ Next steps:`);
      console.log(`  1. Test your application to ensure date sorting/filtering works correctly`);
      console.log(`  2. Check MongoDB indexes are still optimal for Date fields`);
      console.log(`  3. Consider running the migration script on any backup/staging environments`);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔐 MongoDB connection closed');
  }
}

main().catch(err => {
  console.error('💥 Unexpected error:', err);
  process.exit(1);
});

/*
📋 MIGRATION INSTRUCTIONS:

1. Environment Setup:
   - Create/update your .env file with MONGODB_URI and MONGODB_DB
   - Example: MONGODB_URI=mongodb://localhost:27017/gastos_gub

2. Run the migration:
   npx tsx migrate-dates.ts

3. The script will:
   - Connect to your MongoDB database
   - Find all documents in the 'releases' collection
   - Convert string date fields to Date objects for:
     • release.date
     • awards[].date  
     • awards[].documents[].datePublished
     • tender.documents[].datePublished
     • tender.tenderPeriod.startDate & endDate
     • tender.enquiryPeriod.startDate & endDate
   - Show progress and provide a summary

4. Verification:
   - The script only updates documents that actually need changes
   - All original data is preserved, only type conversion occurs
   - Check your application afterward to ensure proper date sorting/filtering

5. Backup recommendation:
   - Consider backing up your database before running: mongodump
*/
