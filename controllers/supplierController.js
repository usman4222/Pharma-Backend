import { SupplierModel } from "../models/supplierModel.js";
import { sendError, successResponse } from "../utils/response.js";

export const getAllSuppliers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {
      $or: [{ role: "supplier" }, { role: "both" }],
    };

    const suppliers = await SupplierModel.find(filter)
      .populate("area_id city_id")
      .skip(skip)
      .limit(limit);

    const totalSuppliers = await SupplierModel.countDocuments(filter);
    const totalPages = Math.ceil(totalSuppliers / limit);
    const hasMore = page < totalPages;

    return successResponse(res, "Suppliers fetched successfully", {
      suppliers,
      currentPage: page,
      totalPages,
      totalItems: totalSuppliers,
      pageSize: limit,
      hasMore,
    });
  } catch (error) {
    console.error("Fetch Suppliers Error:", error);
    return sendError(res, "Failed to fetch suppliers", 500);
  }
};

export const getSupplierById = async (req, res) => {
  try {
    const supplier = await SupplierModel.findById(req.params.id);
    // .populate("area_id city_id");
    if (!supplier) return sendError(res, "Supplier not found", 404);
    return successResponse(res, "Supplier fetched", { supplier });
  } catch (error) {
    console.error("Get Supplier Error:", error);
    return sendError(res, "Error fetching supplier", 500);
  }
};

export const createSupplier = async (req, res) => {
  try {
    const {
      name,
      email,
      phone_number,
      ptcl_number,
      address,
      area_id,
      city_id,
      booker_id,
      licence_number,
      licence_expiry,
      ntn_number,
      role,
      opening_balance,
      credit_period,
      credit_limit,
      cnic,
    } = req.body;

    // ✅ Required field validation
    if (!name) {
      return sendError(res, "Supplier name is required", 400);
    }

    // ✅ Prepare data conditionally (only include ObjectId fields if valid)
    const supplierData = {
      name,
      email: email || "",
      phone_number: phone_number || "",
      ptcl_number: ptcl_number || "",
      address: address || "",
      licence_number: licence_number || "",
      licence_expiry: licence_expiry || "",
      ntn_number: ntn_number || "",
      role: role || "supplier",
      opening_balance: opening_balance || 0,
      credit_period: credit_period || 0,
      credit_limit: credit_limit || 0,
      cnic: cnic || "",
      status: "active",
    };

    // ✅ Only assign valid ObjectIds
    if (area_id) supplierData.area_id = area_id;
    if (city_id) supplierData.city_id = city_id;
    if (booker_id) supplierData.booker_id = booker_id;

    const supplier = await SupplierModel.create(supplierData);

    return successResponse(
      res,
      "Supplier created successfully",
      { supplier },
      201
    );
  } catch (error) {
    console.error("Create Supplier Error:", error);
    return sendError(res, "Failed to create supplier", 500);
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = await SupplierModel.findById(id);
    if (!supplier) return sendError(res, "Supplier not found", 404);

    const input = {
      ...req.body,
      licence_photo: req.body.licence_photo || "", // Expected from frontend if updated
    };

    await supplier.updateOne(input);
    return successResponse(res, "Supplier updated successfully", { supplier });
  } catch (error) {
    console.error("Update Supplier Error:", error);
    return sendError(res, "Failed to update supplier", 500);
  }
};

export const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = await SupplierModel.findById(id);
    if (!supplier) return sendError(res, "Supplier not found", 404);

    await supplier.deleteOne();
    return successResponse(res, "Supplier deleted successfully");
  } catch (error) {
    console.error("Delete Supplier Error:", error);
    return sendError(res, "Failed to delete supplier", 500);
  }
};

export const toggleSupplierStatus = async (req, res) => {
  try {
    const { id, status } = req.body;

    const supplier = await SupplierModel.findById(id);
    if (!supplier) return sendError(res, "Supplier not found", 404);

    supplier.status = status;
    await supplier.save();

    return successResponse(res, "Status updated successfully", { status });
  } catch (error) {
    console.error("Toggle Status Error:", error);
    return sendError(res, "Failed to update status", 500);
  }
};

export const searchSuppliers = async (req, res) => {
  try {
    const { search } = req.query;

    const suppliers = await SupplierModel.find({
      $and: [
        {
          $or: [
            { name: new RegExp(search, "i") },
            { email: new RegExp(search, "i") },
          ],
        },
        {
          $or: [{ role: "supplier" }, { role: "both" }],
        },
      ],
    })
      .limit(10)
      .populate("area_id");

    return successResponse(res, "Search results", { suppliers });
  } catch (error) {
    console.error("Search Suppliers Error:", error);
    return sendError(res, "Failed to search suppliers", 500);
  }
};

const supplierController = {
  getAllSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  searchSuppliers,
  toggleSupplierStatus,
};

export default supplierController;
