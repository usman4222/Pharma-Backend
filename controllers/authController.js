import { User } from "../models/userModel.js";
import { sendError, successResponse } from "../utils/response.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

//login User
export const loginUser = async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // ✅ Check email and password
      if (!email || !password) {
        return sendError(res, "Email and password are required", 400);
      }
  
      // ✅ Find user by email
      const user = await User.findOne({ email });
  
      if (!user) {
        return sendError(res, "Invalid email or password", 401);
      }
  
      // ✅ Compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return sendError(res, "Invalid email or password", 401);
      }
  
      // ✅ Check if user is admin
      if (user.role !== "admin") {
        return sendError(res, "Only admin users can log in", 403);
      }
  
      // ✅ Create JWT token
      const token = jwt.sign(
        { userId: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
  
      // ✅ Success response
      return successResponse(res, "Login successful", {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          type: user.type,
        },
      });
    } catch (error) {
      console.error("Login Error:", error);
      return sendError(res, "Login failed", 500);
    }
  };
  
  export const logoutUser = async (req, res) => {
    try {
        const userId = req.user.id;
  
        const user = await User.findById(userId);
        if (!user) {
            return sendError(res, "User not found", 404);
        }
  
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();
  
        return successResponse(res, "Logout successful", null, 200);
    } catch (error) {
        console.error("Logout error:", error);
        return sendError(res, "Failed to logout", 500);
    }
  };


  const authController = {
    logoutUser,
    loginUser
  };
  
  export default authController;
  