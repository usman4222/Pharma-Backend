import { OrderModel as Order } from "../models/orderModel.js";
import { OrderItemModel as OrderItem, OrderItemModel } from "../models/orderItemModel.js";
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
      due_date,
      note,
      items, // Array of order items
      type = "purchase",
      status,
    } = req.body;

    // Validate required fields
    const requiredFields = {
      invoice_number,
      supplier_id,
      subtotal,
      total,
      paid_amount,
      net_value,
      items,
    };

    const missingFields = Object.entries(requiredFields)
      .filter(
        ([_, value]) =>
          value === undefined ||
          value === null ||
          value === "" ||
          (Array.isArray(value) && value.length === 0)
      )
      .map(([key]) => key);

    if (missingFields.length > 0) {
      await session.abortTransaction();
      return sendError(
        res,
        `Missing required fields: ${missingFields.join(", ")}`,
        400
      );
    }

    if (type !== "purchase") {
      await session.abortTransaction();
      return sendError(res, "Invalid order type", 400);
    }

    // 🔹 Get supplier
    const supplierDoc = await SupplierModel.findById(supplier_id).session(
      session
    );
    if (!supplierDoc) {
      await session.abortTransaction();
      return sendError(res, "Supplier not found", 404);
    }

    // 🔹 Adjust supplier balance
    const updatedPay = supplierDoc.pay || 0;
    const updatedReceive = (supplierDoc.receive || 0) + (total - paid_amount);

    await SupplierModel.findByIdAndUpdate(
      supplier_id,
      { pay: updatedPay, receive: updatedReceive },
      { session }
    );

    // 🔹 Create new order (⚡ FIX: wrap in array)
    const [newOrder] = await Order.create(
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
          note,
          due_date,
        },
      ],
      { session }
    );

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

      // 🔹 Handle expiry as plain string
      let expiryValue = null;
      if (item.expiry) {
        expiryValue = item.expiry; // keep string as-is ("MM/YY" or "MM/YYYY")
      }


      // 🔹 Create order item
      const [orderItem] = await OrderItem.create(
        [
          {
            order_id: newOrder._id,
            product_id: item.product_id,
            batch: item.batch,
            expiry: expiryValue,
            units: item.units,
            unit_price: item.unit_price,
            discount: item.discount || 0,
            total: item.total,
          },
        ],
        { session }
      );

      orderItems.push(orderItem);

      // 🔹 Prepare batch update
      batchUpdates.push({
        updateOne: {
          filter: { product_id: item.product_id, batch_number: item.batch },
          update: {
            $setOnInsert: {
              product_id: item.product_id,
              batch_number: item.batch,
              purchase_price: item.unit_price, // original unit price before discount
              expiry_date: expiryValue,
            },
            $set: {
              unit_cost: item.total / item.units, //  final cost per unit after discount
              discount_per_unit: item.units > 0 ? (item.discount || 0) / item.units : 0,
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

    await session.commitTransaction();

    return successResponse(
      res,
      "Purchase order created successfully",
      { order: newOrder, items: orderItems },
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

const getAllPurchases = async (req, res) => {
  try {
    // Fetch purchases with supplier populated
    const purchases = await Order.find({ type: "purchase" })
      .populate("supplier_id", "company_name role") // supplier info
      .sort({ createdAt: -1 })
      .lean();

    // Fetch OrderItems and attach product details
    const purchaseIds = purchases.map((order) => order._id);
    const orderItems = await OrderItem.find({ order_id: { $in: purchaseIds } })
      .populate("product_id", "name category unit")
      .lean();

    const purchasesWithItems = purchases.map((order) => {
      const items = orderItems.filter(
        (item) => item.order_id.toString() === order._id.toString()
      );
      return { ...order, items };
    });

    // Calculate totals for today, weekly, monthly, yearly
    const now = new Date();
    let todayTotal = 0,
      weeklyTotal = 0,
      monthlyTotal = 0,
      yearlyTotal = 0;

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    purchases.forEach((p) => {
      const date = new Date(p.createdAt);
      const total = p.total || 0;

      // Today
      if (date.toDateString() === now.toDateString()) todayTotal += total;

      // Weekly
      if (date >= weekStart && date <= weekEnd) weeklyTotal += total;

      // Monthly
      if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth())
        monthlyTotal += total;

      // Yearly
      if (date.getFullYear() === now.getFullYear()) yearlyTotal += total;
    });

    return successResponse(res, "Purchase orders fetched successfully", {
      purchases: purchasesWithItems, // ✅ return all purchases (no limit)
      totals: {
        today: todayTotal,
        weekly: weeklyTotal,
        monthly: monthlyTotal,
        yearly: yearlyTotal,
      },
      totalItems: purchases.length,
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

const getPurchaseForReturn = async (req, res) => {
  try {
    const { invoice_number, supplier_id } = req.query;

    // 🔹 Validate: must have at least one of them
    if (!invoice_number && !supplier_id) {
      return sendError(res, "Provide either invoice number or supplier", 400);
    }

    const filter = { type: "purchase" };
    if (invoice_number) filter.invoice_number = invoice_number;
    if (supplier_id) filter.supplier_id = supplier_id;

    let purchases;

    if (invoice_number) {
      purchases = await Order.findOne(filter)
        .populate("supplier_id") // ✅ attach supplier info
        .lean();

      if (!purchases) {
        return sendError(res, "Purchase order not found", 404);
      }

      // attach items + product info
      purchases.items = await OrderItemModel.find({ order_id: purchases._id })
        .populate("product_id")
        .lean();

    } else {
      purchases = await Order.find(filter)
        .populate("supplier_id") // ✅ attach supplier info
        .lean();

      if (!purchases || purchases.length === 0) {
        return sendError(res, "No purchases found for this supplier", 404);
      }

      for (let order of purchases) {
        order.items = await OrderItemModel.find({ order_id: order._id })
          .populate("product_id")
          .lean();
      }
    }

    return successResponse(res, "Purchase order retrieved", { purchases });
  } catch (error) {
    console.error("Get purchase error:", error);
    return sendError(res, "Failed to fetch product purchases");
  }
};


const returnPurchaseByInvoice = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { invoice_number, items } = req.body;

    if (!invoice_number || !items || items.length === 0) {
      await session.abortTransaction();
      return sendError(res, "Invoice number and items are required", 400);
    }

    // Fetch original purchase order
    const purchaseOrder = await Order.findOne({ invoice_number, type: "purchase" }).session(session);
    if (!purchaseOrder) {
      await session.abortTransaction();
      return sendError(res, "Purchase order not found", 404);
    }

    const supplierDoc = await SupplierModel.findById(purchaseOrder.supplier_id).session(session);
    if (!supplierDoc) {
      await session.abortTransaction();
      return sendError(res, "Supplier not found", 404);
    }

    // Calculate total return amount based on actual total from OrderItem
    let totalReturn = 0;
    const orderItemsMap = {};

    for (const item of items) {
      const orderItem = await OrderItem.findOne({
        order_id: purchaseOrder._id,
        product_id: item.product_id,
        batch: item.batch,
      }).session(session);

      if (!orderItem) {
        await session.abortTransaction();
        return sendError(res, `Order item not found for batch: ${item.batch}`, 404);
      }

      if (orderItem.units < item.units) {
        await session.abortTransaction();
        return sendError(res, `Return quantity exceeds purchased units for batch: ${item.batch}`, 400);
      }

      // Calculate total for returned units proportionally
      const unitTotal = orderItem.total / (orderItem.units); // total per unit including tax
      const returnTotal = unitTotal * item.units;
      totalReturn += returnTotal;

      // Save orderItem reference and return total for later use
      orderItemsMap[item.batch] = { orderItem, returnTotal };
    }

    // Deduct from supplier credit
    const newReceive = Math.max((supplierDoc.receive || 0) - totalReturn, 0);
    await SupplierModel.findByIdAndUpdate(supplierDoc._id, { receive: newReceive }, { session });

    // Create return order
    const returnOrder = await Order.create([
      {
        invoice_number: invoice_number + "-R",
        supplier_id: supplierDoc._id,
        subtotal: totalReturn,
        total: totalReturn,
        paid_amount: 0,
        due_amount: totalReturn,
        net_value: totalReturn,
        type: "purchase_return",
        status: "returned",
      },
    ], { session });

    const returnItems = [];
    const batchUpdates = [];

    // Process return items and update original order items
    for (const item of items) {
      const { orderItem, returnTotal } = orderItemsMap[item.batch];

      // Deduct units from original order item
      orderItem.units -= item.units;
      await orderItem.save({ session });

      // Create return order item
      const returnOrderItem = await OrderItem.create([
        {
          order_id: returnOrder[0]._id,
          product_id: item.product_id,
          batch: item.batch,
          expiry: item.expiry,
          units: item.units,
          unit_price: orderItem.unit_price,
          discount: item.discount || 0,
          total: returnTotal,
        },
      ], { session });

      returnItems.push(returnOrderItem[0]);

      // Deduct units from batch stock
      batchUpdates.push({
        updateOne: {
          filter: { product_id: item.product_id, batch_number: item.batch },
          update: { $inc: { stock: -item.units } },
        },
      });
    }

    if (batchUpdates.length) await Batch.bulkWrite(batchUpdates, { session });

    await session.commitTransaction();

    return successResponse(res, "Purchase returned successfully", {
      returnOrder: returnOrder[0],
      items: returnItems,
    }, 200);

  } catch (error) {
    await session.abortTransaction();
    console.error("Return purchase error:", error);
    return sendError(res, "Failed to return product purchases");
  } finally {
    session.endSession();
  }
};

const getAllPurchaseReturns = async (req, res) => {
  try {
    // Fetch all purchase return orders
    const returnOrders = await Order.find({ type: "purchase_return" })
      .populate("supplier_id", "company_name role")
      .sort({ createdAt: -1 })
      .lean();

    // Get all return order items
    const returnOrderIds = returnOrders.map((order) => order._id);
    const returnItems = await OrderItem.find({ order_id: { $in: returnOrderIds } })
      .populate("product_id", "name category unit")
      .lean();

    // Attach items to their respective return order
    const returnsWithItems = returnOrders.map((order) => {
      const items = returnItems.filter(
        (item) => item.order_id.toString() === order._id.toString()
      );
      return { ...order, items };
    });

    // Calculate totals for today, weekly, monthly, yearly
    const now = new Date();
    let todayTotal = 0,
      weeklyTotal = 0,
      monthlyTotal = 0,
      yearlyTotal = 0;

    returnOrders.forEach((order) => {
      const date = new Date(order.createdAt);
      const total = order.total || 0;

      // Today
      if (date.toDateString() === now.toDateString()) todayTotal += total;

      // Weekly (Sunday → Saturday)
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      if (date >= weekStart && date <= weekEnd) weeklyTotal += total;

      // Monthly
      if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth())
        monthlyTotal += total;

      // Yearly
      if (date.getFullYear() === now.getFullYear()) yearlyTotal += total;
    });

    return successResponse(res, "Purchase returns fetched successfully", {
      returns: returnsWithItems,
      totals: {
        today: todayTotal,
        weekly: weeklyTotal,
        monthly: monthlyTotal,
        yearly: yearlyTotal,
      },
      totalItems: returnOrders.length,
    });

  } catch (error) {
    console.error("Get all purchase returns error:", error);
    return sendError(res, "Failed to fetch purchase returns");
  }
};



// Get purchase by ID
const getPurchaseById = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return sendError(res, "Invalid order ID", 400);
    }

    const order = await Order.findById(orderId)
      .populate("supplier_id", "name company_name pay receive")
      .lean();

    if (!order) {
      return sendError(res, "Purchase not found", 404);
    }

    // Fetch order items with product details
    const items = await OrderItem.find({ order_id: orderId })
      .populate("product_id", "name item_code retail_price trade_price")
      .lean();

    // ✅ Merge order + items into one object
    const purchase = {
      ...order,
      items,
    };

    return successResponse(res, "Single Purchase fetched successfully", {
      purchase,
    });
  } catch (error) {
    console.error("Get purchase by ID error:", error);
    return sendError(res, "Failed to fetch purchase");
  }
};


// Edit purchase
const editPurchase = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId } = req.params;
    const { invoice_number, subtotal, total, paid_amount, due_amount, net_value, status, items } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      await session.abortTransaction();
      return sendError(res, "Invalid order ID", 400);
    }

    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return sendError(res, "Purchase not found", 404);
    }

    if (order.type !== "purchase") {
      await session.abortTransaction();
      return sendError(res, "Not a purchase order", 400);
    }

    // ✅ Reverse old stock changes
    const oldItems = await OrderItem.find({ order_id: orderId }).session(session);
    for (const item of oldItems) {
      await Batch.findOneAndUpdate(
        { product_id: item.product_id, batch_number: item.batch },
        { $inc: { stock: -item.units } },
        { session }
      );
    }

    // Delete old items
    await OrderItem.deleteMany({ order_id: orderId }).session(session);

    // ✅ Update supplier balances
    const supplierDoc = await SupplierModel.findById(order.supplier_id).session(session);
    if (!supplierDoc) {
      await session.abortTransaction();
      return sendError(res, "Supplier not found", 404);
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
    // Reverse old total
    let { pay: revPay, receive: revReceive } = adjustPayReceive(
      supplierDoc.pay || 0,
      supplierDoc.receive || 0,
      0,
      -order.total
    );

    // Apply new total
    let { pay, receive } = adjustPayReceive(
      revPay,
      revReceive,
      0,
      total ?? order.total
    );

    await SupplierModel.findByIdAndUpdate(
      order.supplier_id,
      { pay, receive },
      { session }
    );

    // ✅ Update order fields
    order.invoice_number = invoice_number || order.invoice_number;
    order.subtotal = subtotal ?? order.subtotal;
    order.total = total ?? order.total;
    order.paid_amount = paid_amount ?? order.paid_amount;
    order.due_amount = due_amount ?? order.due_amount;
    order.net_value = net_value ?? order.net_value;
    order.status = status ?? order.status;
    await order.save({ session });

    // ✅ Add new items and update batches
    const newItems = [];
    const batchUpdates = [];

    for (const item of items) {
      const newItem = await OrderItem.create(
        [{
          order_id: order._id,
          product_id: item.product_id,
          batch: item.batch,
          expiry: item.expiry,
          units: item.units,
          unit_price: item.unit_price,
          discount: item.discount || 0,
          total: item.total,
        }],
        { session }
      );

      newItems.push(newItem[0]);

      batchUpdates.push({
        updateOne: {
          filter: { product_id: item.product_id, batch_number: item.batch },
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

    if (batchUpdates.length) {
      await Batch.bulkWrite(batchUpdates, { session });
    }

    await session.commitTransaction();

    return successResponse(res, "Purchase updated successfully", {
      order,
      items: newItems,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Edit purchase error:", error);
    return sendError(res, "Failed to edit purchase");
  } finally {
    session.endSession();
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
  returnPurchaseByInvoice,
  getAllPurchaseReturns,
  getProductPurchases,
  getPurchaseForReturn,
  getPurchaseById,
  editPurchase,
  deletePurchase
};


export default purchaseController;