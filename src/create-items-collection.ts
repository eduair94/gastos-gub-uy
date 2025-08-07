#!/usr/bin/env node

import mongoose from 'mongoose';
import { MONGO_CONFIG } from './config/config';
import { ItemModel } from './database/item-model';
import { ReleaseModel } from './database/release-model';
import { Logger } from './services/logger-service';

class ItemsCollectionCreator {
  private logger: Logger;
  private readonly BATCH_SIZE = 10000;

  constructor() {
    this.logger = new Logger();
  }

  async connectToDatabase(): Promise<void> {
    try {
      const mongoUri = `${MONGO_CONFIG.uri}/${MONGO_CONFIG.database}`;
      await mongoose.connect(mongoUri, {
        maxPoolSize: 50,
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 300000,
      });
      this.logger.info('✓ Connected to MongoDB for awards collection creation');
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB', error as Error);
      throw error;
    }
  }

  async createItemsCollection(): Promise<void> {
    this.logger.info('🏗️ Creating items collection from releases...');

    // Ensure indexes are created
    await ItemModel.createIndexes();
    this.logger.info('✓ Created indexes for items collection');

    let totalProcessed = 0;
    let totalAwards = 0;
    let batchNumber = 0;

    // Process releases in batches using aggregation
    const cursor = ReleaseModel.aggregate([
      {
        $match: {
          'awards': { $exists: true, $ne: [] },
          'awards.items': { $exists: true, $ne: [] }
        }
      },
      { $unwind: '$awards' },
      { $unwind: '$awards.items' },
      {
        $lookup: {
          from: 'releases',
          localField: '_id',
          foreignField: '_id',
          as: 'releaseData'
        }
      },
      {
        $project: {
          // Remove the original _id to let MongoDB generate new unique IDs
          _id: 0,
          
          // Release metadata
          releaseId: { $toString: '$_id' },
          ocid: 1,
          releaseDate: '$date',
          sourceYear: 1,
          
          // Award information
          awardId: '$awards.id',
          uniqueItemId: '$awards.items._id',
          awardTitle: '$awards.title',
          awardDescription: '$awards.description',
          awardStatus: '$awards.status',
          awardDate: '$awards.date',
          awardValue: '$awards.value',
          
          // Item details
          itemId: '$awards.items.id',
          itemDescription: '$awards.items.description',
          itemQuantity: '$awards.items.quantity',
          itemUnit: '$awards.items.unit',
          itemClassification: '$awards.items.classification',
          
          // Parties
          buyer: 1,
          supplier: {
            $let: {
              vars: {
                supplierParty: { $arrayElemAt: [{ $filter: { input: '$parties', cond: { $in: ['supplier', '$$this.roles'] } } }, 0] }
              },
              in: {
                id: '$$supplierParty.id',
                name: '$$supplierParty.name',
                identifier: '$$supplierParty.identifier'
              }
            }
          },
          
          // Tender info
          tender: {
            id: '$tender.id',
            title: '$tender.title',
            description: '$tender.description',
            status: '$tender.status',
            method: '$tender.procurementMethod',
            procurementCategory: '$tender.mainProcurementCategory'
          },
          
          // Timestamps
          createdAt: { $ifNull: ['$createdAt', new Date()] },
          lastUpdated: new Date()
        }
      }
    ]).allowDiskUse(true).cursor({ batchSize: this.BATCH_SIZE });

    const awardsBatch: any[] = [];

    for await (const awardItem of cursor) {
      awardsBatch.push(awardItem);
      totalProcessed++;

      if (awardsBatch.length >= this.BATCH_SIZE) {
        await this.insertBatch(awardsBatch, ++batchNumber);
        totalAwards += awardsBatch.length;
        awardsBatch.length = 0; // Clear the batch
        
        this.logger.info(`📊 Processed ${totalProcessed.toLocaleString()} items, inserted ${totalAwards.toLocaleString()}`);
      }
    }

    // Insert remaining items
    if (awardsBatch.length > 0) {
      await this.insertBatch(awardsBatch, ++batchNumber);
      totalAwards += awardsBatch.length;
    }

    this.logger.info(`✅ Items collection created successfully!`);
    this.logger.info(`📈 Total items processed: ${totalProcessed.toLocaleString()}`);
    this.logger.info(`💾 Total items inserted: ${totalAwards.toLocaleString()}`);
    
    await this.generateReport();
  }

