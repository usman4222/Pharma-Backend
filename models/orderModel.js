import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    invoice_number: { type: String, required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    booker_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    paid_amount: { type: Number, required: true },
    due_amount: { type: Number, required: true },
    type: {
      type: String,
      enum: ["purchase", "sale"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export const OrderModel = mongoose.model("Order", orderSchema);
