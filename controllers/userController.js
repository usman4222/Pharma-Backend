import { User } from "../models/userModel.js";
import { UserLedger } from "../models/userLedgerModel.js";
import { sendError, successResponse } from "../utils/response.js";

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
const createUser = async (req, res) => {
  try {
    const userData = req.body;

    const user = new User(userData);
    await user.save();

    if (userData.salary) {
      await UserLedger.create({
        user_id: user._id,
        salary: userData.salary,
        date: new Date(),
      });
    }

    successResponse(res, "User created", {user});
  } catch (error) {
    sendError(res, "Create User Error", error);
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
