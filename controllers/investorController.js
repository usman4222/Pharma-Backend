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
    const { name, amount, profit_percentage, join_date, type } = req.body;

    // Validate required fields
    if (!name || !amount || !profit_percentage || !join_date || !type) {
      return sendError(
        res,
        "Name, amount, profit percentage, join date and type are required",
        400
      );
    }

    // Validate type
    if (!["company", "investor"].includes(type)) {
      return sendError(res, "Invalid type. Must be 'company' or 'investor'", 400);
    }

    // 🔹 Prevent multiple "company" docs
    if (type === "company") {
      const existingCompany = await Investor.findOne({ type: "company" });
      if (existingCompany) {
        return sendError(res, "A company record already exists. Only one company is allowed.", 400);
      }
    }

    // 🔹 Check if an investor with the same name already exists
    const existingInvestor = await Investor.findOne({ name });
    if (existingInvestor) {
      return sendError(res, "Investor with this name already exists", 400);
    }

    // 🔹 Create new investor
    const investor = await Investor.create({
      name,
      profit_percentage,
      join_date,
      type,
      amount_invested: [{ amount, date: join_date || new Date() }],
    });

    return successResponse(res, "Investor added successfully", { investor });
  } catch (error) {
    console.error("Add investor error:", error);
    return sendError(res, error.message);
  }
};



// 🔹 Add New Investment For existing investor
const addInvestment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, date } = req.body;

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ success: false, message: "Amount is required and must be a number" });
    }

    const investor = await Investor.findById(id);
    if (!investor) return res.status(404).json({ success: false, message: "Investor not found" });

    // Ensure amount_invested is an array
    if (!Array.isArray(investor.amount_invested)) {
      investor.amount_invested = [];
    }

    // Push new investment
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
    let totalCredit = 0;
    let totalDebit = 0;

    const investorDetails = await Promise.all(
      investors.map(async (inv) => {
        // Safely sum all invested amounts
        const totalInvested = Array.isArray(inv.amount_invested)
          ? inv.amount_invested.reduce((sum, item) => sum + (item.amount || 0), 0)
          : 0;

        totalInvestment += totalInvested;

        // Get all profit records for this investor
        const profits = await investorProfit.find({ investor_id: inv._id }).lean();

        // Attach invoice_number from linked orders
        const profitsWithInvoice = await Promise.all(
          profits.map(async (p) => {
            let invoice_number = null;
            if (p.order_id) {
              const order = await Order.findById(p.order_id)
                .select("invoice_number")
                .lean();
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
        totalCredit += inv.credit || 0;
        totalDebit += inv.debit || 0;

        return {
          id: inv._id,
          name: inv.name,
          amount_invested: inv.amount_invested,
          total_invested: totalInvested,
          profit_percentage: inv.profit_percentage,
          join_date: inv.join_date,
          status: inv.status,
          type: inv.type,

          // 💰 balances
          debit: inv.debit || 0,
          credit: inv.credit || 0,
          net_balance: (inv.credit || 0) - (inv.debit || 0),

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
        totalCredit,
        totalDebit,
        netBalance: totalCredit - totalDebit,
      },
    });
  } catch (error) {
    return sendError(res, error.message);
  }
};


export const updateInvestment = async (req, res) => {
  try {
    const { investorId, investmentId } = req.params;
    const { amount, date } = req.body;

    // Validate amount
    if (amount !== undefined && amount <= 0) {
      return sendError(res, "Amount must be a positive number", 400);
    }

    const investor = await Investor.findById(investorId);
    if (!investor) return sendError(res, "Investor not found", 404);

    // Find the specific investment in the array
    const investment = investor.amount_invested.id(investmentId);
    if (!investment) return sendError(res, "Investment not found", 404);

    // Update fields if provided
    if (amount !== undefined) investment.amount = amount;
    if (date) investment.date = new Date(date);

    // Save the investor
    await investor.save();

    return successResponse(res, "Investment updated successfully", { investor });
  } catch (error) {
    return sendError(res, error.message);
  }
};



// 🔹 Edit Investor
const editInvestor = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, profit_percentage, join_date } = req.body;

    const investor = await Investor.findById(id);
    if (!investor) return sendError(res, "Investor not found", 404);

    // Update only the provided fields
    if (name) investor.name = name;
    if (profit_percentage !== undefined) investor.profit_percentage = profit_percentage;
    if (join_date) investor.join_date = new Date(join_date);

    // Save without touching amount_invested
    await investor.save();

    return successResponse(res, "Investor updated successfully", investor);
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
          const order = await Order.findById(p.order_id).select("invoice_number").lean();
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

    // ✅ Debit / Credit balances
    const debit = investor.debit || 0;
    const credit = investor.credit || 0;
    const net_balance = credit - debit;

    // ✅ All debit_credit entries (manual adjustments / payments)
    const transactions = investor.debit_credit || [];

    return successResponse(res, "Investor retrieved successfully", {
      id: investor._id,
      name: investor.name,
      amount_invested: investor.amount_invested,
      total_invested: totalInvested,
      profit_percentage: investor.profit_percentage,
      join_date: investor.join_date,
      status: investor.status,

      // 💰 balances
      debit,
      credit,
      net_balance,

      profits,        // profits with invoice_number
      transactions,   // full debit_credit history

      summary: {
        totalGrossProfit,
        totalNetProfit,
      },
    });
  } catch (error) {
    return sendError(res, error.message);
  }
};

