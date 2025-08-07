import mongoose, { Document, Schema } from 'mongoose';

interface IItem extends Document {
  // Release metadata
  releaseId: string;
  ocid: string;
  releaseDate: Date;
  sourceYear: number;
  
  // Award information
  awardId: string;
  uniqueItemId: string; // Composite unique identifier: releaseId + "_" + awardId + "_" + itemId
  awardTitle: string;
  awardDescription?: string;
  awardStatus: string;
  awardDate?: Date;
  awardValue?: {
    amount: number;
    currency: string;
  };
  
  // Item details
  itemId: string;
  itemDescription?: string;
  itemQuantity?: number;
  itemUnit?: {
    name: string;
    value: {
      amount: number;
      currency: string;
    };
  };
  itemClassification?: {
    scheme: string;
    id: string;
    description: string;
    uri?: string;
  };
  
  // Parties information
  buyer?: {
    id: string;
    name: string;
    identifier?: any;
  };
  supplier?: {
    id: string;
    name: string;
    identifier?: any;
  };
  
  // Additional metadata
  tender?: {
    id: string;
    title: string;
    description?: string;
    status: string;
    method?: string;
    procurementCategory?: string;
  };
  
  // Timestamps
  createdAt: Date;
  lastUpdated: Date;
}

const ItemSchema = new Schema<IItem>({
  // Release metadata
  releaseId: { 
    type: String, 
    required: true,
    index: true 
  },
  ocid: { 
    type: String, 
    required: true,
    index: true 
  },
  releaseDate: { 
    type: Date, 
    required: true 
  },
  sourceYear: { 
    type: Number, 
    required: true,
    index: true 
  },
  
  // Award information
  awardId: { 
    type: String, 
    required: true,
    index: true 
  },
  uniqueItemId: { 
    type: String, 
    required: true,
    unique: true,
    index: true 
  },
  awardTitle: { 
    type: String, 
    required: true 
  },
  awardDescription: String,
  awardStatus: { 
    type: String, 
    required: true 
  },
  awardDate: Date,
  awardValue: {
    amount: Number,
    currency: String
  },
  
  // Item details
  itemId: { 
    type: String, 
    required: true 
  },
  itemDescription: String,
  itemQuantity: Number,
  itemUnit: {
    name: String,
    value: {
      amount: { 
        type: Number,
        index: true 
      },
      currency: String
    }
  },
  itemClassification: {
    scheme: String,
    id: { 
      type: String,
      index: true 
    },
    description: String,
    uri: String
  },
  
  // Parties information
  buyer: {
    id: { 
      type: String,
      index: true 
    },
    name: String,
    identifier: Schema.Types.Mixed
  },
  supplier: {
    id: { 
      type: String,
      index: true 
    },
    name: String,
    identifier: Schema.Types.Mixed
  },
  
  // Additional metadata
  tender: {
    id: String,
    title: String,
    description: String,
    status: String,
    method: String,
    procurementCategory: String
  },
  
  // Timestamps
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  lastUpdated: { 
    type: Date, 
    default: Date.now,
    index: true 
  }
}, {
  timestamps: true,
  collection: 'items'
});

// Compound indexes for common queries
ItemSchema.index({ sourceYear: 1, 'buyer.id': 1 });
ItemSchema.index({ sourceYear: 1, 'supplier.id': 1 });
ItemSchema.index({ 'itemUnit.value.amount': 1, sourceYear: 1 });
ItemSchema.index({ 'itemClassification.id': 1, sourceYear: 1 });
ItemSchema.index({ awardDate: 1 });

// Pre-save middleware to update lastUpdated
ItemSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Static method to create or update item
ItemSchema.statics.createOrUpdate = async function(itemData: Partial<IItem>) {
  const result = await this.findOneAndUpdate(
    { uniqueItemId: itemData.uniqueItemId },
    { 
      $set: {
        ...itemData,
        lastUpdated: new Date()
      }
    },
    { 
      upsert: true, 
      new: true,
      runValidators: true 
    }
  );
  return result;
};

// Create and export the model
export const ItemModel = mongoose.model<IItem>('Item', ItemSchema);
export type { ItemSchema };
