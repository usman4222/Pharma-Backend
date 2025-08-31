import { User } from "../models/userModel.js";
import { UserLedger } from "../models/userLedgerModel.js";
import { sendError, successResponse } from "../utils/response.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

// GET all users (filtered by status)
const getAllUsers = async (req, res) => {
  try {
    const { status } = req.query;

    const query = {
      // exclude admin@gmail.com
      email: { $ne: "admin@gmail.com" },
    };

    if (status !== undefined) {
      query.status = status;
    }

    // Fetch all users except admin
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .populate("area_id", "name city description");

    return successResponse(res, "Users fetched successfully", {
      users,
      totalItems: users.length,
    });
  } catch (error) {
    return sendError(res, "Failed to fetch users", error);
  }
};



const getAllActiveUsers = async (req, res) => {
  try {
    const { status } = req.query;

    const query = {
      email: { $ne: "admin@gmail.com" },
      status: "active",
    };

    if (status !== undefined) {
      query.status = status;
    }

    // Fetch all users except admin
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .populate("area_id", "name city description");

    return successResponse(res, "Users fetched successfully", {
      users,
      totalItems: users.length,
    });
  } catch (error) {
    return sendError(res, "Failed to fetch users", error);
  }
};


// GET single user
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('area_id name');
    console.log("user", user)
    if (!user) return sendError(res, "User not found");
    successResponse(res, "User fetched", { user });
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
      area_id,
      role,
      employee_type,
      incentive_type,
      incentive_percentage,
      join_date,
      cnic,
      status,
      profile_photo,
      cnic_front,
      cnic_back,
      cheque_photo,
      e_stamp
    } = req.body || {};

    // Required field validation
    if (!name) {
      return sendError(res, "Name is required", 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Prepare file paths
    const filePaths = {
      profile_photo: profile_photo || "",
      cnic_front: cnic_front || "",
      cnic_back: cnic_back || "",
      cheque_photo: cheque_photo || "",
      e_stamp: e_stamp || ""
    };

    // Create user data
    const userData = {
      name,
      father_name,
      email,
      password: hashedPassword,
      phone_number: phone_number || null,
      mobile_number: mobile_number || null,
      salary: salary || 0,
      city: city || "",
      area_id,
      role: role || "",
      employee_type: employee_type || "",
      incentive_type: incentive_type || "",
      incentive_percentage: incentive_percentage || 0,
      join_date: join_date || null,
      cnic: cnic || "",
      status: status || "active",
      ...filePaths
    };

    // Create user
    const user = await User.create(userData);
    return successResponse(res, "User created successfully", { user }, 201);

  } catch (error) {
    console.error("Create User Error:", error);
    if (error.code === 11000 && error.keyPattern?.email) {
      return sendError(res, "A user with this email already exists", 400);
    }
    return sendError(res, "Failed to create user", 500);
  }
};


// get Booker
export const getAllBookers = async (req, res) => {
  try {
    const bookers = await User.find({ employee_type: "booker" })
      .select("_id name")
      .sort({ name: 1 });
    return successResponse(res, "Bookers fetched", { bookers });
  } catch (error) {
    console.error("Error fetching bookers:", error);
    return sendError(res, "Failed to fetch bookers", 500);
  }
};




// UPDATE user
const updateUser = async (req, res) => {
  try {
    const userData = { ...req.body };

    // Ensure area_id is an array of ObjectIds
    if (userData.area_id && typeof userData.area_id === "string") {
      userData.area_id = userData.area_id
        .split(",")
        .map((id) => new mongoose.Types.ObjectId(id.trim()));
    }

    const user = await User.findById(req.params.id);
    if (!user) return sendError(res, "User not found");

    // Handle image fields - only update if they have non-empty values
    const imageFields = ['profile_photo', 'cnic_front', 'cnic_back', 'cheque_photo', 'e_stamp'];

    imageFields.forEach(field => {
      if (userData[field] !== undefined && userData[field] !== null && userData[field] !== "") {
        user[field] = userData[field];
      }
    });

    // Update other fields excluding image fields
    const nonImageFields = Object.keys(userData).filter(field => !imageFields.includes(field));
    nonImageFields.forEach(field => {
      user[field] = userData[field];
    });

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
    console.error("Update User Error:", error);
    sendError(res, "Update User Error", error);
  }
};
// DELETE user
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return sendError(res, "User not found");

    // ✅ Also delete the associated UserLedger entries
    await UserLedger.deleteMany({ user_id: user._id });

    successResponse(res, "User and related ledger entries deleted");
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
  getAllActiveUsers,
  deleteUser,
  toggleUserStatus,
  getUserLedger,
  getAllBookers,
};

export default userController;
