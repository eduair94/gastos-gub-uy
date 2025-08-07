#!/usr/bin/env node

import mongoose from 'mongoose';
import { MONGO_CONFIG } from './config/config';
import {
  AnomalyModel,
  BuyerPatternModel,
  ExpenseInsightModel,
  SupplierPatternModel
} from './database/analytics-models';
import { ItemModel } from './database/item-model';
import { Logger } from './services/logger-service';

class EfficientAnalyticsPopulator {
  /**
   * 0. ITEMS POPULATION - Populate the items collection using ItemModel
   */
  async populateItemsCollection(): Promise<void> {
    this.logger.info('🚀 Starting items collection population...');
    const startTime = Date.now();

    try {
      // Count existing items in the collection
      const existingCount = await ItemModel.countDocuments();
      this.logger.info(`Found ${existingCount.toLocaleString()} existing items in collection`);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(`✅ Items collection check completed in ${duration}s - ${existingCount} items exist`);
    } catch (error) {
      this.logger.error('Error checking items collection:', error as Error);
      throw error;
    }
  }

  private logger: Logger;
  private readonly DATA_VERSION = 4; // New version for this population
  private readonly BATCH_SIZE = 1000;

  constructor() {
    this.logger = new Logger();
  }

  async connectToDatabase(): Promise<void> {
    try {
      const mongoUri = `${MONGO_CONFIG.uri}/${MONGO_CONFIG.database}`;
      await mongoose.connect(mongoUri, {
        maxPoolSize: 100,
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 600000,
        maxIdleTimeMS: 30000,
        writeConcern: { w: 'majority', j: true },
      });
      this.logger.info('✓ Connected to MongoDB for efficient analytics population');
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB', error as Error);
      throw error;
    }
  }

