import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    ptcl_number: {
      type: String,
      default: null,
    },
    phone_number: {
      type: String,
      default: null,
    },
    address: {
      type: String,
      default: null,
    },
    image: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      default: null,
    },
    city: {
        type: String,
        default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Company", companySchema);
