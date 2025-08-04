import { successResponse, sendError } from "../utils/response.js";
import { ProductModel as Product } from "../models/productModel.js";
import mongoose from "mongoose";


export const createProduct = async (req, res) => {
  try {
    const {
      company_id,
      generic_id,
      name,
      pack_size_id,
      carton_size,
      quantity_alert,
      barcode_symbology,
      item_code,
      product_type,
      retail_price,
      trade_price,
      wholesale_price,
      federal_tax,
      gst,
      sales_tax,
    } = req.body;

    // ✅ Required fields validation
    if (!name) {
      return sendError(
        res,
        "Name is required fields",
        400
      );
    }

    // ✅ Check for duplicate product name (case-insensitive)
    const existingProduct = await Product.findOne({ name: new RegExp(`^${name}$`, 'i') });
    if (existingProduct) {
      return sendError(res, "A product with this name already exists", 409); // 409 Conflict
    }

    const product = await Product.create({
      company_id,
      generic_id,
      name,
      pack_size_id,
      carton_size: carton_size || "",
      quantity_alert: quantity_alert || 0,
      barcode_symbology: barcode_symbology || "",
      item_code: item_code || "",
      product_type,
      retail_price,
      trade_price: trade_price || 0,
      wholesale_price: wholesale_price || 0,
      federal_tax: federal_tax || 0,
      gst: gst || 0,
      sales_tax: sales_tax || 0,
    });

    return successResponse(res, "Product created successfully", { product }, 201);
  } catch (error) {
    console.error("Create Product Error:", error);
    return sendError(res, "Failed to create product", 500);
  }
};


export const getAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const products = await Product.aggregate([
      // Lookup Company
      {
        $lookup: {
          from: "companies",
          localField: "company_id",
          foreignField: "_id",
          as: "company"
        }
      },
      { $unwind: { path: "$company", preserveNullAndEmptyArrays: true } },

      // Lookup Generic
      {
        $lookup: {
          from: "generics",
          localField: "generic_id",
          foreignField: "_id",
          as: "generic"
        }
      },
      { $unwind: { path: "$generic", preserveNullAndEmptyArrays: true } },

      // Lookup Product Type
      {
        $lookup: {
          from: "producttypes",
          localField: "product_type",
          foreignField: "_id",
          as: "productType"
        }
      },
      { $unwind: { path: "$productType", preserveNullAndEmptyArrays: true } },

      // Lookup Pack Size
      {
        $lookup: {
          from: "packsizes",
          localField: "pack_size_id",
          foreignField: "_id",
          as: "packSize"
        }
      },
      { $unwind: { path: "$packSize", preserveNullAndEmptyArrays: true } },

      // Lookup Batches
      {
        $lookup: {
          from: "batches",
          localField: "_id",
          foreignField: "product_id",
          as: "batches"
        }
      },

      // Add calculated stock
      {
        $addFields: {
          stock: {
            $sum: {
              $map: {
                input: "$batches",
                as: "batch",
                in: { $ifNull: ["$$batch.stock", 0] }
              }
            }
          }
        }
      },

      // Pagination
      { $skip: skip },
      { $limit: limit }
    ]);

    // Get total products count
    const totalProducts = await Product.countDocuments();
    const totalPages = Math.ceil(totalProducts / limit);
    const hasMore = page < totalPages;

    return successResponse(res, "Products fetched successfully", {
      products,
      currentPage: page,
      totalPages,
      totalItems: totalProducts,
      pageSize: limit,
      hasMore
    });
  } catch (error) {
    console.error("Get Products Error:", error);
    return sendError(res, "Failed to fetch products", 500);
  }
};


export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      // Lookup Company
      {
        $lookup: {
          from: "companies",
          localField: "company_id",
          foreignField: "_id",
          as: "company"
        }
      },
      { $unwind: { path: "$company", preserveNullAndEmptyArrays: true } },

      // Lookup Generic
      {
        $lookup: {
          from: "generics",
          localField: "generic_id",
          foreignField: "_id",
          as: "generic"
        }
      },
      { $unwind: { path: "$generic", preserveNullAndEmptyArrays: true } },

      // Lookup Product Type
      {
        $lookup: {
          from: "producttypes",
          localField: "product_type",
          foreignField: "_id",
          as: "product_type"  // Changed to match your schema
        }
      },
      { $unwind: { path: "$product_type", preserveNullAndEmptyArrays: true } },

      // Lookup Pack Size
      {
        $lookup: {
          from: "packsizes",
          localField: "pack_size_id",
          foreignField: "_id",
          as: "pack_size"  // Changed to match your schema
        }
      },
      { $unwind: { path: "$pack_size", preserveNullAndEmptyArrays: true } },

      // Lookup Batches
      {
        $lookup: {
          from: "batches",
          localField: "_id",
          foreignField: "product_id",
          as: "batches"
        }
      },

      // Add calculated stock
      {
        $addFields: {
          current_stock: {  // Changed to match your schema
            $sum: "$batches.quantity"  // Simplified
          },
          // Add calculated sale price
          calculated_sale_price: {
            $add: [
              "$retail_price",
              { $multiply: ["$retail_price", { $divide: ["$sales_tax", 100] }] }
            ]
          }
        }
      }
    ]);

    if (!product || product.length === 0) {
      return sendError(res, "Product not found", 404);
    }

    return successResponse(res, "Product fetched successfully", { 
      product: product[0]  // Return first (and only) document
    }, 200);
  } catch (error) {
    console.error("Get Product Error:", error);
    return sendError(res, "Failed to fetch product", 500);
  }
};

export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!product) return sendError(res, "Product not found", 404);
    return successResponse(res, "Product updated successfully", { product }, 200);
  } catch (error) {
    console.error("Update Product Error:", error);
    return sendError(res, "Failed to update product", 500);
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return sendError(res, "Product not found", 404);
    return successResponse(res, "Product deleted successfully", null, 200);
  } catch (error) {
    console.error("Delete Product Error:", error);
    return sendError(res, "Failed to delete product", 500);
  }
};


const productController = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};

export default productController;