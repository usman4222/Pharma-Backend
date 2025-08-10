import express from "express";
import estimatedSaleController from "../controllers/estimatedSaleController.js";

const router = express.Router();

// create estimated sales 
router.post("/", estimatedSaleController.createEstimatedSale);
router.get("/", estimatedSaleController.getAllEstimatedSales);
router.delete("/:orderId", estimatedSaleController.deleteEstimatedSale);

export default router;
