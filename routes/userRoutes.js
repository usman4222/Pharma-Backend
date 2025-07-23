import express from "express";
import userController from "../controllers/userController.js";
import userLedgerController from "../controllers/userLedgerController.js";

const router = express.Router();

// USERS
router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUserById);
router.post("/", userController.createUser);
router.put("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);
router.patch("/toggle-status", userController.toggleUserStatus);

// LEDGER
router.get("/:id/ledger", userController.getUserLedger); // get user ledger
router.post("/update-ledger", userLedgerController.updateUserLedger); // update ledger entry

export default router;
