import { User } from "../models/userModel.js";
import { UserLedger } from "../models/userLedgerModel.js";
import { sendError, successResponse } from "../utils/response.js";

const addUserLedger = async (req, res) => {
  try {
    const { user_id, description, debit, credit, incentive_amount, order_id } = req.body;

    // Check if user exists
    const user = await User.findById(user_id);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Create new ledger entry
    const newEntry = await UserLedger.create({
      user_id,
      description,
      debit,
      credit,
      incentive_amount,
      order_id,
      total_balance: `${Math.abs(credit - debit)} ${credit >= debit ? "CR" : "DB"}`
    });

    return successResponse(res, "Ledger entry added successfully", { newEntry });
  } catch (error) {
    return sendError(res, error.message);
  }
}



// Get all ledger entries for a specific user with calculated balance
const getUserLedgers = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Get all ledger entries for the user
    const ledgers = await UserLedger.find({ user_id: id }).sort({ date: -1 });

    // Calculate totals
    let totalCredit = 0;
    let totalDebit = 0;

    ledgers.forEach(entry => {
      totalCredit += entry.credit;
      totalDebit += entry.debit;
    });

    const balance = totalCredit - totalDebit;
    const balanceDisplay = `${Math.abs(balance)} ${balance >= 0 ? "CR" : "DB"}`;

    return successResponse(res, "User ledgers retrieved successfully", {
      ledgers,
      summary: {
        totalCredit,
        totalDebit,
        currentBalance: balanceDisplay
      }
    });
  } catch (error) {
    return sendError(res, error.message);
  }
}


// Edit an existing ledger entry
const editUserLedger = async (req, res) => {
  try {
    const { id } = req.params; // Ledger entry ID
    const { description, debit, credit, incentive_amount, order_id } = req.body;

    // Find ledger entry
    const ledgerEntry = await UserLedger.findById(id);
    if (!ledgerEntry) {
      return sendError(res, "Ledger entry not found", 404);
    }

    // Optional: Check if related user exists
    const user = await User.findById(ledgerEntry.user_id);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Update fields
    ledgerEntry.description = description ?? ledgerEntry.description;
    ledgerEntry.debit = debit ?? ledgerEntry.debit;
    ledgerEntry.credit = credit ?? ledgerEntry.credit;
    ledgerEntry.incentive_amount = incentive_amount ?? ledgerEntry.incentive_amount;
    ledgerEntry.order_id = order_id ?? ledgerEntry.order_id;

    // Recalculate total_balance
    ledgerEntry.total_balance = `${Math.abs(ledgerEntry.credit - ledgerEntry.debit)} ${ledgerEntry.credit >= ledgerEntry.debit ? "CR" : "DB"}`;

    await ledgerEntry.save();

    return successResponse(res, "Ledger entry updated successfully", { updatedEntry: ledgerEntry });
  } catch (error) {
    return sendError(res, error.message);
  }
};


const userLedgerController = {
  addUserLedger,
  getUserLedgers,
  editUserLedger
};

export default userLedgerController;
