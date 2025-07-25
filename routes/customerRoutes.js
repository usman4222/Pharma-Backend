import express from "express";
import customerController from "../controllers/customerController.js";

const router = express.Router();

router.get("/", customerController.getAllCustomers);
router.get("/list", customerController.getCustomerList);
router.get("/:id/edit", customerController.editCustomer);
router.get("/:id", customerController.showCustomer);
router.post("/", customerController.createCustomer);
router.put("/:id", customerController.updateCustomer);
router.delete("/:id", customerController.deleteCustomer);
router.patch("/toggle-status", customerController.toggleCustomerStatus);
router.get("/search/list", customerController.searchCustomers);

export default router;
