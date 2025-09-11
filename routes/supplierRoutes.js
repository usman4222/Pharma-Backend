import express from "express";
import supplierController from "../controllers/supplierController.js";
import { createUploader } from "../utils/upload.js";

const router = express.Router();

// Create uploader for "suppliers" folder
const uploadSuppliers = createUploader("suppliers");

router.get("/", supplierController.getAllSuppliers);
router.get("/active", supplierController.getAllActiveSuppliers);
router.get("/search", supplierController.searchSuppliers);
router.put("/balance", supplierController.addSupplierBalance);
router.get("/:id", supplierController.getSupplierById);
router.post("/", supplierController.createSupplier);
router.put("/:id", supplierController.updateSupplier);
router.delete("/:id", supplierController.deleteSupplier); 
router.patch("/toggle-status", supplierController.toggleSupplierStatus);
router.patch("/status", supplierController.toggleSupplierStatus);

export default router;
