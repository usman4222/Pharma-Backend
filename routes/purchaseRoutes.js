import express from "express";
import purchaseController from "../controllers/purchaseController.js";

const router = express.Router();

// 📥 Get all purchase orders (with pagination and status filter)
router.get("/", purchaseController.getAllPurchases);

// 📄 Print a specific purchase by ID
router.get("/print/:id", purchaseController.printPurchase);

// 🔍 Get the last purchase by product, supplier, and batch
router.post("/last", purchaseController.getLastPurchase);

// ➕ Create a new purchase
router.post("/", purchaseController.createPurchase);

export default router;
