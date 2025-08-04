import express from "express";
import purchaseController from "../controllers/purchaseController.js";

const router = express.Router();

// 📥 Get all purchase orders (with pagination and status filter) 
router.post("/", purchaseController.createPurchase);
router.get("/:supplierId", purchaseController.getPurchasesBySupplier); 
router.get("/", purchaseController.getAllPurchases);
router.get("/product-purchases/:productId", purchaseController.getProductPurchases);

export default router;
