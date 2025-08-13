import express from "express";
import customerController from "../controllers/customerController.js";
import { createUploader } from "../utils/upload.js";

const router = express.Router();

// Create uploader for "customers" folder
const uploadCustomers = createUploader("customers");

router.get("/", customerController.getAllCustomers);
router.get("/list", customerController.getCustomerList);
router.get("/:id/edit", customerController.editCustomer);
router.get("/:id", customerController.showCustomer);
router.post(
    "/",
    uploadCustomers.single("licence_photo"),
    customerController.createCustomer
);
router.put("/:id", customerController.updateCustomer);
router.delete("/:id", customerController.deleteCustomer);
router.patch("/toggle-status", customerController.toggleCustomerStatus);
router.get("/search/list", customerController.searchCustomers);

export default router;
