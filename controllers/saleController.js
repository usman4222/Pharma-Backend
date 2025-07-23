import { OrderModel as Order } from "../models/orderModel.js";
import { OrderItemModel as OrderItem } from "../models/orderItemModel.js";
import { User } from "../models/userModel.js";
import { sendError, successResponse } from "../utils/response.js";

// GET all sales (like index method)
const getAllSales = async (req, res) => {
    try {
      const { status } = req.query;
      const filter = { type: "sale" };
  
      if (status) {
        filter.status = status;
      }
  
      const orders = await Order.find(filter).sort({ createdAt: -1 });
  
      // Aggregate footer values
      const totals = await Order.aggregate([
        { $match: filter },
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
  
      successResponse(res, "Sales fetched", {
        sales: orders,
        footer: totals[0] || {},
      });
    } catch (error) {
      console.log("error", error);
      sendError(res, "Get Sales Error", error.message);
    }
  };
  

// GET sale print (like print method)
const printSale = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id).populate("supplier");
    const orderItems = await OrderItem.find({ order_id: id }).populate(
      "product"
    );

    if (!order) return sendError(res, "Sale not found");

    successResponse(res, "Sale for print", {
      order,
      orderItems,
    });
  } catch (error) {
    sendError(res, "Print Sale Error", error);
  }
};

// GET last sale ID (like create method)
const getLastSale = async (req, res) => {
  try {
    const lastOrder = await Order.findOne({ type: "sale" }).sort({
      createdAt: -1,
    });
    const bookers = await User.find({ type: "booker" }).select("name _id");

    successResponse(res, "Last sale ID and bookers fetched", {
      lastOrderId: lastOrder ? lastOrder._id : null,
      bookers,
    });
  } catch (error) {
    sendError(res, "Get Last Sale Error", error);
  }
};

// GET bookers only (like getBookers)
const getBookers = async (req, res) => {
  try {
    const bookers = await User.find({ type: "booker" }).select("name _id");
    successResponse(res, "Bookers fetched", bookers);
  } catch (error) {
    sendError(res, "Get Bookers Error", error);
  }
};

// POST create sale (to match store())
const createSale = async (req, res) => {
  try {
    const {
      customer, // or customer
      invoice_number,
      date,
      discount,
      subtotal,
      total,
      paid_amount,
      due_amount,
      status,
      saleItems, // array of { productId, quantity, price, total }
    } = req.body;

    const order = new Order({
      customer,
      invoice_number,
      date,
      discount,
      subtotal,
      total,
      paid_amount,
      due_amount,
      status,
      type: "sale",
      user_id: "660af09cf083d59a2b123456",

    });

    const savedOrder = await order.save();

    const orderItems = saleItems.map((item) => ({
        order_id: savedOrder._id, // must be set after saving the order
        product_id: item.product, // assuming item.product holds the ObjectId
        batch: item.batch,
        expiry: item.expiry,
        units: item.quantity, // map quantity → units
        unit_price: item.unitPrice, // map unitPrice → unit_price
        discount: item.discount || 0,
        total: item.total,
      }));      

    await OrderItem.insertMany(orderItems);

    successResponse(res, "Sale created", { order: savedOrder, orderItems });
  } catch (error) {
    console.error("error",error)
    // sendError(res, "Create Sale Error", error);
  }
};

// Export all like you mentioned
const saleController = {
  getAllSales,
  printSale,
  getLastSale,
  createSale,
  getBookers,
};

export default saleController;
