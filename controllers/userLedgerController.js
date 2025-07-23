import { User } from "../models/userModel.js";
import { UserLedger } from "../models/userLedgerModel.js";
import { sendError, successResponse } from "../utils/response.js";
import moment from "moment";

// UPDATE or CREATE User Ledger Entry
const updateUserLedger = async (req, res) => {
  try {
    const {
      user_id,
      gross_salary,
      incentive,
      advance,
      advance_date
    } = req.body;

    if (!user_id) return sendError(res, "User ID is required");

    const user = await User.findById(user_id);
    if (!user) return sendError(res, "User not found");

    let data = {};
    let month = moment().month(); // 0-indexed
    let year = moment().year();

    if (gross_salary !== undefined && gross_salary !== null)
      data.gross_salary = gross_salary;

    if (incentive !== undefined && incentive !== null)
      data.incentive = incentive;

    if (
      advance !== undefined &&
      advance !== null &&
      advance_date !== undefined &&
      advance_date !== null
    ) {
      data.advance = advance;
      data.advance_date = advance_date;

      const parsed = moment(advance_date);
      month = parsed.month(); // 0-indexed
      year = parsed.year();
    }

    const startOfMonth = moment({ year, month }).startOf("month").toDate();
    const endOfMonth = moment({ year, month }).endOf("month").toDate();

    let existingLedger = await UserLedger.findOne({
      user_id,
      createdAt: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
    });

    if (existingLedger) {
      await UserLedger.updateOne({ _id: existingLedger._id }, { $set: data });
    } else {
      data.user_id = user_id;
      data.salary = user.salary;
      await UserLedger.create(data);
    }

    successResponse(res, "Ledger updated successfully");
  } catch (error) {
    console.error("Update Ledger Error:", error);
    sendError(res, "Update Ledger Error", error);
  }
};

const userLedgerController = {
  updateUserLedger,
};

export default userLedgerController;
