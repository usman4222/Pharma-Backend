import Investor from "../models/investorModel.js";
import investorProfit from "../models/investorProfit.js";
import { OrderModel as Order } from "../models/orderModel.js";
import { sendError, successResponse } from "../utils/response.js";

// 🔹 Helper: check if investor is eligible for profit in a given month
const checkEligibility = (joinDate, month) => {
  const join = new Date(joinDate);
  const calcMonth = new Date(`${month}-01`); // Example "2025-09-01"

  // Joined after this month → not eligible
  if (join > new Date(calcMonth.getFullYear(), calcMonth.getMonth() + 1, 0)) {
    return false;
  }

  // Joined in previous month → full eligible
  if (join < calcMonth) return "full";

  // Joined in the same month
  if (
    join.getMonth() === calcMonth.getMonth() &&
    join.getFullYear() === calcMonth.getFullYear()
  ) {
    if (join.getDate() === 1) return "full"; // from start
    if (join.getDate() > 1 && join.getDate() < 15) return "half"; // from 15th
    if (join.getDate() >= 15) return false; // next month
  }

  return false;
};

// 🔹 Add Investor
const addInvestor = async (req, res) => {
  try {
    const { name, amount, profit_percentage, join_date } = req.body;

    const investor = await Investor.create({
      name,
      profit_percentage,
      join_date,
      amount_invested: [{ amount, date: join_date || new Date() }],
    });

    return successResponse(res, "Investor added successfully", { investor });
  } catch (error) {
    return sendError(res, error.message);
  }
};

// 🔹 Add New Investment For existing investor
const addInvestment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, date } = req.body;

    console.log("Request body:", req.body); // <-- debug

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ success: false, message: "Amount is required and must be a number" });
    }

    const investor = await Investor.findById(id);
    if (!investor) return res.status(404).json({ success: false, message: "Investor not found" });

    // Push as proper object
    investor.amount_invested.push({
      amount: Number(amount),
      date: date ? new Date(date) : new Date()
    });

    await investor.save();

    return successResponse(res, "Investment added successfully", { investor });
  } catch (error) {
    return sendError(res, error.message);
  }
};



export const getInvestors = async (req, res) => {
  try {
    const investors = await Investor.find().sort({ createdAt: -1 }).lean();

    let totalInvestment = 0;
    let totalGrossProfit = 0;
    let totalNetProfit = 0;

    const investorDetails = await Promise.all(
      investors.map(async (inv) => {
        // Safely sum all invested amounts
        const totalInvested = Array.isArray(inv.amount_invested)
          ? inv.amount_invested.reduce((sum, item) => sum + (item.amount || 0), 0)
          : 0;
    
        // Get all profit records for this investor
        const profits = await investorProfit.find({ investor_id: inv._id }).lean();
    
        // Attach invoice_number from linked orders
        const profitsWithInvoice = await Promise.all(
          profits.map(async (p) => {
            let invoice_number = null;
            if (p.order_id) {
              const order = await Order.findById(p.order_id).select("invoice_number").lean();
              invoice_number = order?.invoice_number || null;
            }
            return { ...p, invoice_number };
          })
        );
    
        let grossProfitSum = 0;
        let netProfitSum = 0;
    
        profitsWithInvoice.forEach((p) => {
          grossProfitSum += p.gross_profit || 0;
          netProfitSum += p.net_profit || 0;
        });
    
        totalGrossProfit += grossProfitSum;
        totalNetProfit += netProfitSum;
    
        return {
          id: inv._id,
          name: inv.name,
          amount_invested: inv.amount_invested, 
          total_invested: totalInvested, 
          profit_percentage: inv.profit_percentage,
          join_date: inv.join_date,
          status: inv.status,
          totalGrossProfit: grossProfitSum,
          totalNetProfit: netProfitSum,
          profits: profitsWithInvoice,
        };
      })
    );    

    return successResponse(res, "Investors retrieved successfully", {
      investors: investorDetails,
      summary: {
        totalInvestment,
        totalGrossProfit,
        totalNetProfit,
      },
    });
  } catch (error) {
    return sendError(res, error.message);
  }
};


// 🔹 Edit Investor
const editInvestor = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Investor.findByIdAndUpdate(id, req.body, { new: true });

    if (!updated) return sendError(res, "Investor not found", 404);

    return successResponse(res, "Investor updated successfully", updated);
  } catch (error) {
    return sendError(res, error.message);
  }
};

