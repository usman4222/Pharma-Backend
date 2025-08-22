import express from "express";
import supplierController from "../controllers/supplierController.js";
import { createUploader } from "../utils/upload.js";

const router = express.Router();

// Create uploader for "suppliers" folder
const uploadSuppliers = createUploader("suppliers");

router.get("/", supplierController.getAllSuppliers);
router.get("/search", supplierController.searchSuppliers);
router.get("/:id", supplierController.getSupplierById);
router.post(
    "/",
    uploadSuppliers.single("licence_photo"),
    supplierController.createSupplier
);
router.put("/:id", supplierController.updateSupplier);
router.delete("/:id", supplierController.deleteSupplier);
router.patch("/toggle-status", supplierController.toggleSupplierStatus);
router.patch("/status", supplierController.toggleSupplierStatus);

export default router;
