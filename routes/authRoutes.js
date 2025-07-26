import express from "express";
import  authController  from "../controllers/authController.js";
import tokenValidations from "../middleware/tokenValidation.js"; 

const router = express.Router();

router.post("/login", authController.loginUser);
router.post("/logout", tokenValidations.verifyToken, authController.logoutUser);

export default router;