// ✅ Add Debit/Credit Entry Controller (incremental)
export const addInvestorLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount, note, date } = req.body;

    if (!type || !["debit", "credit"].includes(type)) {
      return sendError(res, "Invalid type. Must be 'debit' or 'credit'", 400);
    }
    if (!amount || amount <= 0) {
      return sendError(res, "Amount must be greater than 0", 400);
    }

    const investor = await Investor.findById(id);
    if (!investor) return sendError(res, "Investor not found", 404);

    // 🔹 Add entry to ledger
    investor.debit_credit.push({
      type,
      amount,
      note,
      date: date || new Date(),
    });

    // 🔹 Apply the new transaction to existing balances
    if (type === "credit") {
      investor.credit = (investor.credit || 0) + amount;
    } else if (type === "debit") {
      if ((investor.credit || 0) >= amount) {
        investor.credit -= amount;
      } else {
        const remaining = amount - (investor.credit || 0);
        investor.credit = 0;
        investor.debit = (investor.debit || 0) + remaining;
      }
    }

    investor.net_balance = (investor.credit || 0) - (investor.debit || 0);

    await investor.save();

    return successResponse(res, "Ledger entry added successfully", { investor });
  } catch (error) {
    return sendError(res, error.message);
  }
};




// ✅ Edit Debit/Credit Entry Controller (incremental)
export const editInvestorLedger = async (req, res) => {
  try {
    const { id, entryId } = req.params; // investor id & ledger entry id
    const { type, amount, note, date } = req.body;

    if (!type || !["debit", "credit"].includes(type)) {
      return sendError(res, "Invalid type. Must be 'debit' or 'credit'", 400);
    }
    if (!amount || amount <= 0) {
      return sendError(res, "Amount must be greater than 0", 400);
    }

    const investor = await Investor.findById(id);
    if (!investor) return sendError(res, "Investor not found", 404);

    // 🔹 Find ledger entry
    const entry = investor.debit_credit.id(entryId);
    if (!entry) return sendError(res, "Ledger entry not found", 404);

    // 🔹 Revert the old entry effect
    if (entry.type === "credit") {
      investor.credit -= entry.amount;
    } else if (entry.type === "debit") {
      if (investor.debit >= entry.amount) {
        investor.debit -= entry.amount;
      } else {
        const remaining = entry.amount - investor.debit;
        investor.debit = 0;
        investor.credit += remaining; // revert if debit had consumed credit
      }
    }

    // 🔹 Update entry values
    entry.type = type;
    entry.amount = amount;
    entry.note = note;
    entry.date = date || new Date();

    // 🔹 Apply new entry effect
    if (type === "credit") {
      investor.credit += amount;
    } else if (type === "debit") {
      if (investor.credit >= amount) {
        investor.credit -= amount;
      } else {
        const remaining = amount - investor.credit;
        investor.credit = 0;
        investor.debit += remaining;
      }
    }

    // 🔹 Recalculate net balance
    investor.net_balance = (investor.credit || 0) - (investor.debit || 0);

    await investor.save();

    return successResponse(res, "Ledger entry updated successfully", { investor });
  } catch (error) {
    return sendError(res, error.message);
  }
};


// 🔹 Get all transactions for a single investor
export const getInvestorTransactions = async (req, res) => {
  try {
    const { id } = req.params; // investor id
    const investor = await Investor.findById(id).lean();

    if (!investor) return sendError(res, "Investor not found", 404);

    // Return all debit/credit entries
    return successResponse(res, "Transactions retrieved successfully", {
      investor: {
        id: investor._id,
        name: investor.name,
        credit: investor.credit,
        debit: investor.debit,
        net_balance: (investor.credit || 0) - (investor.debit || 0),
        transactions: investor.debit_credit || [],
      },
    });
  } catch (error) {
    return sendError(res, error.message);
  }
};

// 🔹 Get single transaction for investor
export const getInvestorTransactionById = async (req, res) => {
  try {
    const { id, transactionId } = req.params;

    const investor = await Investor.findById(id).lean();
    if (!investor) return sendError(res, "Investor not found", 404);

    const transaction = investor.debit_credit.find(
      (t) => t._id.toString() === transactionId
    );

    if (!transaction) return sendError(res, "Transaction not found", 404);

    return successResponse(res, "Transaction retrieved successfully", {
      investor: { id: investor._id, name: investor.name },
      transaction,
    });
  } catch (error) {
    return sendError(res, error.message);
  }
};


// ✅ Delete Debit/Credit Entry Controller
export const deleteInvestorLedger = async (req, res) => {
  try {
    const { id, entryId } = req.params; // investor id & ledger entry id

    const investor = await Investor.findById(id);
    if (!investor) return sendError(res, "Investor not found", 404);

    // 🔹 Remove the ledger entry
    const entry = investor.debit_credit.id(entryId);
    if (!entry) return sendError(res, "Ledger entry not found", 404);

    investor.debit_credit.pull({ _id: entryId });

    // 🔹 Recalculate balances from all remaining transactions
    let creditTotal = 0;
    let debitTotal = 0;

    for (const tx of investor.debit_credit) {
      if (tx.type === "credit") {
        creditTotal += tx.amount;
      } else if (tx.type === "debit") {
        if (creditTotal >= tx.amount) {
          creditTotal -= tx.amount;
        } else {
          debitTotal += tx.amount - creditTotal;
          creditTotal = 0;
        }
      }
    }

    investor.credit = creditTotal;
    investor.debit = debitTotal;
    investor.net_balance = creditTotal - debitTotal;

    await investor.save();

    return successResponse(res, "Ledger entry deleted successfully", { investor });
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
  addInvestorLedger,
  addInvestment,
  calculateMonthlyProfit,
  updateInvestment,
  getInvestorTransactions,
  getInvestorTransactionById,
  editInvestorLedger,
  deleteInvestorLedger
};

export default investorController;
