import express from "express";
import supplierController from "../controllers/supplierController.js";

const router = express.Router();

router.get("/", supplierController.getAllSuppliers);
router.get("/search", supplierController.searchSuppliers);
router.get("/:id", supplierController.getSupplierById);
router.post("/", supplierController.createSupplier);
router.put("/:id", supplierController.updateSupplier);
router.delete("/:id", supplierController.deleteSupplier);
router.patch("/status", supplierController.toggleSupplierStatus); 

export default router;
