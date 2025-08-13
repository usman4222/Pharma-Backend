import Companies from "../models/companyModel.js";
import { sendError, successResponse } from "../utils/response.js";

// Create Company
export const createCompany = async (req, res) => {
  try {
    console.log("REQ.FILE:", req.file);
    console.log("REQ.BODY:", req.body);

    const { name, ptcl_number, phone_number, address, email, city } = req.body;

    if (!name) {
      return sendError(res, "Company name is required", 400);
    }

    const company = await Companies.create({
      name,
      ptcl_number: ptcl_number || "",
      phone_number: phone_number || "",
      address: address || "",
      email: email || "",
      city: city || "",
      company_logo: req.file ? `/uploads/company/${req.file.filename}` : "",
    });

    return successResponse(res, "Company created successfully", { company }, 201);
  } catch (error) {
    console.error("Create Company Error:", error);
    return sendError(res, "Failed to create company", 500);
  }
};


// Get All Companies with Pagination
export const getAllCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const companies = await Companies.find().skip(skip).limit(limit).sort({ createdAt: -1 });
    const totalItems = await Companies.countDocuments();
    const totalPages = Math.ceil(totalItems / limit);
    const hasMore = page < totalPages;

    return successResponse(res, "Companies fetched successfully", {
      companies,
      currentPage: page,
      totalPages,
      totalItems,
      pageSize: limit,
      hasMore,
    });
  } catch (error) {
    console.error("Get All Companies Error:", error);
    return sendError(res, "Failed to fetch companies", 500);
  }
};

// Get Single Company by ID
export const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Companies.findById(id);

    if (!company) return sendError(res, "Company not found", 404);

    return successResponse(res, "Company fetched successfully", { company }, 200);
  } catch (error) {
    console.error("Get Company By ID Error:", error);
    return sendError(res, "Failed to fetch company", 500);
  }
};

// Update Company
export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {};

    if (req.body.name) updateData.name = req.body.name;
    if (req.body.ptcl_number !== undefined) updateData.ptcl_number = req.body.ptcl_number;
    if (req.body.phone_number !== undefined) updateData.phone_number = req.body.phone_number;
    if (req.body.address !== undefined) updateData.address = req.body.address;
    if (req.body.image !== undefined) updateData.image = req.body.image;
    if (req.body.email !== undefined) updateData.email = req.body.email;
    if (req.body.city_id !== undefined) updateData.city_id = req.body.city_id;

    if (Object.keys(updateData).length === 0) {
      return sendError(res, "At least one field must be provided for update", 400);
    }

    const company = await Companies.findByIdAndUpdate(id, updateData, { new: true });

    if (!company) return sendError(res, "Company not found", 404);

    return successResponse(res, "Company updated successfully", { company }, 200);
  } catch (error) {
    console.error("Update Company Error:", error);
    return sendError(res, "Failed to update company", 500);
  }
};

// Delete Company
export const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    const company = await Companies.findByIdAndDelete(id);

    if (!company) return sendError(res, "Company not found", 404);

    return successResponse(res, "Company deleted successfully", {}, 200);
  } catch (error) {
    console.error("Delete Company Error:", error);
    return sendError(res, "Failed to delete company", 500);
  }
};

const companyController = {
  createCompany,
  getAllCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
};

export default companyController;
