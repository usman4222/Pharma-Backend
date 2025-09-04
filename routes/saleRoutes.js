import express from "express";
import saleController from "../controllers/saleController.js";

const router = express.Router();

// create sales 
router.post("/", saleController.createSale);
router.get("/", saleController.getAllSales);
router.get("/product-sales/:productId", saleController.getProductSales);
router.delete("/:orderId", saleController.deleteSale);
router.get("/return/search", saleController.getSaleForReturn);
router.post("/return", saleController.returnSaleByInvoice); 
router.get("/sale-return", saleController.getAllSaleReturns);
router.get("/booker-sales/:bookerId", saleController.getBookerSales);
router.get("/get-sale/:orderId", saleController.getSaleById);
router.get("/:customerId", saleController.getSalesByCustomer);

export default router;
