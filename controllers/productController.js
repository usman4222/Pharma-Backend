import { successResponse, sendError } from "../utils/response.js";
import { ProductModel as Product } from "../models/productModel.js";


export const createProduct = async (req, res) => {
    try {
      const {
        company_id,
        generic_id,
        name,
        pack_size,
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
      if (!company_id || !name || !pack_size || !product_type || retail_price === undefined) {
        return sendError(
          res,
          "company_id, name, pack_size, product_type, and retail_price are required fields",
          400
        );
      }
  
      const product = await Product.create({
        company_id,
        generic_id,
        name,
        pack_size,
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
  
      console.log("product", product);
  
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
  
      const products = await Product.find()
        .populate("companyId genericId productType")
        .skip(skip)
        .limit(limit);
  
      const totalProducts = await Product.countDocuments();
      const totalPages = Math.ceil(totalProducts / limit);
      const hasMore = page < totalPages;
  
      return successResponse(res, "Products fetched successfully", {
        products,
        currentPage: page,
        totalPages,
        totalItems: totalProducts,
        pageSize: limit,
        hasMore,
      });
    } catch (error) {
      console.error("Get Products Error:", error);
      return sendError(res, "Failed to fetch products", 500);
    }
  };

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("companyId genericId productType");
    if (!product) return sendError(res, "Product not found", 404);
    return successResponse(res, "Product fetched successfully", product, 200);
  } catch (error) {
    console.error("Get Product Error:", error);
    return sendError(res, "Failed to fetch product", 500);
  }
};

export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!product) return sendError(res, "Product not found", 404);
    return successResponse(res, "Product updated successfully", product, 200);
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