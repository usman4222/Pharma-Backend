// seedUser.js
import bcrypt from "bcryptjs";
import { User } from "../models/userModel.js";

export const seedDefaultUser = async () => {
  try {
    // ✅ Check for the correct email
    const existingUser = await User.findOne({ email: "admin@gmail.com" });

    if (!existingUser) {
      const hashedPassword = await bcrypt.hash("123456", 10);

      const user = new User({
        name: "Admin",
        email: "admin@gmail.com",
        password: hashedPassword,
        role: "admin",
        status: "active",
        tokenVersion: 0,
      });

      await user.save();
      console.log("✅ Default admin user created!");
    } else {
      console.log("ℹ️ Default admin user exists.");
    }
  } catch (error) {
    console.error("❌ Error seeding default user:", error.message);
  }
};
