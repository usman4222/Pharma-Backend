import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phone_number: {
    type: String,
    trim: true
  },
  ptcl_number: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  area_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Areas'
  },
  city_id: {
    type: String,
    trim: true
    // type: mongoose.Schema.Types.ObjectId,
    // ref: 'Cities' // You might want to reference a proper City model instead of keeping it as String
  },
  booker_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Users'
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  licence_number: {
    type: String,
    trim: true
  },
  licence_expiry: {
    type: Date
  },
  ntn_number: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    trim: true
  },
  opening_balance: {
    type: Number,
    default: 0
  },
  credit_period: {
    type: Number,
    default: 0
  },
  credit_limit: {
    type: Number,
    default: 0
  },
  cnic: {
    type: String,
    trim: true
  },
  licence_photo: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

export const SupplierModel = mongoose.model('Supplier', supplierSchema);
