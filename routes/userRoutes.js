import express from "express";
import userController from "../controllers/userController.js";

const router = express.Router();

// USERS
router.get("/bookers", userController.getAllBookers);
router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUserById);
router.post("/", userController.createUser);
router.put("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);
router.patch("/toggle-status", userController.toggleUserStatus);

export default router;
