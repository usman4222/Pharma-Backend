import mongoose from "mongoose";

const investorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    investment_amount: {
      type: Number,
      required: true,
      default: 0,
    },
    percentage_share: {
      type: Number,
      required: true,
      default: 0, // auto-calculated based on all investments
    },

    // ✅ Profit distribution preferences
    self_profit_percentage: {
      type: Number,
      default: 0, // if investor keeps some part separately
    },
    shared_profit_percentage: {
      type: Number,
      default: 100, // the portion that goes into shared pool
    },

    // ✅ Calculated fields
    gross_profit_share: {
      type: Number,
      default: 0,
    },
    expense_share: {
      type: Number,
      default: 0,
    },
    donation_share: {
      type: Number,
      default: 0,
    },
    net_profit_share: {
      type: Number,
      default: 0,
    },

    // ✅ Final distribution
    amount_payable: {
      type: Number,
      default: 0,
    },
    self_profit_amount: {
      type: Number,
      default: 0, // portion that goes directly to investor
    },
    final_total: {
      type: Number,
      default: 0,
    },

    // Meta
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Investor", investorSchema);
