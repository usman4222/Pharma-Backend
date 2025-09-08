import { OrderModel as Order } from "../models/orderModel.js";
import { OrderItemModel as OrderItem, OrderItemModel } from "../models/orderItemModel.js";
import { SupplierModel as Supplier } from "../models/supplierModel.js";
import { BatchModel as Batch } from "../models/batchModel.js";
import { ProductModel as Product } from "../models/productModel.js";
import { User } from "../models/userModel.js";
import { sendError, successResponse } from "../utils/response.js";
import mongoose from "mongoose";
import adjustBalance from "../utils/adjustBalance.js";
import Investor from "../models/investorModel.js";
import investorProfit from "../models/investorProfit.js";

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
      due_date,
      net_value,
      note,
      items,
      type = "sale",
    } = req.body;

    // 1. Validate required fields
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
      .filter(([_, value]) => value === undefined || value === null || value === "")
      .map(([key]) => key);

    if (missingFields.length > 0) {
      await session.abortTransaction();
      return sendError(res, `Missing required fields: ${missingFields.join(", ")}`, 400);
    }

    // Ensure paid amount is not greater than total
    if (Number(paid_amount) > Number(total)) {
      await session.abortTransaction();
      return sendError(res, "Paid amount cannot be greater than total", 400);
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

    // 6. Create order with recovery logic
    const actualDue = total - paid_amount;

    const orderData = {
      invoice_number,
      supplier_id,
      booker_id,
      subtotal,
      total,
      paid_amount,
      due_amount: actualDue, // always override
      net_value,
      note,
      due_date,
      type,
    };

    if (paid_amount >= total) {
      // fully recovered
      orderData.status = "recovered";
      orderData.recovered_amount = paid_amount;
      orderData.recovered_date = new Date();
    } else if (paid_amount > 0) {
      // partial recovery
      orderData.status = "completed";
      orderData.recovered_amount = paid_amount;
      orderData.recovered_date = new Date();
    } else {
      // no recovery
      orderData.status = "completed";
      orderData.recovered_amount = 0;
      orderData.recovered_date = null;
    }

    const newOrder = await Order.create([orderData], { session });
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

      // Parse expiry "MM/YYYY" → Date
      let expiryDate = null;
      if (item.expiry) {
        const [month, year] = item.expiry.split("/");
        expiryDate = new Date(`${year}-${month.padStart(2, "0")}-01`);
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
          filter: { product_id: item.product_id, batch_number: item.batch },
          update: { $inc: { stock: -item.units } },
        },
      });
    }

    if (batchUpdates.length) {
      await Batch.bulkWrite(batchUpdates, { session });
    }

    // 8. Adjust supplier balances
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

    const { pay, receive } = adjustPayReceive(
      supplierDoc.pay || 0,
      supplierDoc.receive || 0,
      actualDue, // add net due
      0
    );

    await Supplier.findByIdAndUpdate(
      supplier_id,
      { pay, receive },
      { session }
    );


    // 9. Investor Profit Sharing (→ InvestorProfit table + update credit balance)
    const grossSale = total;
    const expense = grossSale * 0.02;
    const charity = grossSale * 0.10;
    const distributable = grossSale - (expense + charity);

    const investors = await Investor.find({ status: "active" }).session(session);
    const today = new Date();
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    for (const inv of investors) {
      const joinDate = new Date(inv.join_date);
      let eligible = false;

      if (joinDate <= new Date(today.getFullYear(), today.getMonth(), 1)) {
        eligible = true;
      } else if (
        joinDate.getDate() <= 15 &&
        joinDate.getMonth() === today.getMonth() &&
        joinDate.getFullYear() === today.getFullYear()
      ) {
        eligible = today.getDate() >= 15;
      }

      if (!eligible) continue;

      const invShare = (distributable * inv.profit_percentage) / 100;
      const ownerShare = distributable - invShare;

      // ✅ 1. Save to InvestorProfit table
      await investorProfit.create(
        [
          {
            investor_id: inv._id,
            month: monthKey,
            order_id: newOrder[0]._id,
            sales: grossSale,
            gross_profit: grossSale,
            expense,
            charity,
            net_profit: distributable,
            investor_share: invShare,
            owner_share: ownerShare,
            total: grossSale,
          }
        ],
        { session }
      );

      // ✅ 2. Update only credit balance (no push in debit_credit)
      inv.credit = (inv.credit || 0) + invShare;
      console.log(`Investor ${inv.name} new credit:`, inv.credit);

      await inv.save({ session });
    }

    await session.commitTransaction();

    return successResponse(
      res,
      "Sale order created successfully",
      { order: newOrder[0], items: orderItems, distributable },
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
    const limit = parseInt(req.query.limit) || 20;

    // Fetch sales with supplier and booker populated
    const sales = await Order.find({ type: "sale" })
      .populate('supplier_id', 'company_name role')
      .populate('booker_id', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // Fetch OrderItems and attach product details
    const saleIds = sales.map((order) => order._id);
    const orderItems = await OrderItem.find({ order_id: { $in: saleIds } })
      .populate("product_id", "name category unit")
      .lean();

    const salesWithItems = sales.map((order) => {
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

    // Set week start (Sunday 00:00:00) and week end (Saturday 23:59:59)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    sales.forEach((s) => {
      const date = new Date(s.createdAt);
      const total = s.total || 0;

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

    // Pagination
    const totalItems = sales.length;
    const paginatedSales = salesWithItems.slice((page - 1) * limit, page * limit);

    return successResponse(res, "Sale orders fetched successfully", {
      sales: paginatedSales,
      totals: {
        today: todayTotal,
        weekly: weeklyTotal,
        monthly: monthlyTotal,
        yearly: yearlyTotal,
      },
      currentPage: page,
      totalItems,
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


// GET all sale returns with their items and totals
export const getAllSaleReturns = async (req, res) => {
  try {
    // Fetch all sale return orders
    const returns = await Order.find({ type: "sale_return" })
      .populate("supplier_id", "_id company_name role")
      .sort({ createdAt: -1 })
      .lean();

    // Populate items for each return order
    const returnIds = returns.map((ret) => ret._id);
    const returnItems = await OrderItem.find({ order_id: { $in: returnIds } })
      .populate("product_id", "_id name")
      .lean();

    const returnsWithItems = returns.map((ret) => {
      const items = returnItems.filter(
        (item) => item.order_id.toString() === ret._id.toString()
      );
      return { ...ret, items };
    });

    // Calculate totals: today, weekly, monthly, yearly
    const now = new Date();
    let todayTotal = 0,
      weeklyTotal = 0,
      monthlyTotal = 0,
      yearlyTotal = 0;

    returns.forEach((ret) => {
      const date = new Date(ret.createdAt);
      const total = ret.total || 0;

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

    return successResponse(res, "Sale returns fetched successfully", {
      returns: returnsWithItems,
      totals: {
        today: todayTotal,
        weekly: weeklyTotal,
        monthly: monthlyTotal,
        yearly: yearlyTotal,
      },
      totalItems: returns.length,
    });
  } catch (error) {
    console.error("Error fetching sale returns:", error);
    return sendError(res, "Failed to fetch sale returns");
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


// Get all sales of a specific booker (employee)
const getBookerSales = async (req, res) => {
  try {
    const { bookerId } = req.params;

    // ✅ Validate booker exists
    const booker = await User.findById(bookerId);
    if (!booker) {
      return sendError(res, "Booker not found", 404);
    }

    // Count total sales
    const totalItems = await Order.countDocuments({
      booker_id: bookerId,
      type: "sale",
    });

    // ✅ Fetch all sales for this booker
    const sales = await Order.find({ booker_id: bookerId, type: "sale" })
      .populate("supplier_id", "company_name")
      .populate("booker_id", "name email")
      .sort({ createdAt: -1 })
      .lean();

    // Get order items
    const orderIds = sales.map((s) => s._id);
    const orderItems = await OrderItem.find({ order_id: { $in: orderIds } })
      .populate("product_id", "name sku")
      .lean();

    // Attach items
    const salesWithItems = sales.map((sale) => ({
      ...sale,
      items: orderItems.filter(
        (item) => item.order_id.toString() === sale._id.toString()
      ),
    }));

    return successResponse(res, "Booker sales fetched successfully", {
      sales: salesWithItems,
      totalItems,
    });
  } catch (error) {
    console.error("Get Booker Sales error:", error);
    return sendError(res, error.message);
  }
};



// ✅ Add Recovery Controller
export const addRecover = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId } = req.params;
    const { recovery_amount, recovery_date } = req.body;

    if (!recovery_amount || recovery_amount <= 0) {
      return sendError(res, "Recovery amount must be greater than zero", 400);
    }

    // 🔹 Find the order
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return sendError(res, "Order not found", 404);
    }

    if (order.due_amount < recovery_amount) {
      await session.abortTransaction();
      return sendError(res, "Recovery amount cannot be greater than due amount", 400);
    }

    // 🔹 Find supplier
    const supplier = await Supplier.findById(order.supplier_id).session(session);
    if (!supplier) {
      await session.abortTransaction();
      return sendError(res, "Supplier not found", 404);
    }

    // 🔹 Update Order's due_amount and recovered fields
    order.due_amount = Number((order.due_amount - recovery_amount).toFixed(2));
    order.recovered_amount += recovery_amount;
    order.recovered_date = recovery_date || new Date();

    if (order.due_amount <= 0) {
      order.due_amount = 0;
      order.status = "recovered";
    }


    await order.save({ session });

    // 🔹 Update Supplier's debit (pay)
    supplier.pay = (supplier.pay || 0) - recovery_amount;
    if (supplier.pay < 0) supplier.pay = 0; // safety check
    await supplier.save({ session });

    await session.commitTransaction();
    session.endSession();

    return successResponse(res, "Recovery added successfully", {
      sale: order,
      supplier,
      recovery: {
        recovery_amount,
        recovery_date: recovery_date || new Date(),
      },
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return sendError(res, "Failed to add recovery", error);
  }
};


// Get all sales with pagination (only with valid booker_id)
const getAllBookersSales = async (req, res) => {
  try {
    // ✅ Only sales that must have a booker_id
    const filter = {
      type: "sale",
      booker_id: { $exists: true, $ne: null },
    };

    // Count total sales with valid booker_id
    const totalItems = await Order.countDocuments(filter);

    // Fetch sales with supplier + booker populated
    const sales = await Order.find(filter)
      .populate("supplier_id", "company_name receive pay")
      .populate("booker_id", "name email") // ensures booker exists
      .sort({ createdAt: -1 })
      .lean();

    // 🚨 Filter out records where booker_id failed to populate (invalid user)
    const validSales = sales.filter((s) => s.booker_id && s.booker_id._id);

    // Get order items
    const orderIds = validSales.map((s) => s._id);
    const orderItems = await OrderItem.find({ order_id: { $in: orderIds } })
      .populate("product_id", "name sku")
      .lean();

    // Attach items to their corresponding sales
    const salesWithItems = validSales.map((sale) => ({
      ...sale,
      items: orderItems.filter(
        (item) => item.order_id.toString() === sale._id.toString()
      ),
    }));

    return successResponse(res, "All Bookers Sales fetched successfully", {
      sales: salesWithItems,
      totalItems,
    });
  } catch (error) {
    console.error("Get All Sales error:", error);
    return sendError(res, error.message);
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
  addRecover,
  getSalesByCustomer,
  getProductSales,
  getSaleForReturn,
  getAllSaleReturns,
  returnSaleByInvoice,
  getSaleById,
  getBookerSales,
  getAllBookersSales,
  deleteSale
};

export default saleController;
