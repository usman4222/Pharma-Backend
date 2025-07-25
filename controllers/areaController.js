import Area from "../models/areaModel.js";
import { sendError, successResponse } from "../utils/response.js";

// Create Area
export const createArea = async (req, res) => {
  try {
    const { name, description, city } = req.body;

    if (!name || !city) {
      return sendError(res, "name and city are required fields", 400);
    }

    const area = await Area.create({
      name,
      description: description || "",
      city,
    });

    return successResponse(res, "Area created successfully", { area }, 201);
  } catch (error) {
    console.error("Create Area Error:", error);
    return sendError(res, "Failed to create area", 500);
  }
};

// Get All Areas
export const getAllAreas = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1; // Default page = 1
      const limit = parseInt(req.query.limit) || 10; // Default limit = 10
      const skip = (page - 1) * limit;
  
      const areas = await Area.find().skip(skip).limit(limit);
      const totalAreas = await Area.countDocuments();
      const totalPages = Math.ceil(totalAreas / limit);
  
      const hasMore = page < totalPages;
  
      return successResponse(
        res,
        "Areas fetched successfully",
        {
          areas,
          currentPage: page,
          totalPages,
          totalItems: totalAreas,
          pageSize: limit,
          hasMore,
        },
        200
      );
    } catch (error) {
      console.error("Get All Areas Error:", error);
      return sendError(res, "Failed to fetch areas", 500);
    }
  };
  
  
  // Get Single Area by ID
  export const getAreaById = async (req, res) => {
    try {
      const { id } = req.params;
      const area = await Area.findById(id)
  
      if (!area) return sendError(res, "Area not found", 404);
  
      return successResponse(res, "Area fetched successfully", { area }, 200);
    } catch (error) {
      console.error("Get Area By ID Error:", error);
      return sendError(res, "Failed to fetch area", 500);
    }
  };
  

// Update Area
export const updateArea = async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = {};
  
      // Dynamically add only fields present in req.body
      if (req.body.name) updateData.name = req.body.name;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.city) updateData.city = req.body.city;
  
      if (Object.keys(updateData).length === 0) {
        return sendError(res, "At least one field must be provided for update", 400);
      }
  
      const area = await Area.findByIdAndUpdate(id, updateData, { new: true });
  
      if (!area) return sendError(res, "Area not found", 404);
  
      return successResponse(res, "Area updated successfully", { area }, 200);
    } catch (error) {
      console.error("Update Area Error:", error);
      return sendError(res, "Failed to update area", 500);
    }
  };
  

// Delete Area
export const deleteArea = async (req, res) => {
  try {
    const { id } = req.params;

    const area = await Area.findByIdAndDelete(id);

    if (!area) return sendError(res, "Area not found", 404);

    return successResponse(res, "Area deleted successfully", {}, 200);
  } catch (error) {
    console.error("Delete Area Error:", error);
    return sendError(res, "Failed to delete area", 500);
  }
};


const areaController = {
    createArea,
  updateArea,
  deleteArea,
  getAllAreas,
  getAreaById
  };
  
  export default areaController;