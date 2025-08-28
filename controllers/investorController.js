import Investor from "../models/investorModel.js";
import { sendError, successResponse } from "../utils/response.js";

// ✅ Utility function for recalculating profit distribution
const calculateInvestorShares = async (investor) => {
  // Example logic (you can replace with your business rules)
  const gross = investor.gross_profit_share || 0;

  // Split into self vs shared pool
  investor.self_profit_amount = (gross * (investor.self_profit_percentage / 100)).toFixed(2);
  const sharedPortion = gross * (investor.shared_profit_percentage / 100);

  // Expenses & donation deducted proportionally
  investor.expense_share = investor.expense_share || 0;
  investor.donation_share = investor.donation_share || 0;

  investor.net_profit_share = sharedPortion - investor.expense_share - investor.donation_share;

  // Final total payable = net + self
  investor.final_total = investor.net_profit_share + parseFloat(investor.self_profit_amount);

  return investor;
};

// Add Investor
const addInvestor = async (req, res) => {
  try {
    const {
      name,
      investment_amount,
      percentage_share,
      self_profit_percentage,
      shared_profit_percentage,
      gross_profit_share,
      expense_share,
      donation_share,
    } = req.body;

    let investor = new Investor({
      name,
      investment_amount,
      percentage_share,
      self_profit_percentage,
      shared_profit_percentage,
      gross_profit_share,
      expense_share,
      donation_share,
    });

    investor = await calculateInvestorShares(investor);

    await investor.save();

    return successResponse(res, "Investor added successfully", { investor });
  } catch (error) {
    return sendError(res, error.message);
  }
};

// Get all Investors
const getInvestors = async (req, res) => {
  try {
    const investors = await Investor.find().sort({ createdAt: -1 });

    let totalInvestment = 0;
    let totalGrossProfit = 0;
    let totalNetProfit = 0;

    investors.forEach((inv) => {
      totalInvestment += inv.investment_amount;
      totalGrossProfit += inv.gross_profit_share;
      totalNetProfit += inv.net_profit_share;
    });

    return successResponse(res, "Investors retrieved successfully", {
      investors,
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

// Edit Investor
const editInvestor = async (req, res) => {
  try {
    const { id } = req.params;

    let investor = await Investor.findById(id);
    if (!investor) {
      return sendError(res, "Investor not found", 404);
    }

    const {
      name,
      investment_amount,
      percentage_share,
      self_profit_percentage,
      shared_profit_percentage,
      gross_profit_share,
      expense_share,
      donation_share,
    } = req.body;

    // Update fields if provided
    if (name) investor.name = name;
    if (investment_amount !== undefined) investor.investment_amount = investment_amount;
    if (percentage_share !== undefined) investor.percentage_share = percentage_share;
    if (self_profit_percentage !== undefined) investor.self_profit_percentage = self_profit_percentage;
    if (shared_profit_percentage !== undefined) investor.shared_profit_percentage = shared_profit_percentage;
    if (gross_profit_share !== undefined) investor.gross_profit_share = gross_profit_share;
    if (expense_share !== undefined) investor.expense_share = expense_share;
    if (donation_share !== undefined) investor.donation_share = donation_share;

    investor = await calculateInvestorShares(investor);

    await investor.save();

    return successResponse(res, "Investor updated successfully", { investor });
  } catch (error) {
    return sendError(res, error.message);
  }
};

const investorController = {
  addInvestor,
  getInvestors,
  editInvestor,
};

export default investorController;
