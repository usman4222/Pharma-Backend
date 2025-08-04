import mongoose from "mongoose";

const batchSchema = new mongoose.Schema({
  product_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  batch_number: { 
    type: String, 
    required: true 
  },
  purchase_price: { 
    type: Number, 
    required: true 
  },
  stock: { 
    type: Number, 
    default: 0 
  },
  expiry_date: { 
    type: Date, 
    required: true 
  },
}, { timestamps: true });

export const BatchModel = mongoose.model("Batch", batchSchema);
