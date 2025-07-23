import { OrderModel } from "../models/orderModel.js";
import { OrderItemModel } from "../models/orderItemModel.js";
import { sendError, successResponse } from "../utils/response.js";

// Get all purchase orders with status filtering and pagination
export const getAllPurchases = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    const query = { type: "purchase" };
    if (status) {
      query.status = status;
    }

    const purchases = await OrderModel.find(query)
      .populate("user_id", "name") // Assuming user_id refers to SupplierModel
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await OrderModel.countDocuments(query);

    const footerTotals = await OrderModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          subtotal: { $sum: "$subtotal" },
          paid_amount: { $sum: "$paid_amount" },
          due_amount: { $sum: "$due_amount" },
        },
      },
    ]);

    const summary = footerTotals[0] || {
      total: 0,
      subtotal: 0,
      paid_amount: 0,
      due_amount: 0,
    };

    return successResponse(res, "Purchase orders fetched", {
      purchases,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      pageSize: parseInt(limit),
      hasMore: page * limit < total,
      summary,
    });
  } catch (error) {
    console.error("Get Purchases Error:", error);
    return sendError(res, "Failed to fetch purchases", 500);
  }
};

// Print a specific purchase order
export const printPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await OrderModel.findById(id).populate("user_id");
    if (!order) return sendError(res, "Purchase not found", 404);

    const order_items = await OrderItemModel.find({ order_id: id }).populate(
      "product_id"
    );
    return successResponse(res, "Purchase details fetched", {
      order,
      order_items,
    });
  } catch (error) {
    console.error("Print Purchase Error:", error);
    return sendError(res, "Failed to fetch print data", 500);
  }
};

// Get last purchase for a product by supplier and batch
export const getLastPurchase = async (req, res) => {
  try {
    const { product_id, supplier_id, batch_number } = req.body;

    if (!product_id || !supplier_id || !batch_number)
      return sendError(res, "Required fields missing", 400);

    const latestPurchase = await OrderItemModel.findOne({
      product_id,
      batch: batch_number,
    })
      .sort({ createdAt: -1 })
      .populate({
        path: "order_id",
        match: { user_id: supplier_id, type: "purchase" },
      });

    if (!latestPurchase || !latestPurchase.order_id)
      return successResponse(res, "No purchase found", null);

    return successResponse(res, "Last purchase fetched", { latestPurchase });
  } catch (error) {
    console.error("Get Last Purchase Error:", error);
    return sendError(res, "Failed to fetch last purchase", 500);
  }
};

// Create purchase (optional)
export const createPurchase = async (req, res) => {
  try {
    const {
      invoice_number,
      user_id,
      subtotal,
      total,
      paid_amount,
      due_amount,
      status,
      items,
    } = req.body;

    const newOrder = await OrderModel.create({
      invoice_number,
      user_id,
      subtotal,
      total,
      paid_amount,
      due_amount,
      type: "purchase",
      status: status || "pending",
    });

    const orderItems = items.map((item) => ({
      ...item,
      order_id: newOrder._id,
    }));

    await OrderItemModel.insertMany(orderItems);

    return successResponse(res, "Purchase order created", { order: newOrder });
  } catch (error) {
    console.error("Create Purchase Error:", error);
    return sendError(res, "Failed to create purchase", 500);
  }
};

const purchaseController = {
  getAllPurchases,
  printPurchase,
  getLastPurchase,
  createPurchase,
};

export default purchaseController;
