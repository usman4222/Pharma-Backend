import { SupplierModel } from "../models/supplierModel.js";
import { sendError, successResponse } from "../utils/response.js";

// Fetch paginated customer list
export const getAllCustomers = async (req, res) => {
  try {
    const filter = {
      $or: [{ role: "customer" }, { role: "both" }],
    };

    // Fetch all matching customers 
    const customers = await SupplierModel.find(filter)
      .populate('area_id', 'name city description')
      .populate('booker_id', 'name');

    // Total count of customers (optional, just for info)
    const totalCustomers = customers.length;

    return successResponse(res, "Customers fetched successfully", {
      customers,
      totalItems: totalCustomers,
    });
  } catch (error) {
    console.error("Fetch Customers Error:", error);
    return sendError(res, "Failed to fetch customers", 500);
  }
};


// Get all customers without pagination (for dropdowns etc.)
export const getCustomerList = async (req, res) => {
  try {
    const customers = await SupplierModel.find({
      $or: [{ role: "customer" }, { role: "both" }],
    }).populate("booker_id");

    return successResponse(res, "Customers fetched", { customers });
  } catch (error) {
    console.error("Get Customers Error:", error);
    return sendError(res, "Error fetching customers", 500);
  }
};

// Get single customer for edit
export const editCustomer = async (req, res) => {
  try {
    const customer = await SupplierModel.findById(req.params.id)
      .populate("area_id city_id booker_id");

    if (!customer) return sendError(res, "Customer not found", 404);

    return successResponse(res, "Customer fetched", { customer });
  } catch (error) {
    console.error("Edit Customer Error:", error);
    return sendError(res, "Failed to fetch customer", 500);
  }
};

// Show customer with purchases (optional)
export const showCustomer = async (req, res) => {
  try {
    const customer = await SupplierModel.findById(req.params.id)
    //   .populate("booker_id");

    if (!customer) return sendError(res, "Customer not found", 404);

    // TODO: if you have a purchase/order model, populate or query them here

    return successResponse(res, "Customer detail", { customer });
  } catch (error) {
    console.error("Show Customer Error:", error);
    return sendError(res, "Failed to fetch customer details", 500);
  }
};

// Create new customer
export const createCustomer = async (req, res) => {
  try {
    const {
      owner1_name,
      owner2_name,
      owner1_phone_number,
      owner2_phone_number,
      email,
      phone_number,
      ptcl_number,
      address,
      area_id,
      city,
      status,
      licence_number,
      licence_expiry,
      ntn_number,
      role,
      opening_balance,
      credit_period,
      credit_limit,
      cnic,
      booker_id,
    } = req.body || {};

    if (!owner1_name) {
      return sendError(res, "Name are required fields.");
    }

    if (!booker_id) {
      return sendError(res, "Booker is required.");
    }

    if (email && email.trim()) {
      const existing = await SupplierModel.findOne({ email: email.trim() });

      // also guard against matching empty strings in DB
      if (existing && existing.email.trim() !== "") {
        return sendError(res, "Customer with same email already exists", 400);
      }
    }


    // 📦 Prepare supplier data
    const customerData = {
      owner1_name,
      owner2_name: owner2_name || "",
      owner1_phone_number: owner1_phone_number || "",
      owner2_phone_number: owner2_phone_number || "",
      email: email || "",
      phone_number: phone_number || "",
      ptcl_number: ptcl_number || "",
      address: address || "",
      area_id,
      city,
      booker_id,
      licence_number: licence_number || "",
      licence_expiry: licence_expiry || "",
      ntn_number: ntn_number || "",
      role: role || "supplier",
      opening_balance: opening_balance || 0,
      credit_period: credit_period || 0,
      credit_limit: credit_limit || 0,
      cnic: cnic || "",
      status: status || "active",
      licence_photo: req.file ? `/uploads/customers/${req.file.filename}` : "",
    };

    const customer = await SupplierModel.create(customerData);
    return successResponse(res, "Customer created", { customer }, 201);
  } catch (error) {
    console.error("Create Customer Error:", error);
    return sendError(res, "Failed to create customer", 500);
  }
};

// Update customer
export const updateCustomer = async (req, res) => {
  try {
    const customer = await SupplierModel.findById(req.params.id);
    if (!customer) return sendError(res, "Customer not found", 404);

    const updateData = {
      ...req.body,
    };

    if (req.file) {
      updateData.licence_photo = req.file.filename;
    }

    await customer.updateOne(updateData);

    // ✅ Refetch updated customer
    const updatedCustomer = await SupplierModel.findById(req.params.id);

    return successResponse(res, "Customer updated successfully", { customer: updatedCustomer });
  } catch (error) {
    console.error("Update Customer Error:", error);
    return sendError(res, "Failed to update customer", 500);
  }
};

// Delete customer
export const deleteCustomer = async (req, res) => {
  try {
    const customer = await SupplierModel.findById(req.params.id);
    if (!customer) return sendError(res, "Customer not found", 404);

    await customer.deleteOne();
    return successResponse(res, "Customer deleted successfully");
  } catch (error) {
    console.error("Delete Customer Error:", error);
    return sendError(res, "Failed to delete customer", 500);
  }
};

// Toggle status (active/inactive)
export const toggleCustomerStatus = async (req, res) => {
  try {
    const { id, status } = req.body;
    const customer = await SupplierModel.findById(id);
    if (!customer) return sendError(res, "Customer not found", 404);

    customer.status = status;
    await customer.save();

    return successResponse(res, "Status updated", { status });
  } catch (error) {
    console.error("Toggle Status Error:", error);
    return sendError(res, "Failed to update status", 500);
  }
};

// Search customers
export const searchCustomers = async (req, res) => {
  try {
    const { search } = req.query;

    const customers = await SupplierModel.find({
      $and: [
        {
          $or: [
            { name: new RegExp(search, "i") },
            { email: new RegExp(search, "i") },
          ],
        },
        {
          $or: [{ role: "customer" }, { role: "both" }],
        },
      ],
    })
      .limit(10)
      .populate("area_id");

    return successResponse(res, "Search results", { customers });
  } catch (error) {
    console.error("Search Customers Error:", error);
    return sendError(res, "Failed to search customers", 500);
  }
};

// Export all
const customerController = {
  getAllCustomers,
  getCustomerList,
  editCustomer,
  showCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  toggleCustomerStatus,
  searchCustomers,
};

export default customerController;
