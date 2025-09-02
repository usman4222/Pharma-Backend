import { OrderModel as Order } from "../models/orderModel.js";
import { OrderItemModel as OrderItem, OrderItemModel } from "../models/orderItemModel.js";
import { SupplierModel as Supplier } from "../models/supplierModel.js";
import { BatchModel as Batch } from "../models/batchModel.js";
import { ProductModel as Product } from "../models/productModel.js";
import { User } from "../models/userModel.js";
import { sendError, successResponse } from "../utils/response.js";
import mongoose from "mongoose";
import adjustBalance from "../utils/adjustBalance.js";

const createSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      invoice_number,
      supplier_id,   // customer
      booker_id,
      subtotal,
      total,
      paid_amount,
      due_amount,
      net_value,
      due_date,
      note,
      items,
      type = "sale",
      status,
    } = req.body;

    // 1. Validate required fields
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
      return sendError(res, `Missing required fields: ${missingFields.join(", ")}`, 400);
    }

    // 2. Validate batch numbers
    for (const item of items) {
      if (!item.batch || item.batch.trim() === "") {
        await session.abortTransaction();
        return sendError(res, `Batch number is required for all items`, 400);
      }
    }

    if (type !== "sale") {
      await session.abortTransaction();
      return sendError(res, "Invalid order type", 400);
    }

    // 3. Validate supplier (customer) exists
    const supplierDoc = await Supplier.findById(supplier_id).session(session);
    if (!supplierDoc) {
      await session.abortTransaction();
      return sendError(res, "Supplier (Customer) not found", 404);
    }

    // 4. Validate booker
    if (booker_id) {
      const booker = await User.findById(booker_id).session(session);
      if (!booker) {
        await session.abortTransaction();
        return sendError(res, "Booker not found", 404);
      }
    }

    // 5. Validate product stock
    for (const item of items) {
      const batch = await Batch.findOne({
        product_id: item.product_id,
        batch_number: item.batch,
      }).session(session);

      if (!batch) {
        await session.abortTransaction();
        return sendError(
          res,
          `Batch ${item.batch} not found for product ${item.product_id}`,
          404
        );
      }

      if (item.units > batch.stock) {
        await session.abortTransaction();
        return sendError(
          res,
          `Insufficient stock in batch ${item.batch}. Available: ${batch.stock}`,
          400
        );
      }
    }

    // 6. Create order
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
          note,
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

    // 7. Order items + batch updates
    const orderItems = [];
    const batchUpdates = [];

    for (const item of items) {
      const product = await Product.findById(item.product_id).session(session);
      if (!product) {
        await session.abortTransaction();
        return sendError(res, `Product not found: ${item.product_id}`, 404);
      }
      // 🔹 Parse expiry "MM/YYYY" → Date
      let expiryDate = null;
      if (item.expiry) {
        const [month, year] = item.expiry.split("/"); // "12/2025"
        expiryDate = new Date(`${year}-${month.padStart(2, "0")}-01`); // "2025-12-01"
      }

      const orderItem = await OrderItem.create(
        [
          {
            order_id: newOrder[0]._id,
            product_id: item.product_id,
            batch: item.batch,
            expiry: expiryDate,
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
            batch_number: item.batch,
          },
          update: { $inc: { stock: -item.units } },
        },
      });
    }

    if (batchUpdates.length) {
      await Batch.bulkWrite(batchUpdates, { session });
    }

    // 8. Adjust balances (sale increases receive)
    function adjustPayReceive(currentPay, currentReceive, addPay = 0, addReceive = 0) {
      let pay = currentPay + addPay;
      let receive = currentReceive + addReceive;

      if (pay > receive) {
        pay = pay - receive;
        receive = 0;
      } else {
        receive = receive - pay;
        pay = 0;
      }

      return { pay, receive };
    }

    // 🔹 Calculate actual due = total - paid_amount
    const actualDue = total - paid_amount;

    const { pay, receive } = adjustPayReceive(
      supplierDoc.pay || 0,
      supplierDoc.receive || 0,
      actualDue,  // use net due here
      0
    );

    await Supplier.findByIdAndUpdate(
      supplier_id,
      { pay, receive },
      { session }
    );

    await session.commitTransaction();

    return successResponse(
      res,
      "Sale order created successfully",
      { order: newOrder[0], items: orderItems },
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
      .populate('supplier_id', 'company_name role')
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

// Controller: get sale for return
const getSaleForReturn = async (req, res) => {
  try {
    const { invoice_number, customer_id } = req.query;

    // 🔹 Validate: must have at least one
    if (!invoice_number && !customer_id) {
      return sendError(res, "Provide either invoice number or customer", 400);
    }

    const filter = { type: "sale" };
    if (invoice_number) filter.invoice_number = invoice_number;
    if (customer_id) filter.supplier_id = customer_id; // assuming supplier_id stores customer

    let sales;

    if (invoice_number) {
      sales = await Order.findOne(filter)
        .populate("supplier_id") // attach customer info
        .populate("booker_id")   // attach booker info if needed
        .lean();

      if (!sales) {
        return sendError(res, "Sale order not found", 404);
      }

      // attach items with product info
      sales.items = await OrderItemModel.find({ order_id: sales._id })
        .populate("product_id")
        .lean();

    } else {
      sales = await Order.find(filter)
        .populate("supplier_id")
        .populate("booker_id")
        .lean();

      if (!sales || sales.length === 0) {
        return sendError(res, "No sales found for this customer", 404);
      }

      for (let order of sales) {
        order.items = await OrderItemModel.find({ order_id: order._id })
          .populate("product_id")
          .lean();
      }
    }

    return successResponse(res, "Sale order retrieved", { sales });
  } catch (error) {
    console.error("Get sale error:", error);
    return sendError(res, "Failed to fetch sale order");
  }
};


const returnSaleByInvoice = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { invoice_number, items } = req.body;

    if (!invoice_number || !items?.length) {
      await session.abortTransaction();
      return sendError(res, "Invoice number and items are required", 400);
    }

    // Fetch original sale order
    const saleOrder = await Order.findOne({ invoice_number, type: "sale" }).session(session);
    if (!saleOrder) {
      await session.abortTransaction();
      return sendError(res, "Sale order not found", 404);
    }

    // Fetch customer
    const customer = await Supplier.findById(saleOrder.supplier_id).session(session);
    if (!customer) {
      await session.abortTransaction();
      return sendError(res, "Customer not found", 404);
    }

    let totalReturn = 0;
    const orderItemsMap = {};

    // Validate items and calculate total return
    for (const item of items) {
      const orderItem = await OrderItem.findOne({
        order_id: saleOrder._id,
        product_id: item.product_id,
        batch: item.batch,
      }).session(session);

      if (!orderItem) {
        await session.abortTransaction();
        return sendError(res, `Order item not found for batch: ${item.batch}`, 404);
      }

      if (orderItem.units < item.units) {
        await session.abortTransaction();
        return sendError(res, `Return quantity exceeds sold units for batch: ${item.batch}`, 400);
      }

      // Calculate total for returned units proportionally
      const unitTotal = orderItem.total / orderItem.units;
      const returnTotal = unitTotal * item.units;
      totalReturn += returnTotal;

      orderItemsMap[item.batch] = { orderItem, returnTotal };
    }

    // Deduct from customer's pay
    await Supplier.findByIdAndUpdate(
      customer._id,
      { pay: Math.max((customer.pay || 0) - totalReturn, 0) },
      { session }
    );

    // Create return sale order
    const returnOrder = await Order.create([{
      invoice_number: invoice_number + "-R",
      supplier_id: customer._id,
      booker_id: saleOrder.booker_id || null,
      subtotal: totalReturn,
      total: totalReturn,
      paid_amount: 0,
      due_amount: totalReturn,
      net_value: totalReturn,
      type: "sale_return",
      status: "returned",
    }], { session });

    const returnItems = [];
    const batchUpdates = [];

    // Process each return item
    for (const item of items) {
      const { orderItem, returnTotal } = orderItemsMap[item.batch];

      // Deduct units from original order item
      orderItem.units -= item.units;
      await orderItem.save({ session });

      // Create return order item
      const returnOrderItem = await OrderItem.create([{
        order_id: returnOrder[0]._id,
        product_id: item.product_id,
        batch: item.batch,
        expiry: item.expiry,
        units: item.units,
        unit_price: item.unit_price,
        discount: item.discount || 0,
        total: returnTotal,
      }], { session });

      returnItems.push(returnOrderItem[0]);

      // Update batch stock
      batchUpdates.push({
        updateOne: {
          filter: { product_id: item.product_id, batch_number: item.batch },
          update: { $inc: { stock: item.units } },
        },
      });
    }

    if (batchUpdates.length) await Batch.bulkWrite(batchUpdates, { session });

    await session.commitTransaction();

    return successResponse(res, "Sale returned successfully", {
      returnOrder: returnOrder[0],
      items: returnItems,
    }, 200);

  } catch (error) {
    await session.abortTransaction();
    console.error("Return sale error:", error);
    return sendError(res, "Failed to return sale order");
  } finally {
    session.endSession();
  }
};


