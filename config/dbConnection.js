import mongoose from "mongoose";

export const dbConnection = async () => {
  return mongoose
    .connect(process.env.MONGO_URL)
    .then(() => console.log("Connected to database"))
    .catch((err) =>
      console.log(`Some error occured while connected to database ${err}`)
    );
};