import { OrderModel as Order } from "../models/orderModel.js";
import { OrderItemModel as OrderItem } from "../models/orderItemModel.js";
import { SupplierModel as Supplier } from "../models/supplierModel.js";
import { BatchModel as Batch } from "../models/batchModel.js";
import { ProductModel as Product } from "../models/productModel.js";
import { User } from "../models/userModel.js";
import { sendError, successResponse } from "../utils/response.js";
import mongoose from "mongoose";

const createSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      invoice_number,
      supplier_id,
      booker_id,
      subtotal,
      total,
      paid_amount,
      due_amount,
      net_value,
      due_date,
      items,
      type = "sale",
      status,
    } = req.body;

    const requiredFields = {
      invoice_number,
      supplier_id,
      booker_id,
      subtotal,
      total,
      paid_amount,
      due_amount,
      net_value,
      due_date,
      items,
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => value === undefined || value === null || value === '')
      .map(([key]) => key);

    if (missingFields.length > 0) {
      await session.abortTransaction();
      return sendError(res, `Missing required fields: ${missingFields.join(', ')}`, 400);
    }

    if (type !== "sale") {
      await session.abortTransaction();
      return sendError(res, "Invalid order type", 400);
    }

    const supplier = await Supplier.findById(supplier_id).session(session);
    if (!supplier) {
      await session.abortTransaction();
      return sendError(res, "Supplier (Customer) not found", 404);
    }

    const booker = await User.findById(booker_id).session(session);
    if (!booker) {
      await session.abortTransaction();
      return sendError(res, "Booker not found", 404);
    }

    // Validate product stock availability BEFORE creating the order
    for (const item of items) {
      const batchStock = await Batch.aggregate([
        {
          $match: { product_id: new mongoose.Types.ObjectId(item.product_id) }
        },
        {
          $group: {
            _id: "$product_id",
            totalStock: { $sum: "$stock" }
          }
        }
      ]);

      const availableStock = batchStock[0]?.totalStock || 0;
      if (item.units > availableStock) {
        await session.abortTransaction();
        return sendError(
          res,
          `Insufficient stock for product ${item.product_id}. Available: ${availableStock}, Requested: ${item.units}`,
          400
        );
      }
    }

    const batchNumber = `BATCH-${Date.now()}`;

    const newOrder = await Order.create(
      [
        {
          invoice_number,
          supplier_id,
          booker_id,
          subtotal,
          total,
          paid_amount,
          due_amount,
          net_value,
          due_date,
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

    const orderItems = [];
    const batchUpdates = [];

    for (const item of items) {
      const product = await Product.findById(item.product_id).session(session);
      if (!product) {
        await session.abortTransaction();
        return sendError(res, `Product not found: ${item.product_id}`, 404);
      }

      const orderItem = await OrderItem.create(
        [
          {
            order_id: newOrder[0]._id,
            product_id: item.product_id,
            batch: batchNumber,
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

      batchUpdates.push({
        updateOne: {
          filter: {
            product_id: item.product_id,
            batch_number: batchNumber,
          },
          update: {
            $setOnInsert: {
              product_id: item.product_id,
              batch_number: batchNumber,
              purchase_price: item.unit_price,
              expiry_date: item.expiry,
            },
            $inc: { stock: -item.units },
          },
          upsert: true,
        },
      });
    }

    if (batchUpdates.length) {
      await Batch.bulkWrite(batchUpdates, { session });
    }

    await Supplier.findByIdAndUpdate(
      supplier_id,
      { $inc: { receive: total } },
      { session }
    );

    await session.commitTransaction();

    return successResponse(
      res,
      "Sale order created successfully",
      {
        order: newOrder[0],
        items: orderItems,
        batchNumber,
      },
      201
    );
  } catch (error) {
    await session.abortTransaction();
    console.error("Sale error:", error);
    return sendError(res, error.message);
  } finally {
    session.endSession();
  }
};


// Get all sales by Customer ID
const getSalesByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Check if customer exists
    const customer = await Supplier.findById(customerId);
    if (!customer) {
      return sendError(res, "Customer not found", 404);
    }

    // Get sales with pagination
    const sales = await Order.find({ supplier_id: customerId, type: "sale" })
      .populate('supplier_id', 'owner1_name')
      .populate('booker_id', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const totalSales = await Order.countDocuments({ supplier_id: customerId, type: "sale" });
    const totalPages = Math.ceil(totalSales / limit);
    const hasMore = page < totalPages;

    return successResponse(res, "Sales fetched successfully", {
      sales,
      totalSales,
      currentPage: page,
      totalPages,
      totalItems: totalSales,
      pageSize: limit,
      hasMore
    });

  } catch (error) {
    console.error("Get sales by supplier error:", error);
    return sendError(res, "Failed to fetch sales by supplier");
  }
};


// Get all sales by type (sale)
const getAllSales = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get all sale orders with pagination
    const sales = await Order.find({ type: "sale" })
      .populate('supplier_id', 'owner1_name')
      .populate('booker_id', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const totalSales = await Order.countDocuments({ type: "sale" });
    const totalPages = Math.ceil(totalSales / limit);
    const hasMore = page < totalPages;

    return successResponse(res, "Sale orders fetched successfully", {
      sales,
      currentPage: page,
      totalPages,
      totalItems: totalSales,
      pageSize: limit,
      hasMore
    });

  } catch (error) {
    console.error("Get all sale orders error:", error);
    return sendError(res, "Failed to fetch sales orders");
  }
};


// Get all sales for a specific product
const getProductSales = async (req, res) => {
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
      'order_id.type': 'sale'
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
        $match: { 'order.type': 'sale' }
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
          productIn: { $sum: '$stock' } // For sales, product in = stock
        }
      }
    ]);

    const productOut = 0; // Would need sales data to calculate this
    const stockInfo = stockData.length > 0 ? stockData[0] : {
      totalStock: 0,
      productIn: 0
    };

    return successResponse(res, "Product sales fetched successfully", {
      sales: orderItems,
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
    console.error("Get sales by product error:", error);
    return sendError(res, "Failed to fetch product sales");
  }
};


const deleteSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId } = req.params;

    console.log("orderId",orderId)

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      await session.abortTransaction();
      return sendError(res, 'Invalid order ID', 400);
    }

    // Fetch the order
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return sendError(res, 'Order not found', 404);
    }

    if (order.type !== 'sale') {
      await session.abortTransaction();
      return sendError(res, 'Cannot delete: Not a sale order', 400);
    }

    // Fetch order items
    const orderItems = await OrderItem.find({ order_id: orderId }).session(session);

    // Revert stock to batches
    for (const item of orderItems) {
      await Batch.updateOne(
        { product_id: item.product_id, batch_number: item.batch },
        { $inc: { stock: item.units } }, // restore sold units
        { session }
      );
    }

    // Update customer balance (assuming 'receive' represents how much customer owes you)
    await Supplier.findByIdAndUpdate(
      order.supplier_id,
      { $inc: { receive: -order.total } },
      { session }
    );

    // Delete order items
    await OrderItem.deleteMany({ order_id: orderId }).session(session);

    // Delete the order
    await Order.findByIdAndDelete(orderId).session(session);

    await session.commitTransaction();
    return successResponse(res, 'Sale deleted successfully');
  } catch (error) {
    await session.abortTransaction();
    console.error('Delete Sale Error:', error);
    return sendError(res, error.message || 'Failed to delete sale');
  } finally {
    session.endSession();
  }
};


// Export all like you mentioned
const saleController = {
  createSale,
  getAllSales,
  getSalesByCustomer,
  getProductSales,
  deleteSale
};

export default saleController;
