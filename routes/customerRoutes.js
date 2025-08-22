import express from "express";
import customerController from "../controllers/customerController.js";
import { createUploader } from "../utils/upload.js";
import { SupplierModel } from "../models/supplierModel.js";

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

// routes/customers.js
router.get('/:id/credit-alerts', async (req, res) => {
    try {
        const customer = await SupplierModel.findById(req.params.id)
            .select('credit_alerts credit_limit credit_period current_credit_used');

        res.json({
            alerts: customer.credit_alerts.filter(alert => !alert.resolved),
            credit_limit: customer.credit_limit,
            credit_used: customer.current_credit_used,
            available_credit: customer.credit_limit - customer.current_credit_used
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch credit alerts" });
    }
});

// Get all customers with active alerts
router.get('/credit-alerts/active', async (req, res) => {
    try {
        const customers = await SupplierModel.find({
            'credit_alerts.0': { $exists: true },
            'credit_alerts.resolved': false
        }).select('company_name credit_alerts credit_limit current_credit_used');

        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch active alerts" });
    }
});

export default router;
