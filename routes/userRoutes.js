import express from "express";
import userController from "../controllers/userController.js";
import { createUploader } from "../utils/upload.js";

const router = express.Router();

// Create uploader for "users" folder
const uploadUsers = createUploader("users");

router.get("/bookers", userController.getAllBookers);
router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUserById);
router.post(
    "/",
    uploadUsers.fields([
        { name: "profile_photo", maxCount: 1 },
        { name: "cnic_front", maxCount: 1 },
        { name: "cnic_back", maxCount: 1 },
        { name: "cheque_photo", maxCount: 1 },
        { name: "e_stamp", maxCount: 1 }
    ]),
    userController.createUser
);

router.put("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);
router.patch("/toggle-status", userController.toggleUserStatus);

export default router;
