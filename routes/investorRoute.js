import express from "express";
import investorController from "../controllers/investorController.js";
import tokenValidation from "../middleware/tokenValidation.js";

const router = express.Router();

// Add new investor
router.post("/", investorController.addInvestor);

// Get all investors with summary
router.get("/", investorController.getInvestors);

// Get single investor by ID
// router.get("/:id", investorController.getInvestorById);

// Update investor
router.put("/:id", investorController.editInvestor);

// Delete investor
// router.delete("/:id", investorController.deleteInvestor);

export default router;
