import express from "express";
import saleController from "../controllers/saleController.js";

const router = express.Router();

// Get all sales
router.get("/", saleController.getAllSales);

// Get the latest sale
router.get("/last", saleController.getLastSale);

// Print a specific sale by ID
router.get("/:id", saleController.printSale);

// Create a new sale
router.post("/", saleController.createSale);

export default router;
