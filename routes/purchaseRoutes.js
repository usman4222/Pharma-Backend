import express from "express";
import purchaseController from "../controllers/purchaseController.js";

const router = express.Router();

// 📥 Create purchase
router.post("/", purchaseController.createPurchase);

// 📥 Return purchase by invoice
router.post("/return", purchaseController.returnPurchaseByInvoice);

// 📤 Get purchases by supplier
router.get("/supplier/:supplierId", purchaseController.getPurchasesBySupplier);

// 📤 Get all purchases
router.get("/", purchaseController.getAllPurchases);

// 📤 Get purchase for return (by invoice_number or supplier_id)
router.get("/return/search", purchaseController.getPurchaseForReturn);

// 📤 Get product purchase history
router.get("/product-purchases/:productId", purchaseController.getProductPurchases);

// ❌ Delete purchase
router.delete("/:orderId", purchaseController.deletePurchase);

export default router;