  private async insertBatch(batch: any[], batchNumber: number): Promise<void> {
    try {
      // Use bulkWrite with upsert to handle unique constraint on uniqueItemId
      const bulkOps = batch.map(award => ({
        updateOne: {
          filter: { uniqueItemId: award.uniqueItemId },
          update: { $set: award },
          upsert: true
        }
      }));

      const result = await ItemModel.bulkWrite(bulkOps, { ordered: false });
      this.logger.info(`✓ Inserted batch #${batchNumber} (${batch.length} items) - Upserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}`);
    } catch (error) {
      this.logger.error(`❌ Error inserting batch #${batchNumber}:`, error as Error);
      throw error;
    }
  }

  private async generateReport(): Promise<void> {
    this.logger.info('📊 Generating items collection report...');
    
    const [
      totalCount,
      yearStats,
      topBuyers,
      topSuppliers,
      valueStats
    ] = await Promise.all([
      ItemModel.countDocuments(),
      ItemModel.aggregate([
        { $group: { _id: '$sourceYear', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      ItemModel.aggregate([
        { $group: { _id: '$buyer.name', count: { $sum: 1 }, totalValue: { $sum: '$itemUnit.value.amount' } } },
        { $sort: { totalValue: -1 } },
        { $limit: 5 }
      ]),
      ItemModel.aggregate([
        { $group: { _id: '$supplier.name', count: { $sum: 1 }, totalValue: { $sum: '$itemUnit.value.amount' } } },
        { $sort: { totalValue: -1 } },
        { $limit: 5 }
      ]),
      ItemModel.aggregate([
        {
          $group: {
            _id: null,
            totalValue: { $sum: '$itemUnit.value.amount' },
            avgValue: { $avg: '$itemUnit.value.amount' },
            minValue: { $min: '$itemUnit.value.amount' },
            maxValue: { $max: '$itemUnit.value.amount' }
          }
        }
      ])
    ]);

    console.log('\n🏆 ITEMS COLLECTION REPORT');
    console.log('================================');
    console.log(`📊 Total Items: ${totalCount.toLocaleString()}`);
    
    console.log('\n📅 Items by Year:');
    yearStats.forEach((year: any) => {
      console.log(`  ${year._id}: ${year.count.toLocaleString()}`);
    });
    
    if (valueStats[0]) {
      const stats = valueStats[0];
      console.log('\n💰 Value Statistics:');
      console.log(`  Total Value: ${stats.totalValue.toLocaleString()} UYU`);
      console.log(`  Average Value: ${Math.round(stats.avgValue).toLocaleString()} UYU`);
      console.log(`  Min Value: ${stats.minValue.toLocaleString()} UYU`);
      console.log(`  Max Value: ${stats.maxValue.toLocaleString()} UYU`);
    }
    
    console.log('\n🏢 Top 5 Buyers by Value:');
    topBuyers.forEach((buyer: any, index: number) => {
      console.log(`  ${index + 1}. ${buyer._id || 'Unknown'}: ${(buyer.totalValue || 0).toLocaleString()} UYU (${buyer.count.toLocaleString()} items)`);
    });
    
    console.log('\n🏭 Top 5 Suppliers by Value:');
    topSuppliers.forEach((supplier: any, index: number) => {
      console.log(`  ${index + 1}. ${supplier._id || 'Unknown'}: ${(supplier.totalValue || 0).toLocaleString()} UYU (${supplier.count.toLocaleString()} items)`);
    });
    
    console.log('\n✅ Items collection is ready for use!');
  }

  async run(): Promise<void> {
    try {
      await this.createItemsCollection();
    } catch (error) {
      this.logger.error('Items collection creation failed:', error as Error);
      throw error;
    }
  }
}

async function main() {
  const creator = new ItemsCollectionCreator();

  try {
    await creator.connectToDatabase();
    await creator.run();
  } catch (error) {
    console.error('Items collection creation failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

export default ItemsCollectionCreator;
