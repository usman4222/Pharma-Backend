import express from "express";
import companyController from "../controllers/companyController.js";

const router = express.Router();

router.post("/", companyController.createCompany);
router.get("/", companyController.getAllCompanies);
router.get("/:id", companyController.getCompanyById);
router.put("/:id", companyController.updateCompany);
router.delete("/:id", companyController.deleteCompany);

export default router;
