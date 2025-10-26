import express from "express";
import purchaseController from "../controllers/purchaseController.js";

const router = express.Router();

// 📥 Create purchase
router.post("/", purchaseController.createPurchase);

// 📥 Complete a skipped purchase (status -> completed)
router.patch("/:orderId/complete", purchaseController.completePurchase); 

// 📥 Return purchase by invoice
router.post("/return", purchaseController.returnPurchaseByInvoice);

// 📤 Get purchases by supplier
router.get("/supplier/:supplierId", purchaseController.getPurchasesBySupplier);

// 📤 Get all purchases
router.get("/", purchaseController.getAllPurchases); 

router.get("/transactions/last", purchaseController.getLastTransactionByProduct);

// 📤 Get purchase for return (by invoice_number or supplier_id)
router.get("/return/search", purchaseController.getPurchaseForReturn);

//return purchase
router.get("/purchase-return", purchaseController.getAllPurchaseReturns);

// 📤 Get product purchase history
router.get("/product-purchases/:productId", purchaseController.getProductPurchases);

// get purchase
router.get("/:orderId", purchaseController.getPurchaseById);

// get purchase
router.put("/:orderId", purchaseController.editPurchase);

// ❌ Delete purchase
router.delete("/:orderId", purchaseController.deletePurchase);

export default router;
