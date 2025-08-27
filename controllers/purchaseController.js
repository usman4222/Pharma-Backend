import { OrderModel as Order } from "../models/orderModel.js";
import { OrderItemModel as OrderItem } from "../models/orderItemModel.js";
import { SupplierModel as Supplier, SupplierModel } from "../models/supplierModel.js";
import { BatchModel as Batch } from "../models/batchModel.js";
import { ProductModel as Product } from "../models/productModel.js";
import { User } from "../models/userModel.js";
import { sendError, successResponse } from "../utils/response.js";
import mongoose from "mongoose";
import adjustBalance from "../utils/adjustBalance.js";

// Create a new order
const createPurchase = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      const {
        invoice_number,
        supplier_id,
        subtotal,
        total,
        paid_amount,
        due_amount,
        net_value,
        items, // Array of order items
        type = "purchase",
        status,
      } = req.body;
  
      console.log("Received status:", req.body.status);
  
      // Validate ALL required fields
      const requiredFields = {
        invoice_number,
        supplier_id,
        subtotal,
        total,
        paid_amount,
        due_amount,
        net_value,
        items,
      };
  
      const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => value === undefined || value === null || value === "")
        .map(([key]) => key);
  
      if (missingFields.length > 0) {
        await session.abortTransaction();
        return sendError(
          res,
          `Missing required fields: ${missingFields.join(", ")}`,
          400
        );
      }
  
      // Validate type is purchase
      if (type !== "purchase") {
        await session.abortTransaction();
        return sendError(res, "Invalid order type", 400);
      }
  
      // helper to normalize balances
      function adjustPayReceive(currentPay, currentReceive, addPay = 0, addReceive = 0) {
        let pay = currentPay + addPay; // debit
        let receive = currentReceive + addReceive; // credit
  
        if (pay > receive) {
          pay = pay - receive;
          receive = 0;
        } else {
          receive = receive - pay;
          pay = 0;
        }
        return { pay, receive };
      }
  
      // 🔹 Get supplier
      const supplierDoc = await SupplierModel.findById(supplier_id).session(session);
      if (!supplierDoc) {
        await session.abortTransaction();
        return sendError(res, "Supplier not found", 404);
      }
  
      // 🔹 Adjust supplier balances
      const { pay, receive } = adjustPayReceive(
        supplierDoc.pay || 0,
        supplierDoc.receive || 0,
        total, // purchase adds debit (payable)
        0
      );
  
      await SupplierModel.findByIdAndUpdate(
        supplier_id,
        { pay, receive },
        { session }
      );
  
      // 🔹 Create new order
      const newOrder = await Order.create(
        [
          {
            invoice_number,
            supplier_id,
            subtotal,
            total,
            paid_amount,
            due_amount,
            net_value,
            type,
            status,
          },
        ],
        { session }
      );
  
      if (!newOrder?.length) {
        await session.abortTransaction();
        return sendError(res, "Failed to create order", 500);
      }
  
      // 🔹 Process order items and batches
      const orderItems = [];
      const batchUpdates = [];
  
      for (const item of items) {
        // Validate product exists
        const product = await Product.findById(item.product_id).session(session);
        if (!product) {
          await session.abortTransaction();
          return sendError(res, `Product not found: ${item.product_id}`, 404);
        }
  
        // Create order item
        const orderItem = await OrderItem.create(
          [
            {
              order_id: newOrder[0]._id,
              product_id: item.product_id,
              batch: item.batch,
              expiry: item.expiry,
              units: item.units,
              unit_price: item.unit_price,
              discount: item.discount || 0,
              total: item.total,
            },
          ],
          { session }
        );
  
        orderItems.push(orderItem[0]);
  
        // Create or update batch
        batchUpdates.push({
          updateOne: {
            filter: {
              product_id: item.product_id,
              batch_number: item.batch,
            },
            update: {
              $setOnInsert: {
                product_id: item.product_id,
                batch_number: item.batch,
                purchase_price: item.unit_price,
                expiry_date: item.expiry,
              },
              $inc: { stock: item.units },
            },
            upsert: true,
          },
        });
      }
  
      // Bulk update batches
      if (batchUpdates.length) {
        await Batch.bulkWrite(batchUpdates, { session });
      }
  
      // ✅ removed duplicate supplier pay update
  
      await session.commitTransaction();
  
      return successResponse(
        res,
        "Purchase order created successfully",
        {
          order: newOrder[0],
          items: orderItems,
        },
        201
      );
    } catch (error) {
      await session.abortTransaction();
      console.error("Purchase error:", error);
      return sendError(res, error.message);
    } finally {
      session.endSession();
    }
  };
  

// Get all purchases by supplier ID
const getPurchasesBySupplier = async (req, res) => {
    try {
        const { supplierId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Check if supplier exists
        const supplier = await Supplier.findById(supplierId);
        if (!supplier) {
            return sendError(res, "Supplier not found", 404);
        }

        // Get purchases with pagination
        const purchases = await Order.find({ supplier_id: supplierId, type: "purchase" })
            .populate('supplier_id', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalPurchases = await Order.countDocuments({ supplier_id: supplierId, type: "purchase" });
        const totalPages = Math.ceil(totalPurchases / limit);
        const hasMore = page < totalPages;

        return successResponse(res, "Purchases fetched successfully", {
            purchases,
            currentPage: page,
            totalPages,
            totalItems: totalPurchases,
            pageSize: limit,
            hasMore
        });

    } catch (error) {
        console.error("Get purchases by supplier error:", error);
        return sendError(res, "Failed to fetch purchases by supplier");
    }
};

// Get all purchases by type (purchase)
const getAllPurchases = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Get all purchase orders with pagination
        const purchases = await Order.find({ type: "purchase" })
            .populate('supplier_id', 'company_name role')
            // .populate('booker_id', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalPurchases = await Order.countDocuments({ type: "purchase" });
        const totalPages = Math.ceil(totalPurchases / limit);
        const hasMore = page < totalPages;

        return successResponse(res, "Purchase orders fetched successfully", {
            purchases,
            currentPage: page,
            totalPages,
            totalItems: totalPurchases,
            pageSize: limit,
            hasMore
        });

    } catch (error) {
        console.error("Get all purchase orders error:", error);
        return sendError(res, "Failed to fetch purchase orders");
    }
};


