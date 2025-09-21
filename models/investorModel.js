import mongoose from "mongoose";

// Profit sub-schema
const profitSchema = new mongoose.Schema({
  month: { type: String, required: true }, // e.g., "2025-08"
  sales: { type: Number, required: true },
  gross_profit: { type: Number, default: 0 },
  expense: { type: Number, default: 0 },
  charity: { type: Number, default: 0 },
  net_profit: { type: Number, default: 0 },
  investor_share: { type: Number, default: 0 },
  owner_share: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
}, { _id: false });

// Investor schema
const investorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  amount_invested: [
    {
      amount: { type: Number, required: true },
      date: { type: Date, default: Date.now },
    }
  ],
  profit_percentage: { type: Number }, // optional (if fixed % deal)
  join_date: { type: Date, required: true },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  type: {
    type: String,
    enum: ["company", "investor"],
  },

  profits: [profitSchema], // monthly profit records

  debit_credit: [
    {
      type: { type: String, enum: ["debit", "credit"], required: true },
      amount: { type: Number, required: true },
      note: String,
      date: { type: Date, default: Date.now },
    }
  ],
  debit: {
    type: Number,
    default: 0,
  },
  credit: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

export default mongoose.model("Investor", investorSchema);
