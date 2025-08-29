import mongoose from "mongoose";

const investorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    investment_amount: { type: Number, required: true, default: 0 },
    percentage_share: { type: Number, default: 0 }, // recalculated automatically

    self_profit_percentage: { type: Number, default: 0, min: 0, max: 100 },
    shared_profit_percentage: { type: Number, default: 100, min: 0, max: 100 },

    gross_profit_share: { type: Number, default: 0 },
    expense_share: { type: Number, default: 0 },
    donation_share: { type: Number, default: 0 },
    net_profit_share: { type: Number, default: 0 },

    self_profit_amount: { type: Number, default: 0 },
    final_total: { type: Number, default: 0 },
  },
  { timestamps: true } // automatically handles createdAt & updatedAt
);

export default mongoose.model("Investor", investorSchema);
