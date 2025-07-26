import express from "express";
import  areaController  from "../controllers/areaController.js";
import tokenValidations from "../middleware/tokenValidation.js"; 

const router = express.Router();

router.post("/", areaController.createArea);
router.get("/", tokenValidations.verifyToken, areaController.getAllAreas);
router.get("/:id", areaController.getAreaById);
router.put("/:id", areaController.updateArea);
router.delete("/:id", areaController.deleteArea);

export default router;
