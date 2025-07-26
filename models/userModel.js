import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    father_name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone_number: {
      type: String,
    },
    mobile_number: {
      type: String,
    },
    salary: {
      type: Number,
    },
    city: { type: String }, // 👈 New
    areas: [{ type: String }], // 👈 New
    role: { type: String }, // 👈 New
    employee_type: { type: String }, // 👈 New
    incentive_type: { type: String }, // 👈 New
    incentive_percentage: { type: Number },
    type: {
      type: String, // e.g., 'admin', 'employee', etc.
    },
    join_date: {
      type: Date,
    },
    cnic: {
      type: String,
    },
    profile_photo: {
      type: String,
    },
    cnic_front: {
      type: String,
    },
    cnic_back: {
      type: String,
    },
    cheque_photo: {
      type: String,
    },
    e_stamp: {
      type: String,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "blocked"],
      default: "active",
    },
    tokenVersion: {
      type: Number,
      default: 0
    }    
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model("User", userSchema);
