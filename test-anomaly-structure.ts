import mongoose from 'mongoose';
import { MONGO_CONFIG } from './src/config/config';
import { ItemModel } from './src/database/item-model';

async function testAnomalyStructure() {
  try {
    const mongoUri = `${MONGO_CONFIG.uri}/${MONGO_CONFIG.database}`;
    await mongoose.connect(mongoUri);
    
    console.log('🔍 Testing anomaly aggregation structure...');
    
    const priceSpikes = await ItemModel.aggregate([
      {
        $match: {
          'itemUnit.value.amount': { $gt: 100000 },
          'releaseId': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            description: '$itemDescription',
            scheme: '$itemClassification.scheme'
          },
          avgAmount: { $avg: '$itemUnit.value.amount' },
          maxAmount: { $max: '$itemUnit.value.amount' },
          minAmount: { $min: '$itemUnit.value.amount' },
          count: { $sum: 1 },
          samples: {
            $push: {
              releaseId: '$releaseId',
              awardId: { $ifNull: ['$awardId', null] },
              amount: '$itemUnit.value.amount',
              supplierName: { $ifNull: ['$supplier.name', 'Unknown'] },
              buyerName: { $ifNull: ['$buyer.name', 'Unknown'] },
              year: { $ifNull: ['$sourceYear', 2024] },
              itemClassification: {
                description: { $ifNull: ['$itemClassification.description', 'Unknown'] },
                scheme: { $ifNull: ['$itemClassification.scheme', 'Unknown'] },
                id: { $ifNull: ['$itemClassification.id', 'Unknown'] }
              },
              itemDescription: { $ifNull: ['$itemDescription', 'Unknown'] },
              itemUnit: {
                name: { $ifNull: ['$itemUnit.name', 'unit'] },
                value: {
                  currency: { $ifNull: ['$itemUnit.value.currency', 'UYU'] }
                }
              },
              itemQuantity: { $ifNull: ['$itemQuantity', 1] }
            }
          }
        }
      },
      {
        $match: {
          count: { $gte: 5 },
          $expr: { $gt: ['$maxAmount', { $multiply: ['$avgAmount', 10] }] }
        }
      },
      {
        $project: {
          description: '$_id.description',
          scheme: '$_id.scheme',
          avgAmount: 1,
          maxAmount: 1,
          outliers: {
            $filter: {
              input: '$samples',
              cond: { $gt: ['$$this.amount', { $multiply: ['$avgAmount', 5] }] }
            }
          }
        }
      },
      { $unwind: '$outliers' },
      {
        $project: {
          _id: 0,
          type: 'price_spike',
          releaseId: '$outliers.releaseId',
          description: {
            $concat: [
              'Test: ',
              { $ifNull: ['$outliers.itemClassification.description', 'NO_CLASSIFICATION'] }
            ]
          },
          metadata: {
            supplierName: '$outliers.supplierName',
            itemClassification: '$outliers.itemClassification',
            originalSample: '$outliers'
          }
        }
      },
      { $limit: 2 }
    ]).allowDiskUse(true);

    console.log('📊 Found', priceSpikes.length, 'test anomalies');
    
    if (priceSpikes.length > 0) {
      console.log('=== FIRST ANOMALY STRUCTURE ===');
      console.log(JSON.stringify(priceSpikes[0], null, 2));
      console.log('===============================');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testAnomalyStructure();
