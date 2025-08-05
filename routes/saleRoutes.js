import express from "express";
import saleController from "../controllers/saleController.js";

const router = express.Router();

// create sales 
router.post("/", saleController.createSale);
router.get("/", saleController.getAllSales);
router.get("/:customerId", saleController.getSalesByCustomer);
router.get("/product-sales/:productId", saleController.getProductSales);
router.delete("/:orderId", saleController.deleteSale);

export default router;
