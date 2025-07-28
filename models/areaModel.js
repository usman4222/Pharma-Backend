import mongoose from 'mongoose';

const areaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  city: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

export const Area = mongoose.model('Area', areaSchema);
