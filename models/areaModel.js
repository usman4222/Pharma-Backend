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
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    required: true
  }
}, {
  timestamps: true
});

const Area = mongoose.model('Area', areaSchema);

export default Area;
