import mongoose from "mongoose";

const userLedgerSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", 
    required: true,
  },
  salary: {
    type: Number,
    default: 0,
  },
  gross_salary: {
    type: Number,
    default: 0,
  },
  incentive: {
    type: Number,
    default: 0,
  },
  advance: {
    type: Number,
    default: 0,
  },
  advance_date: {
    type: Date,
  },
}, {
  timestamps: true, // adds createdAt and updatedAt
});

export const UserLedger = mongoose.model("UserLedger", userLedgerSchema);