// Get sale by ID
const getSaleById = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return sendError(res, "Invalid order ID", 400);
    }

    // Fetch the sale order
    const saleOrder = await Order.findById(orderId)
      .populate("supplier_id", "company_name owner1_name role") // attach customer info
      .populate("booker_id", "name") // attach booker info
      .lean();

    if (!saleOrder) {
      return sendError(res, "Sale order not found", 404);
    }

    if (saleOrder.type !== "sale" && saleOrder.type !== "sale_return") {
      return sendError(res, "Not a sale order", 400);
    }

    // Fetch order items with product info
    const items = await OrderItemModel.find({ order_id: orderId })
      .populate("product_id", "name item_code retail_price trade_price")
      .lean();

    saleOrder.items = items;

    return successResponse(res, "Sale order retrieved successfully", { saleOrder });
  } catch (error) {
    console.error("Get sale by ID error:", error);
    return sendError(res, "Failed to fetch sale order");
  }
};



const deleteSale = async (req, res) => {
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

    if (order.type !== "sale") {
      await session.abortTransaction();
      return sendError(res, "Cannot delete: Not a sale order", 400);
    }

    // Restore stock (reverse sale)
    const orderItems = await OrderItem.find({ order_id: orderId }).session(session);
    for (const item of orderItems) {
      await Batch.updateOne(
        { product_id: item.product_id, batch_number: item.batch },
        { $inc: { stock: item.units } },
        { session }
      );
    }

    // Restore customer balance
    const supplier = await Supplier.findById(order.supplier_id).session(session);
    const { pay, receive } = adjustBalance(supplier, order.total, order.type, true);
    await Supplier.findByIdAndUpdate(order.supplier_id, { pay, receive }, { session });

    // Delete order + items
    await OrderItem.deleteMany({ order_id: orderId }).session(session);
    await Order.findByIdAndDelete(orderId).session(session);

    await session.commitTransaction();
    return successResponse(res, "Sale deleted successfully");
  } catch (error) {
    await session.abortTransaction();
    console.error("Delete Sale Error:", error);
    return sendError(res, error.message || "Failed to delete sale");
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
  getSaleForReturn,
  returnSaleByInvoice,
  getSaleById,
  deleteSale
};

export default saleController;
