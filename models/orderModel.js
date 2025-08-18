import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    invoice_number: { type: String, required: true },
    supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    booker_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, },
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    paid_amount: { type: Number, required: true },
    due_amount: { type: Number, required: true },
    due_date: { type: Date, default: null },
    net_value: { type: Number, required: true },
    type: {
      type: String,
      enum: ["purchase", "sale", "estimated"],
      required: true,
    },
    status: {
      type: String,
      enum: ["completed", "skipped"],
      default: "completed",
    },
  },
  { timestamps: true }
);

export const OrderModel = mongoose.model("Order", orderSchema);