// Get all purchases for a specific product
const getProductPurchases = async (req, res) => {
    try {
        const { productId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Check if product exists and get product prices
        const product = await Product.findById(productId)
            .select('name item_code retail_price trade_price');
        if (!product) {
            return sendError(res, "Product not found", 404);
        }

        // First get count for pagination
        const totalOrderItems = await OrderItem.countDocuments({
            product_id: productId,
            'order_id.type': 'purchase'
        }).populate('order_id');

        const totalPages = Math.ceil(totalOrderItems / limit);
        const hasMore = page < totalPages;

        // Get order items with necessary data in one optimized query
        const orderItems = await OrderItem.aggregate([
            {
                $match: { product_id: new mongoose.Types.ObjectId(productId) }
            },
            {
                $lookup: {
                    from: 'orders',
                    localField: 'order_id',
                    foreignField: '_id',
                    as: 'order'
                }
            },
            { $unwind: '$order' },
            {
                $match: { 'order.type': 'purchase' }
            },
            {
                $lookup: {
                    from: 'suppliers',
                    localField: 'order.supplier_id',
                    foreignField: '_id',
                    as: 'supplier'
                }
            },
            { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    date: '$order.createdAt',
                    invoice_number: '$order.invoice_number',
                    type: '$order.type',
                    supplier: '$supplier.name',
                    batch: '$batch',
                    expiry: '$expiry',
                    units: '$units',
                    unit_price: '$unit_price',
                    discount: '$discount',
                    total: '$total',
                    retail_price: product.retail_price,
                    trade_price: product.trade_price
                }
            },
            { $skip: skip },
            { $limit: limit },
            { $sort: { date: -1 } }
        ]);

        // Calculate product in/out and total stock
        const stockData = await Batch.aggregate([
            {
                $match: { product_id: new mongoose.Types.ObjectId(productId) }
            },
            {
                $group: {
                    _id: null,
                    totalStock: { $sum: '$stock' },
                    productIn: { $sum: '$stock' } // For purchases, product in = stock
                }
            }
        ]);

        const productOut = 0; // Would need sales data to calculate this
        const stockInfo = stockData.length > 0 ? stockData[0] : {
            totalStock: 0,
            productIn: 0
        };

        return successResponse(res, "Product purchases fetched successfully", {
            purchases: orderItems,
            stockInfo: {
                productIn: stockInfo.productIn,
                productOut,
                totalStock: stockInfo.totalStock
            },
            product: {
                _id: product._id,
                name: product.name,
                item_code: product.item_code,
                retail_price: product.retail_price,
                trade_price: product.trade_price
            },
            currentPage: page,
            totalPages,
            totalItems: totalOrderItems,
            pageSize: limit,
            hasMore
        });

    } catch (error) {
        console.error("Get purchases by product error:", error);
        return sendError(res, "Failed to fetch product purchases");
    }
};


const deletePurchase = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      const { orderId } = req.params;
  
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        await session.abortTransaction();
        return sendError(res, "Invalid order ID", 400);
      }
  
      const order = await Order.findById(orderId).session(session);
      if (!order) {
        await session.abortTransaction();
        return sendError(res, "Order not found", 404);
      }
  
      if (order.type !== "purchase") {
        await session.abortTransaction();
        return sendError(res, "Cannot delete: Not a purchase order", 400);
      }
  
      // Restore stock (reverse purchase)
      const orderItems = await OrderItem.find({ order_id: orderId }).session(session);
      for (const item of orderItems) {
        const batchUpdate = await Batch.findOneAndUpdate(
          { product_id: item.product_id, batch_number: item.batch },
          { $inc: { stock: -item.units } },
          { session, new: true }
        );
  
        if (batchUpdate && batchUpdate.stock <= 0) {
          await Batch.deleteOne({ _id: batchUpdate._id }, { session });
        }
      }
  
      // Restore supplier balance
      const supplier = await Supplier.findById(order.supplier_id).session(session);
      const { pay, receive } = adjustBalance(supplier, order.total, order.type, true);
      await Supplier.findByIdAndUpdate(order.supplier_id, { pay, receive }, { session });
  
      // Delete order + items
      await OrderItem.deleteMany({ order_id: orderId }).session(session);
      await Order.findByIdAndDelete(orderId).session(session);
  
      await session.commitTransaction();
      return successResponse(res, "Purchase deleted successfully");
    } catch (error) {
      await session.abortTransaction();
      console.error("Delete Purchase Error:", error);
      return sendError(res, error.message);
    } finally {
      session.endSession();
    }
  };

const purchaseController = {
    createPurchase,
    getPurchasesBySupplier,
    getAllPurchases,
    getProductPurchases,
    deletePurchase
};


export default purchaseController;