import { OrderModel as Order } from "../models/orderModel.js";
import {
  OrderItemModel as OrderItem,
  OrderItemModel,
} from "../models/orderItemModel.js";
import {
  SupplierModel as Supplier,
  SupplierModel,
} from "../models/supplierModel.js";
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
      purchase_number,
      supplier_id,
      subtotal,
      total,
      paid_amount,
      due_amount,
      net_value,
      due_date,
      note,
      items = [],
      type = "purchase",
      status = "completed", // can be "completed" or "skipped"
    } = req.body;

    // ✅ Validate type
    if (type !== "purchase") {
      await session.abortTransaction();
      return sendError(res, "Invalid order type", 400);
    }

    // ✅ Supplier validation
    const supplierDoc = await SupplierModel.findById(supplier_id).session(
      session
    );
    if (!supplierDoc) {
      await session.abortTransaction();
      return sendError(res, "Supplier not found", 404);
    }

    // ✅ Required field validation only for completed orders
    if (status === "completed") {
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
    }

    // ✅ Create purchase order (always saved)
    const [newOrder] = await Order.create(
      [
        {
          invoice_number,
          purchase_number,
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

    // ✅ Always create order items (even in draft)
    const orderItems = [];
    for (const item of items) {
      const [orderItem] = await OrderItem.create(
        [
          {
            order_id: newOrder._id,
            product_id: item.product_id,
            batch: item.batch,
            expiry: item.expiry || null,
            units: item.units,
            unit_price: item.unit_price,
            discount: item.discount || 0,
            total: item.total,
          },
        ],
        { session }
      );
      orderItems.push(orderItem);
    }

    // ✅ If draft: no supplier or batch stock updates
    if (status === "skipped") {
      await session.commitTransaction();
      session.endSession();
      return successResponse(
        res,
        "Draft saved successfully (ready for completion later)",
        { order: newOrder, items: orderItems },
        201
      );
    }

    // ✅ Completed order: update supplier balances and stock
    const updatedPay = supplierDoc.pay || 0;
    const updatedReceive = (supplierDoc.receive || 0) + (total - paid_amount);

    await SupplierModel.findByIdAndUpdate(
      supplier_id,
      { pay: updatedPay, receive: updatedReceive },
      { session }
    );

    const batchUpdates = [];
    for (const item of items) {
      const product = await Product.findById(item.product_id).session(session);
      if (!product) {
        await session.abortTransaction();
        return sendError(res, `Product not found: ${item.product_id}`, 404);
      }

      const expiryValue = item.expiry || null;

      batchUpdates.push({
        updateOne: {
          filter: { product_id: item.product_id, batch_number: item.batch },
          update: {
            $setOnInsert: {
              product_id: item.product_id,
              batch_number: item.batch,
              purchase_price: item.unit_price,
              expiry_date: expiryValue,
            },
            $set: {
              unit_cost: item.total / item.units,
              discount_per_unit:
                item.units > 0 ? (item.discount || 0) / item.units : 0,
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

    // ✅ Commit transaction for completed purchase
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
    return sendError(res, error.message || "Something went wrong");
  } finally {
    session.endSession();
  }
};

// Get all purchases by supplier ID
const getPurchasesBySupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;

    // Check if supplier exists
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return sendError(res, "Supplier not found", 404);
    }

    // Get all purchases (no pagination)
    const purchases = await Order.find({
      supplier_id: supplierId,
      type: "purchase",
    })
      .populate("supplier_id", "name")
      .sort({ createdAt: -1 });

    // Get total count
    const totalPurchases = await Order.countDocuments({
      supplier_id: supplierId,
      type: "purchase",
    });

    return successResponse(res, "Purchases fetched successfully", {
      purchases,
      totalItems: totalPurchases,
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
      .populate(
        "supplier_id",
        "company_name role address city phone_number pay receive"
      )
      .sort({ createdAt: -1 })
      .lean();

    // Fetch OrderItems and attach product details
    const purchaseIds = purchases.map((order) => order._id);
    const orderItems = await OrderItem.find({ order_id: { $in: purchaseIds } })
      .populate({
        path: "product_id",
        select: "name sales_tax sales_tax_percentage pack_size_id",
        populate: {
          path: "pack_size_id",
          model: "PackSize",
          select: "name",
        },
      })
      .lean();

    const purchasesWithItems = purchases.map((order) => {
      const items = orderItems.filter(
        (item) => item.order_id.toString() === order._id.toString()
      );
      return { ...order, items };
    });

    // Initialize totals
    const now = new Date();
    const totals = {
      all: { total: 0, count: 0 },
      today: { total: 0, count: 0 },
      weekly: { total: 0, count: 0 },
      monthly: { total: 0, count: 0 },
      yearly: { total: 0, count: 0 },
    };

    // Week start/end
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Calculate totals
    purchases.forEach((p) => {
      const date = new Date(p.createdAt);
      const total = p.total || 0;

      // All
      totals.all.total += total;
      totals.all.count += 1;

      // Today
      if (date.toDateString() === now.toDateString()) {
        totals.today.total += total;
        totals.today.count += 1;
      }

      // Weekly
      if (date >= weekStart && date <= weekEnd) {
        totals.weekly.total += total;
        totals.weekly.count += 1;
      }

      // Monthly
      if (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      ) {
        totals.monthly.total += total;
        totals.monthly.count += 1;
      }

      // Yearly
      if (date.getFullYear() === now.getFullYear()) {
        totals.yearly.total += total;
        totals.yearly.count += 1;
      }
    });

    return successResponse(res, "Purchase orders fetched successfully", {
      purchases: purchasesWithItems,
      totals,
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

    // Check if product exists and get product prices
    const product = await Product.findById(productId).select(
      "name item_code retail_price trade_price"
    );
    if (!product) {
      return sendError(res, "Product not found", 404);
    }

    // Get order items with necessary data (no skip/limit)
    const orderItems = await OrderItem.aggregate([
      {
        $match: { product_id: new mongoose.Types.ObjectId(productId) },
      },
      {
        $lookup: {
          from: "orders",
          localField: "order_id",
          foreignField: "_id",
          as: "order",
        },
      },
      { $unwind: "$order" },
      {
        $match: { "order.type": "purchase" },
      },
      {
        $lookup: {
          from: "suppliers",
          localField: "order.supplier_id",
          foreignField: "_id",
          as: "supplier",
        },
      },
      { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          date: "$order.createdAt",
          invoice_number: "$order.invoice_number",
          type: "$order.type",
          supplier: "$supplier.name",
          batch: "$batch",
          expiry: "$expiry",
          units: "$units",
          unit_price: "$unit_price",
          discount: "$discount",
          total: "$total",
          retail_price: product.retail_price,
          trade_price: product.trade_price,
        },
      },
      { $sort: { date: -1 } },
    ]);

    // Calculate product in/out and total stock
    const stockData = await Batch.aggregate([
      {
        $match: { product_id: new mongoose.Types.ObjectId(productId) },
      },
      {
        $group: {
          _id: null,
          totalStock: { $sum: "$stock" },
          productIn: { $sum: "$stock" }, // For purchases, product in = stock
        },
      },
    ]);

    const productOut = 0; // Would need sales data to calculate this
    const stockInfo =
      stockData.length > 0
        ? stockData[0]
        : {
            totalStock: 0,
            productIn: 0,
          };

    return successResponse(res, "Product purchases fetched successfully", {
      purchases: orderItems,
      stockInfo: {
        productIn: stockInfo.productIn,
        productOut,
        totalStock: stockInfo.totalStock,
      },
      product: {
        _id: product._id,
        name: product.name,
        item_code: product.item_code,
        retail_price: product.retail_price,
        trade_price: product.trade_price,
      },
      totalItems: orderItems.length,
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
    const purchaseOrder = await Order.findOne({
      invoice_number,
      type: "purchase",
    }).session(session);
    if (!purchaseOrder) {
      await session.abortTransaction();
      return sendError(res, "Purchase order not found", 404);
    }

    const supplierDoc = await SupplierModel.findById(
      purchaseOrder.supplier_id
    ).session(session);
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
        return sendError(
          res,
          `Order item not found for batch: ${item.batch}`,
          404
        );
      }

      if (orderItem.units < item.units) {
        await session.abortTransaction();
        return sendError(
          res,
          `Return quantity exceeds purchased units for batch: ${item.batch}`,
          400
        );
      }

      // Calculate total for returned units proportionally
      const unitTotal = orderItem.total / orderItem.units; // total per unit including tax
      const returnTotal = unitTotal * item.units;
      totalReturn += returnTotal;

      // Save orderItem reference and return total for later use
      orderItemsMap[item.batch] = { orderItem, returnTotal };
    }

    // Deduct from supplier credit
    const newReceive = Math.max((supplierDoc.receive || 0) - totalReturn, 0);
    await SupplierModel.findByIdAndUpdate(
      supplierDoc._id,
      { receive: newReceive },
      { session }
    );

    // Create return order
    const returnOrder = await Order.create(
      [
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
      ],
      { session }
    );

    const returnItems = [];
    const batchUpdates = [];

    // Process return items and update original order items
    for (const item of items) {
      const { orderItem, returnTotal } = orderItemsMap[item.batch];

      // Deduct units from original order item
      orderItem.units -= item.units;
      await orderItem.save({ session });

      // Create return order item
      const returnOrderItem = await OrderItem.create(
        [
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
        ],
        { session }
      );

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

    return successResponse(
      res,
      "Purchase returned successfully",
      {
        returnOrder: returnOrder[0],
        items: returnItems,
      },
      200
    );
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
    const returnItems = await OrderItem.find({
      order_id: { $in: returnOrderIds },
    })
      .populate("product_id", "name category unit")
      .lean();

    // Attach items to their respective return order
    const returnsWithItems = returnOrders.map((order) => {
      const items = returnItems.filter(
        (item) => item.order_id.toString() === order._id.toString()
      );
      return { ...order, items };
    });

    // Initialize totals
    const now = new Date();
    const totals = {
      all: { total: 0, count: 0 },
      today: { total: 0, count: 0 },
      weekly: { total: 0, count: 0 },
      monthly: { total: 0, count: 0 },
      yearly: { total: 0, count: 0 },
    };

    // Week start/end
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Calculate totals
    returnOrders.forEach((order) => {
      const date = new Date(order.createdAt);
      const total = order.total || 0;

      // All
      totals.all.total += total;
      totals.all.count += 1;

      // Today
      if (date.toDateString() === now.toDateString()) {
        totals.today.total += total;
        totals.today.count += 1;
      }

      // Weekly
      if (date >= weekStart && date <= weekEnd) {
        totals.weekly.total += total;
        totals.weekly.count += 1;
      }

      // Monthly
      if (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      ) {
        totals.monthly.total += total;
        totals.monthly.count += 1;
      }

      // Yearly
      if (date.getFullYear() === now.getFullYear()) {
        totals.yearly.total += total;
        totals.yearly.count += 1;
      }
    });

    return successResponse(res, "Purchase returns fetched successfully", {
      returns: returnsWithItems,
      totals,
      totalItems: returnOrders.length,
    });
  } catch (error) {
    console.error("Get all purchase returns error:", error);
    return sendError(res, "Failed to fetch purchase returns");
  }
};

export const getLastTransactionByProduct = async (req, res) => {
  try {
    const { productId } = req.query;

    // Validate input
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productId is required",
      });
    }

    // Match only the product
    const itemMatch = {
      product_id: new mongoose.Types.ObjectId(productId),
    };

    // Match only SALE orders
    const orderMatch = { type: "sale" };

    const lastItem = await OrderItemModel.aggregate([
      { $match: itemMatch },
      {
        $lookup: {
          from: "orders",
          localField: "order_id",
          foreignField: "_id",
          as: "order",
          pipeline: [
            { $match: orderMatch },
            {
              $lookup: {
                from: "suppliers",
                localField: "supplier_id",
                foreignField: "_id",
                as: "supplier",
              },
            },
            {
              $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true },
            },
            {
              $project: {
                invoice_number: 1,
                createdAt: 1,
                type: 1,
                "supplier.company_name": 1,
              },
            },
          ],
        },
      },
      { $unwind: "$order" },
      { $sort: { createdAt: -1 } },
      { $limit: 1 },
    ]);

    if (!lastItem.length) {
      return res.status(404).json({
        success: false,
        message: "No previous SALE transaction found for this product",
      });
    }

    const item = lastItem[0];

    // Calculate discount details
    const discountPerUnit = item.units ? item.discount / item.units : 0;
    const discountPercentage = item.unit_price
      ? (discountPerUnit / item.unit_price) * 100
      : 0;

    const data = {
      invoice_number: item.order.invoice_number,
      date: item.order.createdAt,
      supplier: item.order.supplier?.company_name || "N/A",
      type: item.order.type,
      trade_price: item.unit_price,
      quantity: item.units,
      discount_total: item.discount,
      discount_per_unit: discountPerUnit,
      discount_percentage: discountPercentage.toFixed(2),
      batch: item.batch,
    };

    return res.status(200).json({
      success: true,
      message: "Last purchase transaction fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch last purchase transaction",
      error: error.message,
    });
  }
};

// Get purchase by ID
const getPurchaseById = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return sendError(res, "Invalid order ID", 400);
    }

    // Fetch the main order
    const order = await Order.findById(orderId)
      .populate("supplier_id", "name company_name pay receive")
      .lean();

    if (!order) {
      return sendError(res, "Purchase not found", 404);
    }

    // Fetch related items with nested product details
    const items = await OrderItem.find({ order_id: orderId })
      .populate({
        path: "product_id",
        select:
          "name item_code retail_price trade_price sales_tax sales_tax_percentage pack_size_id",
        populate: {
          path: "pack_size_id",
          model: "PackSize",
          select: "name",
        },
      })
      .lean();

    // ✅ Format and flatten item data
    const formattedItems = items.map((item) => ({
      ...item,
      product_name: item.product_id?.name || "",
      item_code: item.product_id?.item_code || "",
      retail_price: item.product_id?.retail_price || 0,
      trade_price: item.product_id?.trade_price || 0,
      sales_tax: item.product_id?.sales_tax || 0,
      sales_tax_percentage: item.product_id?.sales_tax_percentage || 0,
      pack_size: item.product_id?.pack_size_id?.name || "",
    }));

    // ✅ Combine into a single purchase object
    const purchase = {
      ...order,
      items: formattedItems,
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

    // 🔸 Validate order ID
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      await session.abortTransaction();
      return sendError(res, "Invalid order ID", 400);
    }

    // 🔸 Fetch existing order
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return sendError(res, "Purchase not found", 404);
    }

    if (order.type !== "purchase") {
      await session.abortTransaction();
      return sendError(res, "Not a purchase order", 400);
    }

    // 🔹 Reverse old stock
    const oldItems = await OrderItem.find({ order_id: orderId }).session(
      session
    );
    for (const item of oldItems) {
      await Batch.findOneAndUpdate(
        { product_id: item.product_id, batch_number: item.batch },
        { $inc: { stock: -item.units } },
        { session }
      );
    }

    // 🔹 Delete old items
    await OrderItem.deleteMany({ order_id: orderId }).session(session);

    // 🧾 Supplier balance update (based on due amount)
    const oldSupplierId = order.supplier_id;
    const newSupplierId = req.body.supplier_id ?? oldSupplierId;

    const oldDue = Number(order.due_amount) || 0;
    const newDue = Number(req.body.due_amount) || oldDue;
    const dueDiff = newDue - oldDue;

    console.log("📊 Supplier balance update section:");
    console.log("Old Supplier ID:", oldSupplierId?.toString());
    console.log("New Supplier ID:", newSupplierId?.toString());
    console.log("Old Due Amount:", oldDue);
    console.log("New Due Amount:", newDue);
    console.log("💰 Due Difference (affects supplier balance):", dueDiff);

    if (oldSupplierId.toString() !== newSupplierId.toString()) {
      // 🔁 Supplier changed: reverse old due and add new one
      if (oldSupplierId) {
        await SupplierModel.findByIdAndUpdate(
          oldSupplierId,
          { $inc: { receive: dueDiff } },
          { session }
        );
        console.log(`↩️ Reversed old supplier balance by: -${oldDue}`);
      }

      if (newSupplierId) {
        await SupplierModel.findByIdAndUpdate(
          newSupplierId,
          { $inc: { receive: newDue } },
          { session }
        );
        console.log(`➕ Added new supplier balance by: +${newDue}`);
      }
    } else {
      // 🧾 Same supplier → adjust by due difference
      await SupplierModel.findByIdAndUpdate(
        oldSupplierId,
        { $inc: { receive: dueDiff } },
        { session }
      );
      console.log(`🔄 Adjusted same supplier balance by: ${dueDiff}`);
    }

    // 🔹 Update order details
    Object.keys(req.body).forEach((key) => {
      order[key] = req.body[key];
    });
    order.supplier_id = newSupplierId;
    await order.save({ session });

    // 🔹 Recreate order items and update batches
    const newItems = [];
    if (Array.isArray(req.body.items)) {
      const batchUpdates = [];

      for (const item of req.body.items) {
        const newItem = await OrderItem.create(
          [
            {
              order_id: order._id,
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
              $set: {
                unit_cost: item.units > 0 ? item.total / item.units : 0,
                discount_per_unit:
                  item.units > 0 ? (item.discount || 0) / item.units : 0,
              },
              $inc: { stock: item.units },
            },
            upsert: true,
          },
        });
      }

      if (batchUpdates.length > 0) {
        await Batch.bulkWrite(batchUpdates, { session });
      }
    }

    await session.commitTransaction();

    console.log(
      "✅ Purchase edited successfully (due-based supplier balance updated)."
    );

    return successResponse(res, "Purchase updated successfully", {
      order,
      items: newItems,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Edit purchase error:", error);
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
    const orderItems = await OrderItem.find({ order_id: orderId }).session(
      session
    );
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
    const supplier = await Supplier.findById(order.supplier_id).session(
      session
    );
    const { pay, receive } = adjustBalance(
      supplier,
      order.total,
      order.type,
      true
    );
    await Supplier.findByIdAndUpdate(
      order.supplier_id,
      { pay, receive },
      { session }
    );

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

// PATCH /purchases/:orderId/complete
export const completePurchase = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      invoice_number,
      subtotal,
      total,
      paid_amount,
      due_amount,
      net_value,
      due_date,
      note,
      items = [],
    } = req.body;

    // 1) Load order (must exist, must be type=purchase, status=skipped)
    const order = await Order.findById(req.params.orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return sendError(res, "Order not found", 404);
    }
    if (order.type !== "purchase") {
      await session.abortTransaction();
      return sendError(res, "Invalid order type", 400);
    }
    if (order.status !== "skipped") {
      await session.abortTransaction();
      return sendError(res, "Only skipped orders can be completed", 400);
    }

    // 2) Supplier must exist
    const supplierDoc = await SupplierModel.findById(order.supplier_id).session(
      session
    );
    if (!supplierDoc) {
      await session.abortTransaction();
      return sendError(res, "Supplier not found", 404);
    }

    // 3) Validate required fields
    const requiredFields = {
      invoice_number: invoice_number ?? order.invoice_number,
      supplier_id: order.supplier_id,
      subtotal: subtotal ?? order.subtotal,
      total: total ?? order.total,
      paid_amount: paid_amount ?? order.paid_amount,
      net_value: net_value ?? order.net_value,
    };
    const missing = Object.entries(requiredFields)
      .filter(
        ([_, v]) =>
          v === undefined ||
          v === null ||
          v === "" ||
          (Array.isArray(v) && v.length === 0)
      )
      .map(([k]) => k);
    if (missing.length) {
      await session.abortTransaction();
      return sendError(
        res,
        `Missing required fields: ${missing.join(", ")}`,
        400
      );
    }

    // 4) Persist "completed" fields onto order and flip status
    order.invoice_number = invoice_number ?? order.invoice_number;
    order.subtotal = subtotal ?? order.subtotal;
    order.total = total ?? order.total;
    order.paid_amount = paid_amount ?? order.paid_amount;
    order.due_amount = due_amount ?? order.due_amount;
    order.net_value = net_value ?? order.net_value;
    order.note = note ?? order.note;
    order.due_date = due_date ?? order.due_date;
    order.status = "completed";
    await order.save({ session });

    // 5) Supplier balances
    const updatedPay = supplierDoc.pay || 0;
    const completedTotal = order.total;
    const completedPaid = order.paid_amount || 0;
    const updatedReceive =
      (supplierDoc.receive || 0) + (completedTotal - completedPaid);
    await SupplierModel.findByIdAndUpdate(
      order.supplier_id,
      { pay: updatedPay, receive: updatedReceive },
      { session }
    );

    // 6) Upsert order items + batch stock updates
    const orderItems = [];
    const batchUpdates = [];

    for (const item of items) {
      const product = await Product.findById(item.product_id).session(session);
      if (!product) {
        await session.abortTransaction();
        return sendError(res, `Product not found: ${item.product_id}`, 404);
      }

      const expiryValue = item.expiry || null;

      // Try to find existing item (from draft)
      let orderItem = await OrderItem.findOne({
        order_id: order._id,
        product_id: item.product_id,
        batch: item.batch,
      }).session(session);

      if (orderItem) {
        // Update existing item
        orderItem.units = item.units;
        orderItem.unit_price = item.unit_price;
        orderItem.discount = item.discount || 0;
        orderItem.total = item.total;
        orderItem.expiry = expiryValue;
        await orderItem.save({ session });
      } else {
        // Insert new item
        [orderItem] = await OrderItem.create(
          [
            {
              order_id: order._id,
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
      }

      orderItems.push(orderItem);

      // Batch stock updates
      batchUpdates.push({
        updateOne: {
          filter: { product_id: item.product_id, batch_number: item.batch },
          update: {
            $setOnInsert: {
              product_id: item.product_id,
              batch_number: item.batch,
              purchase_price: item.unit_price,
              expiry_date: expiryValue,
            },
            $set: {
              unit_cost: item.units > 0 ? item.total / item.units : 0,
              discount_per_unit:
                item.units > 0 ? (item.discount || 0) / item.units : 0,
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

    return successResponse(
      res,
      "Purchase order completed successfully",
      { order, items: orderItems },
      200
    );
  } catch (err) {
    await session.abortTransaction();
    console.error("Complete purchase error:", err);
    return sendError(res, err.message || "Something went wrong");
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
  deletePurchase,
  getLastTransactionByProduct,
  completePurchase,
};

export default purchaseController;
