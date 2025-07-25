import { User } from "../models/userModel.js";
import { UserLedger } from "../models/userLedgerModel.js";
import { sendError, successResponse } from "../utils/response.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
// GET all users (filtered by status)
const getAllUsers = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status !== undefined) {
      query.status = status;
    }

    const users = await User.find(query).sort({ createdAt: -1 });
    successResponse(res, "Users fetched", users);
  } catch (error) {
    sendError(res, "Get Users Error", error);
  }
};

// GET single user
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return sendError(res, "User not found");
    successResponse(res, "User fetched", user);
  } catch (error) {
    sendError(res, "Get User Error", error);
  }
};

// CREATE user
export const createUser = async (req, res) => {
  try {
    const {
      name,
      father_name,
      email,
      password,
      phone_number,
      mobile_number,
      salary,
      city,
      areas,
      role,
      employee_type,
      incentive_type,
      incentive_percentage,
      type,
      join_date,
      cnic,
      profile_photo,
      cnic_front,
      cnic_back,
      cheque_photo,
      e_stamp,
      status,
    } = req.body;

    // ✅ Required field validation
    if (!name || !father_name || !email || !password) {
      return sendError(res, "name, father_name, email, and password are required", 400);
    }

    // ✅ Hash password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Prepare user data
    const userData = {
      name,
      father_name,
      email,
      password: hashedPassword,
      phone_number: phone_number || "",
      mobile_number: mobile_number || "",
      salary: salary || 0,
      city: city || "",
      areas: Array.isArray(areas) ? areas : [],
      role: role || "",
      employee_type: employee_type || "",
      incentive_type: incentive_type || "",
      incentive_percentage: incentive_percentage || 0,
      type: type || "",
      join_date: join_date || null,
      cnic: cnic || "",
      profile_photo: profile_photo || "",
      cnic_front: cnic_front || "",
      cnic_back: cnic_back || "",
      cheque_photo: cheque_photo || "",
      e_stamp: e_stamp || "",
      status: status || "active",
    };

    // ✅ Create user
    const user = await User.create(userData);

    // ✅ Create UserLedger if salary is valid
    if (salary && salary > 0) {
      await UserLedger.create({
        user_id: user._id,
        salary,
        date: new Date(),
      });
    }

    return successResponse(res, "User created successfully", { user }, 201);
  } catch (error) {
    console.error("Create User Error:", error);
    return sendError(res, "Failed to create user", 500);
  }
};



// UPDATE user
const updateUser = async (req, res) => {
  try {
    const userData = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return sendError(res, "User not found");

    Object.assign(user, userData);
    await user.save();

    if (userData.salary) {
      await UserLedger.findOneAndUpdate(
        { user_id: user._id },
        { salary: userData.salary },
        { upsert: true }
      );
    }

    successResponse(res, "User updated", user);
  } catch (error) {
    sendError(res, "Update User Error", error);
  }
};

// DELETE user
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return sendError(res, "User not found");
    successResponse(res, "User deleted");
  } catch (error) {
    sendError(res, "Delete User Error", error);
  }
};

// TOGGLE user status
const toggleUserStatus = async (req, res) => {
  try {
    const { id, status } = req.body;
    const user = await User.findById(id);
    if (!user) return sendError(res, "User not found");

    user.status = status;
    await user.save();

    successResponse(res, "User status updated", { id, status });
  } catch (error) {
    sendError(res, "Toggle User Status Error", error);
  }
};

// GET user ledger
const getUserLedger = async (req, res) => {
  try {
    const ledger = await UserLedger.find({ user_id: req.params.id }).populate("user");
    successResponse(res, "User ledger fetched", ledger);
  } catch (error) {
    sendError(res, "Get User Ledger Error", error);
  }
};

const userController = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  getUserLedger,
};

export default userController;