  /**
   * 1. SUPPLIERS POPULATION - Using ItemModel aggregation
   */
  async populateSuppliers(): Promise<void> {
    this.logger.info('🚀 Starting efficient supplier population...');
    const startTime = Date.now();

    try {
      // Get all suppliers with their complete analytics from items collection
      const suppliers = await ItemModel.aggregate([
        // Match valid items with suppliers and amounts
        {
          $match: {
            'supplier.id': { $exists: true, $ne: null },
            'itemUnit.value.amount': { $gt: 0, $type: 'number' }
          }
        },
        
        // Group by supplier to calculate all metrics
        {
          $group: {
            _id: '$supplier.id',
            name: { $first: '$supplier.name' },
            totalContracts: { $addToSet: '$releaseId' }, // Count unique releases/contracts
            totalValue: { $sum: '$itemUnit.value.amount' },
            years: { $addToSet: '$sourceYear' },
            buyers: { $addToSet: '$buyer.id' },
            
            // Collect items for analysis
            items: {
              $push: {
                description: { $ifNull: ['$itemClassification.description', 'Unknown'] },
                amount: '$itemUnit.value.amount',
                quantity: { $ifNull: ['$itemQuantity', 1] },
                currency: { $ifNull: ['$itemUnit.value.currency', 'UYU'] },
                unitName: { $ifNull: ['$itemUnit.name', 'unit'] },
                year: '$sourceYear'
              }
            }
          }
        },
        
        // Calculate final metrics and aggregate items
        {
          $project: {
            _id: 1,
            name: 1,
            totalContracts: { $size: '$totalContracts' },
            totalValue: 1,
            avgContractValue: { 
              $cond: {
                if: { $gt: [{ $size: '$totalContracts' }, 0] },
                then: { $divide: ['$totalValue', { $size: '$totalContracts' }] },
                else: 0
              }
            },
            years: 1,
            yearCount: { $size: '$years' },
            buyers: 1,
            buyerCount: { $size: '$buyers' },
            
            // Aggregate items by description (top 15)
            items: {
              $slice: [
                {
                  $reduce: {
                    input: '$items',
                    initialValue: [],
                    in: {
                      $let: {
                        vars: {
                          existing: {
                            $filter: {
                              input: '$$value',
                              cond: { $eq: ['$$this.description', '$$this.description'] }
                            }
                          }
                        },
                        in: {
                          $cond: {
                            if: { $eq: [{ $size: '$$existing' }, 0] },
                            then: {
                              $concatArrays: [
                                '$$value',
                                [{
                                  description: '$$this.description',
                                  totalAmount: '$$this.amount',
                                  totalQuantity: '$$this.quantity',
                                  contractCount: 1,
                                  avgPrice: { 
                                    $cond: {
                                      if: { $gt: ['$$this.quantity', 0] },
                                      then: { $divide: ['$$this.amount', '$$this.quantity'] },
                                      else: 0
                                    }
                                  },
                                  currency: '$$this.currency',
                                  unitName: '$$this.unitName'
                                }]
                              ]
                            },
                            else: {
                              $map: {
                                input: '$$value',
                                as: 'item',
                                in: {
                                  $cond: {
                                    if: { $eq: ['$$item.description', '$$this.description'] },
                                    then: {
                                      description: '$$item.description',
                                      totalAmount: { $add: ['$$item.totalAmount', '$$this.amount'] },
                                      totalQuantity: { $add: ['$$item.totalQuantity', '$$this.quantity'] },
                                      contractCount: { $add: ['$$item.contractCount', 1] },
                                      avgPrice: { 
                                        $cond: {
                                          if: { $and: [
                                            { $gt: ['$$item.totalQuantity', 0] },
                                            { $gt: [{ $add: ['$$item.totalQuantity', '$$this.quantity'] }, 0] }
                                          ]},
                                          then: { 
                                            $divide: [
                                              { $add: ['$$item.totalAmount', '$$this.amount'] },
                                              { $add: ['$$item.totalQuantity', '$$this.quantity'] }
                                            ]
                                          },
                                          else: 0
                                        }
                                      },
                                      currency: '$$item.currency',
                                      unitName: '$$item.unitName'
                                    },
                                    else: '$$item'
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                15 // Top 15 items
              ]
            },
            
          }
        },
        
        // Sort by total value for processing largest first
        { $sort: { totalValue: -1 } }
      ]).allowDiskUse(true);

      this.logger.info(`Found ${suppliers.length} suppliers to populate`);

      // Bulk insert/update suppliers
      if (suppliers.length > 0) {
        const bulkOps = suppliers.map(supplier => ({
          updateOne: {
            filter: { supplierId: supplier._id },
            update: {
              $set: {
                supplierId: supplier._id,
                name: supplier.name,
                totalContracts: supplier.totalContracts,
                totalValue: supplier.totalValue,
                avgContractValue: supplier.avgContractValue,
                years: supplier.years,
                yearCount: supplier.yearCount,
                buyers: supplier.buyers,
                buyerCount: supplier.buyerCount,
                items: supplier.items || [],
                lastUpdated: new Date(),
                __v: this.DATA_VERSION
              }
            },
            upsert: true
          }
        }));

        // Process in batches
        for (let i = 0; i < bulkOps.length; i += this.BATCH_SIZE) {
          const batch = bulkOps.slice(i, i + this.BATCH_SIZE);
          await SupplierPatternModel.bulkWrite(batch, {
            ordered: false,
            bypassDocumentValidation: true
          });

          const progress = ((i + batch.length) / bulkOps.length * 100).toFixed(1);
          this.logger.info(`📊 Suppliers: ${i + batch.length}/${bulkOps.length} (${progress}%)`);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(`✅ Supplier population completed in ${duration}s - ${suppliers.length} suppliers`);

    } catch (error) {
      this.logger.error('Error populating suppliers:', error as Error);
      throw error;
    }
  }

  /**
   * 2. BUYERS POPULATION - Using ItemModel aggregation
   */
  async populateBuyers(): Promise<void> {
    this.logger.info('🚀 Starting efficient buyer population...');
    const startTime = Date.now();

    try {
      const buyers = await ItemModel.aggregate([
        // Match valid items with buyers and amounts
        {
          $match: {
            'buyer.id': { $exists: true, $ne: null },
            'itemUnit.value.amount': { $gt: 0, $type: 'number' }
          }
        },
        
        // Group by buyer
        {
          $group: {
            _id: '$buyer.id',
            name: { $first: '$buyer.name' },
            totalContracts: { $addToSet: '$releaseId' },
            totalSpending: { $sum: '$itemUnit.value.amount' },
            years: { $addToSet: '$sourceYear' },
            suppliers: { $addToSet: '$supplier.id' },
            
            items: {
              $push: {
                description: { $ifNull: ['$itemClassification.description', 'Unknown'] },
                amount: '$itemUnit.value.amount',
                quantity: { $ifNull: ['$itemQuantity', 1] },
                currency: { $ifNull: ['$itemUnit.value.currency', 'UYU'] },
                unitName: { $ifNull: ['$itemUnit.name', 'unit'] }
              }
            }
          }
        },
        
        {
          $project: {
            _id: 1,
            name: 1,
            totalContracts: { $size: '$totalContracts' },
            totalSpending: 1,
            avgContractValue: { 
              $cond: {
                if: { $gt: [{ $size: '$totalContracts' }, 0] },
                then: { $divide: ['$totalSpending', { $size: '$totalContracts' }] },
                else: 0
              }
            },
            years: 1,
            yearCount: { $size: '$years' },
            suppliers: 1,
            supplierCount: { $size: '$suppliers' },
            
            // Top items by spending
            items: {
              $slice: [
                {
                  $reduce: {
                    input: '$items',
                    initialValue: [],
                    in: {
                      $let: {
                        vars: {
                          existing: {
                            $filter: {
                              input: '$$value',
                              cond: { $eq: ['$$this.description', '$$this.description'] }
                            }
                          }
                        },
                        in: {
                          $cond: {
                            if: { $eq: [{ $size: '$$existing' }, 0] },
                            then: {
                              $concatArrays: [
                                '$$value',
                                [{
                                  description: '$$this.description',
                                  totalAmount: '$$this.amount',
                                  totalQuantity: '$$this.quantity',
                                  contractCount: 1,
                                  avgPrice: { 
                                    $cond: {
                                      if: { $gt: ['$$this.quantity', 0] },
                                      then: { $divide: ['$$this.amount', '$$this.quantity'] },
                                      else: 0
                                    }
                                  }
                                }]
                              ]
                            },
                            else: {
                              $map: {
                                input: '$$value',
                                as: 'item',
                                in: {
                                  $cond: {
                                    if: { $eq: ['$$item.description', '$$this.description'] },
                                    then: {
                                      description: '$$item.description',
                                      totalAmount: { $add: ['$$item.totalAmount', '$$this.amount'] },
                                      totalQuantity: { $add: ['$$item.totalQuantity', '$$this.quantity'] },
                                      contractCount: { $add: ['$$item.contractCount', 1] },
                                      avgPrice: {
                                        $cond: {
                                          if: { $gt: [{ $add: ['$$item.totalQuantity', '$$this.quantity'] }, 0] },
                                          then: {
                                            $divide: [
                                              { $add: ['$$item.totalAmount', '$$this.amount'] },
                                              { $add: ['$$item.totalQuantity', '$$this.quantity'] }
                                            ]
                                          },
                                          else: 0
                                        }
                                      }
                                    },
                                    else: '$$item'
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                15
              ]
            },
            
          }
        },
        
        { $sort: { totalSpending: -1 } }
      ]).allowDiskUse(true);

      this.logger.info(`Found ${buyers.length} buyers to populate`);

      if (buyers.length > 0) {
        const bulkOps = buyers.map(buyer => ({
          updateOne: {
            filter: { buyerId: buyer._id },
            update: {
              $set: {
                buyerId: buyer._id,
                name: buyer.name,
                totalContracts: buyer.totalContracts,
                totalSpending: buyer.totalSpending,
                avgContractValue: buyer.avgContractValue,
                years: buyer.years,
                yearCount: buyer.yearCount,
                suppliers: buyer.suppliers,
                supplierCount: buyer.supplierCount,
                items: buyer.items || [],
                lastUpdated: new Date(),
                __v: this.DATA_VERSION
              }
            },
            upsert: true
          }
        }));

        for (let i = 0; i < bulkOps.length; i += this.BATCH_SIZE) {
          const batch = bulkOps.slice(i, i + this.BATCH_SIZE);
          await BuyerPatternModel.bulkWrite(batch, {
            ordered: false,
            bypassDocumentValidation: true
          });

          const progress = ((i + batch.length) / bulkOps.length * 100).toFixed(1);
          this.logger.info(`📊 Buyers: ${i + batch.length}/${bulkOps.length} (${progress}%)`);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(`✅ Buyer population completed in ${duration}s - ${buyers.length} buyers`);

    } catch (error) {
      this.logger.error('Error populating buyers:', error as Error);
      throw error;
    }
  }

  /**
   * 3. EXPENSE INSIGHTS POPULATION - Using ItemModel aggregation
   */
  async populateExpenseInsights(): Promise<void> {
    this.logger.info('🚀 Starting expense insights population...');
    const startTime = Date.now();

    try {
      // Get yearly insights from items collection
            const yearlyInsights = await ItemModel.aggregate([
        {
          $match: {
            'itemUnit.value.amount': { $gt: 0, $type: 'number' },
            sourceYear: { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: '$sourceYear',
            totalAmount: { $sum: '$itemUnit.value.amount' },
            totalTransactions: { $sum: 1 },
            currency: { $first: { $ifNull: ['$itemUnit.value.currency', 'UYU'] } },
            
            suppliers: {
              $push: {
                id: '$supplier.id',
                name: '$supplier.name',
                amount: '$itemUnit.value.amount'
              }
            },
            
            buyers: {
              $push: {
                id: '$buyer.id',
                name: '$buyer.name',
                amount: '$itemUnit.value.amount'
              }
            }
          }
        },
        {
          $project: {
            year: '$_id',
            totalAmount: 1,
            totalTransactions: 1,
            averageAmount: { 
              $cond: {
                if: { $gt: ['$totalTransactions', 0] },
                then: { $divide: ['$totalAmount', '$totalTransactions'] },
                else: 0
              }
            },
            currency: 1,
            
            // Top 10 suppliers by amount
            topSuppliers: {
              $slice: [
                {
                  $reduce: {
                    input: '$suppliers',
                    initialValue: [],
                    in: {
                      $let: {
                        vars: {
                          existing: {
                            $filter: {
                              input: '$$value',
                              cond: { $eq: ['$$this.id', '$$this.id'] }
                            }
                          }
                        },
                        in: {
                          $cond: {
                            if: { $eq: [{ $size: '$$existing' }, 0] },
                            then: {
                              $concatArrays: [
                                '$$value',
                                [{
                                  id: '$$this.id',
                                  name: '$$this.name',
                                  totalAmount: '$$this.amount',
                                  transactionCount: 1
                                }]
                              ]
                            },
                            else: {
                              $map: {
                                input: '$$value',
                                as: 'supplier',
                                in: {
                                  $cond: {
                                    if: { $eq: ['$$supplier.id', '$$this.id'] },
                                    then: {
                                      id: '$$supplier.id',
                                      name: '$$supplier.name',
                                      totalAmount: { $add: ['$$supplier.totalAmount', '$$this.amount'] },
                                      transactionCount: { $add: ['$$supplier.transactionCount', 1] }
                                    },
                                    else: '$$supplier'
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                10
              ]
            },
            
            // Top buyers
            topBuyers: { $slice: ['$buyers', 10] }
          }
        },
        { $sort: { year: -1 } }
      ]).allowDiskUse(true);

      this.logger.info(`Found ${yearlyInsights.length} yearly insights to populate`);

      if (yearlyInsights.length > 0) {
        const bulkOps = yearlyInsights.map(insight => ({
          updateOne: {
            filter: { year: insight.year, month: { $exists: false } },
            update: {
              $set: {
                year: insight.year,
                totalAmount: insight.totalAmount,
                totalTransactions: insight.totalTransactions,
                averageAmount: insight.averageAmount,
                currency: insight.currency,
                topSuppliers: insight.topSuppliers || [],
                topBuyers: insight.topBuyers || []
              }
            },
            upsert: true
          }
        }));

        await ExpenseInsightModel.bulkWrite(bulkOps, {
          ordered: false,
          bypassDocumentValidation: true
        });
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(`✅ Expense insights completed in ${duration}s - ${yearlyInsights.length} years`);

    } catch (error) {
      this.logger.error('Error populating expense insights:', error as Error);
      throw error;
    }
  }

  /**
   * 4. ANOMALY DETECTION - Using ItemModel for anomaly detection
   */
  async populateAnomalies(): Promise<void> {
    this.logger.info('🚀 Starting anomaly detection and population...');
    const startTime = Date.now();

    try {
      // Detect price spikes from items collection
      const priceSpikes = await ItemModel.aggregate([
        {
          $match: {
            'itemUnit.value.amount': { $gt: 100000 }, // Only check high-value items
            'releaseId': { $exists: true, $ne: null } // Ensure releaseId exists
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
            count: { $gte: 5 }, // At least 5 similar items
            $expr: { $gt: ['$maxAmount', { $multiply: ['$avgAmount', 10] }] } // Max > 10x average
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
            // Remove _id to avoid conflicts
            _id: 0,
            type: 'price_spike',
            severity: {
              $switch: {
                branches: [
                  { case: { $gt: ['$outliers.amount', { $multiply: ['$avgAmount', 20] }] }, then: 'critical' },
                  { case: { $gt: ['$outliers.amount', { $multiply: ['$avgAmount', 15] }] }, then: 'high' },
                  { case: { $gt: ['$outliers.amount', { $multiply: ['$avgAmount', 10] }] }, then: 'medium' }
                ],
                default: 'low'
              }
            },
            releaseId: '$outliers.releaseId',
            awardId: '$outliers.awardId',
            description: {
              $concat: [
                'Unusual price detected for ',
                { $ifNull: ['$outliers.itemClassification.description', 'Unknown Item'] },
                ': ',
                { $toString: '$outliers.amount' },
                ' ',
                { $ifNull: ['$outliers.itemUnit.value.currency', 'UYU'] },
                ' (avg: ',
                { $toString: { $round: ['$avgAmount', 2] } },
                ' ',
                { $ifNull: ['$outliers.itemUnit.value.currency', 'UYU'] },
                ')'
              ]
            },
            detectedValue: '$outliers.amount',
            expectedRange: {
              min: { $multiply: ['$avgAmount', 0.5] },
              max: { $multiply: ['$avgAmount', 2] }
            },
            confidence: 0.8,
            detectedAt: new Date(),
            metadata: {
              supplierName: '$outliers.supplierName',
              buyerName: '$outliers.buyerName',
              itemDescription: '$outliers.itemDescription',
              itemClassification: {
                description: '$outliers.itemClassification.description',
                scheme: '$outliers.itemClassification.scheme',
                id: '$outliers.itemClassification.id'
              },
              itemUnit: {
                name: '$outliers.itemUnit.name',
                currency: '$outliers.itemUnit.value.currency'
              },
              itemQuantity: '$outliers.itemQuantity',
              year: '$outliers.year',
              amount: '$outliers.amount',
              currency: 'UYU'
            }
          }
        },
        { $limit: 1000 } // Limit to prevent overwhelming
      ]).allowDiskUse(true);

      this.logger.info(`Detected ${priceSpikes.length} price spike anomalies`);

      // Debug: Log a sample anomaly to see the structure
      if (priceSpikes.length > 0) {
        this.logger.info('=== SAMPLE ANOMALY STRUCTURE ===');
        this.logger.info(JSON.stringify(priceSpikes[0], null, 2));
        this.logger.info('================================');
      }

      if (priceSpikes.length > 0) {
        // Clean and validate anomaly data before insertion
        const anomalyOps = priceSpikes.map(anomaly => {
          // Ensure all required fields are present and valid
          const cleanAnomaly: any = {
            type: anomaly.type,
            severity: anomaly.severity,
            releaseId: String(anomaly.releaseId || ''), // Ensure string
            description: String(anomaly.description || ''),
            detectedValue: Number(anomaly.detectedValue || 0),
            expectedRange: {
              min: Number(anomaly.expectedRange?.min || 0),
              max: Number(anomaly.expectedRange?.max || 0)
            },
            confidence: Number(anomaly.confidence || 0.8),
            detectedAt: new Date(),
            metadata: {
              supplierName: anomaly.metadata?.supplierName ? String(anomaly.metadata.supplierName) : undefined,
              buyerName: anomaly.metadata?.buyerName ? String(anomaly.metadata.buyerName) : undefined,
              itemDescription: anomaly.metadata?.itemDescription ? String(anomaly.metadata.itemDescription) : undefined,
              itemClassification: anomaly.metadata?.itemClassification ? {
                description: anomaly.metadata.itemClassification.description ? String(anomaly.metadata.itemClassification.description) : undefined,
                scheme: anomaly.metadata.itemClassification.scheme ? String(anomaly.metadata.itemClassification.scheme) : undefined,
                id: anomaly.metadata.itemClassification.id ? String(anomaly.metadata.itemClassification.id) : undefined
              } : undefined,
              itemUnit: anomaly.metadata?.itemUnit ? {
                name: anomaly.metadata.itemUnit.name ? String(anomaly.metadata.itemUnit.name) : undefined,
                currency: anomaly.metadata.itemUnit.currency ? String(anomaly.metadata.itemUnit.currency) : undefined
              } : undefined,
              itemQuantity: anomaly.metadata?.itemQuantity ? Number(anomaly.metadata.itemQuantity) : undefined,
              year: anomaly.metadata?.year ? Number(anomaly.metadata.year) : undefined,
              amount: anomaly.metadata?.amount ? Number(anomaly.metadata.amount) : undefined,
              currency: anomaly.metadata?.currency ? String(anomaly.metadata.currency) : 'UYU'
            }
          };

          // Add awardId only if it exists and is valid
          if (anomaly.awardId && String(anomaly.awardId).trim()) {
            cleanAnomaly.awardId = String(anomaly.awardId);
          }

          // Clean metadata - remove undefined values
          const cleanMetadata: any = {};
          Object.keys(cleanAnomaly.metadata).forEach(key => {
            if (cleanAnomaly.metadata[key] !== undefined) {
              if (key === 'itemClassification' || key === 'itemUnit') {
                // Handle nested objects
                const nestedObj: any = {};
                Object.keys(cleanAnomaly.metadata[key]).forEach(nestedKey => {
                  if (cleanAnomaly.metadata[key][nestedKey] !== undefined) {
                    nestedObj[nestedKey] = cleanAnomaly.metadata[key][nestedKey];
                  }
                });
                // Only add if there are valid nested properties
                if (Object.keys(nestedObj).length > 0) {
                  cleanMetadata[key] = nestedObj;
                }
              } else {
                cleanMetadata[key] = cleanAnomaly.metadata[key];
              }
            }
          });
          cleanAnomaly.metadata = cleanMetadata;

          return {
            updateOne: {
              filter: { 
                releaseId: cleanAnomaly.releaseId,
                ...(cleanAnomaly.awardId && { awardId: cleanAnomaly.awardId }),
                type: cleanAnomaly.type
              },
              update: { $set: cleanAnomaly },
              upsert: true
            }
          };
        });

        try {
          const res = await AnomalyModel.bulkWrite(anomalyOps, {
            ordered: false,
            bypassDocumentValidation: false // Enable validation to catch issues
          });

          this.logger.info(`✅ Anomalies stored: ${res.upsertedCount} new, ${res.modifiedCount} updated`);
          
          // Log any validation errors if they exist
          if (res.mongoose?.validationErrors && res.mongoose.validationErrors.length > 0) {
            this.logger.error(`⚠️ Validation errors in anomaly insertion: ${res.mongoose.validationErrors.length}`);
            // Log first few errors for debugging
            res.mongoose.validationErrors.slice(0, 3).forEach((error, index) => {
              this.logger.error(`Error ${index + 1}:`, error);
            });
          }
        } catch (bulkWriteError) {
          this.logger.error('Bulk write error for anomalies:', bulkWriteError as Error);
          throw bulkWriteError;
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(`✅ Anomaly detection completed in ${duration}s - ${priceSpikes.length} anomalies`);

    } catch (error) {
      this.logger.error('Error detecting anomalies:', error as Error);
      throw error;
    }
  }

  /**
   * 5. DATA QUALITY REPORT
   */
  async generateDataQualityReport(): Promise<void> {
    this.logger.info('📊 Generating data quality report...');

    try {
      const [
        totalItems,
        suppliersCount,
        buyersCount,
        expenseInsightsCount,
        anomaliesCount,
        sampleSupplier,
        sampleBuyer
      ] = await Promise.all([
        ItemModel.countDocuments(),
        SupplierPatternModel.countDocuments(),
        BuyerPatternModel.countDocuments(),
        ExpenseInsightModel.countDocuments(),
        AnomalyModel.countDocuments(),
        SupplierPatternModel.findOne().sort({ totalValue: -1 }).lean(),
        BuyerPatternModel.findOne().sort({ totalSpending: -1 }).lean()
      ]);

      this.logger.info(`
📋 DATA QUALITY REPORT
====================
� Total Items: ${totalItems.toLocaleString()}
👥 Suppliers Analyzed: ${suppliersCount.toLocaleString()}
🏛️  Buyers Analyzed: ${buyersCount.toLocaleString()}
📈 Expense Insights: ${expenseInsightsCount.toLocaleString()}
⚠️  Anomalies Detected: ${anomaliesCount.toLocaleString()}

🎯 TOP PERFORMERS:
Top Supplier: ${sampleSupplier?.name || 'N/A'} (${(sampleSupplier?.totalValue || 0).toLocaleString()} UYU)
Top Buyer: ${sampleBuyer?.name || 'N/A'} (${(sampleBuyer?.totalSpending || 0).toLocaleString()} UYU)

✅ Population Status: COMPLETE
🕐 Data Version: ${this.DATA_VERSION}
      `);

    } catch (error) {
      this.logger.error('Error generating report:', error as Error);
      throw error;
    }
  }

  /**
   * MAIN EXECUTION - Run all population tasks
   */
  async populateAll(): Promise<void> {
    const totalStartTime = Date.now();
    this.logger.info('🚀 Starting COMPLETE analytics population...');

    try {
      // Run all population tasks in sequence for data consistency
      await this.populateItemsCollection();
      await this.populateAnomalies();
      await this.populateSuppliers();
      await this.populateBuyers();
      await this.populateExpenseInsights();
      await this.generateDataQualityReport();

      const totalDuration = ((Date.now() - totalStartTime) / 1000).toFixed(2);
      this.logger.info(`
🎉 ANALYTICS POPULATION COMPLETE! 
Total time: ${totalDuration} seconds
Database ready for production use.
      `);

    } catch (error) {
      this.logger.error('Failed to populate analytics data:', error as Error);
      throw error;
    }
  }
}

async function main() {
  const populator = new EfficientAnalyticsPopulator();

  try {
    await populator.connectToDatabase();
    await populator.populateAll();
  } catch (error) {
    console.error('Population failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

export default EfficientAnalyticsPopulator;