// 🔹 Get Single Investor + Profit Summary + Investments
export const getInvestorById = async (req, res) => {
  try {
    const { id } = req.params;
    const investor = await Investor.findById(id).lean(); // lean for plain JS object

    if (!investor) return sendError(res, "Investor not found", 404);

    // Fetch profits for this investor
    const profitsRaw = await investorProfit.find({ investor_id: id })
      .sort({ month: -1 })
      .lean(); // lean() to get plain JS objects

    // Attach invoice_number for each profit record
    const profits = await Promise.all(
      profitsRaw.map(async (p) => {
        let invoice_number = null;
        if (p.order_id) {
          const order = await Order.findById(p.order_id).select("invoice_number");
          invoice_number = order ? order.invoice_number : null;
        }
        return { ...p, invoice_number };
      })
    );

    // Calculate totals
    let totalGrossProfit = 0;
    let totalNetProfit = 0;
    profits.forEach((p) => {
      totalGrossProfit += p.gross_profit || 0;
      totalNetProfit += p.net_profit || 0;
    });

    // Safely calculate total invested amount
    const totalInvested = Array.isArray(investor.amount_invested)
      ? investor.amount_invested.reduce((sum, item) => sum + (item.amount || 0), 0)
      : 0;

    // Return investments array (debit_credit)
    const investments = investor.debit_credit || [];

    return successResponse(res, "Investor retrieved successfully", {
      id: investor._id,
      name: investor.name,
      amount_invested: investor.amount_invested,
      total_invested: totalInvested, // ✅ total sum of all investments
      profit_percentage: investor.profit_percentage,
      join_date: investor.join_date,
      status: investor.status,
      profits,       // profits with invoice_number
      investments,   // all investment entries
      summary: {
        totalGrossProfit,
        totalNetProfit,
      },
    });
  } catch (error) {
    return sendError(res, error.message);
  }
};




// 🔹 Add Debit/Credit Transaction
const addDebitCredit = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount, note } = req.body;

    const investor = await Investor.findById(id);
    if (!investor) return sendError(res, "Investor not found", 404);

    investor.debit_credit.push({ type, amount, note });
    await investor.save();

    return successResponse(res, "Transaction added successfully", investor);
  } catch (error) {
    return sendError(res, error.message);
  }
};

// 🔹 Calculate & Distribute Monthly Profit
const calculateMonthlyProfit = async (req, res) => {
  try {
    const { month, sales } = req.body; // e.g. month = "2025-09"

    const investors = await Investor.find();
    if (investors.length === 0) return sendError(res, "No investors found");

    // Step 1: Total investment
    const totalInvestment = investors.reduce((sum, inv) => {
      const investedUpToMonth = inv.amount_invested
        .filter(i => new Date(i.date) <= new Date(`${month}-01`))
        .reduce((s, i) => s + i.amount, 0);
      inv._effective_investment = investedUpToMonth; // save for profit calculation
      return sum + investedUpToMonth;
    }, 0);

    // Step 2: Shared values
    const grossProfit = sales;
    const expense = (2 / 100) * sales;
    const charity = (10 / 100) * sales;
    const netProfit = grossProfit - expense - charity;

    let results = [];

    for (let inv of investors) {
      const eligibility = checkEligibility(inv.join_date, month);
      if (!eligibility) continue; // not eligible this month

      const percentage = (inv.amount_invested / totalInvestment) * 100;

      let grossShare = (grossProfit * percentage) / 100;
      if (eligibility === "half") {
        grossShare = grossShare / 2; // half month share
      }

      const expenseShare = (expense * percentage) / 100;
      const charityShare = (charity * percentage) / 100;
      const netShare = grossShare - expenseShare - charityShare;

      const investorShare = netShare * 0.5;
      const ownerShare = netShare * 0.5;

      inv.profits.push({
        month,
        sales,
        gross_profit: grossShare,
        expense: expenseShare,
        charity: charityShare,
        net_profit: netShare,
        investor_share: investorShare,
        owner_share: ownerShare,
        total: investorShare + ownerShare,
      });

      await inv.save();

      results.push({
        id: inv._id,
        name: inv.name,
        join_date: inv.join_date,
        eligibility,
        grossProfit: grossShare.toFixed(2),
        expense: expenseShare.toFixed(2),
        charity: charityShare.toFixed(2),
        netProfit: netShare.toFixed(2),
        investorShare: investorShare.toFixed(2),
        ownerShare: ownerShare.toFixed(2),
      });
    }

    return successResponse(res, "Monthly profit distributed", {
      summary: { sales, grossProfit, expense, charity, netProfit },
      details: results,
    });
  } catch (error) {
    return sendError(res, error.message);
  }
};

const investorController = {
  addInvestor,
  editInvestor,
  getInvestors,
  getInvestorById,
  addDebitCredit,
  addInvestment,
  calculateMonthlyProfit,
};

export default investorController;
