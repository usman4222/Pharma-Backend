import express from "express";
import investorController from "../controllers/investorController.js";
import tokenValidation from "../middleware/tokenValidation.js";

const router = express.Router();

// ✅ Add new investor
router.post("/", investorController.addInvestor);

// ✅ Add new Investment 
router.put("/new-investment/:id", investorController.addInvestment);

// ✅ Get all investors with summary
router.get("/", investorController.getInvestors);

// ✅ Get single investor by ID
router.get("/:id", investorController.getInvestorById);

// ✅ Update investor
router.put("/:id", investorController.editInvestor);

// ✅ Add debit/credit transaction for investor
router.post("/:id/transaction", investorController.addDebitCredit);

// ❌ Delete investor (optional — uncomment if needed later)
// router.delete("/:id", tokenValidation, investorController.deleteInvestor);

export default router;
