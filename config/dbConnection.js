import mongoose from "mongoose";

export const dbConnection = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL); 
    console.log("✅ Connected to database");
  } catch (err) {
    console.error("❌ Error connecting to database:", err.message);
    throw err;
  }
};
