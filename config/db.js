// import dotenv from "dotenv";
// dotenv.config();
// import mongoose from "mongoose"
// const connectDB= async ()=>{
//     console.log("ENV VALUE:", process.env.MONGODB_URL);
//     try{
//         await mongoose.connect(process.env.MONGODB_URL)
//         console.log("DB Connected")

//     }catch(error){
//         console.log("DB Error", error)
//     }
// }

// export default connectDB;




import mongoose from "mongoose";

const connectDB = async () => {
  try {

    const conn = await mongoose.connect(process.env.MONGODB_URL, {
      serverSelectionTimeoutMS: 30000,
    });

    console.log("DB Connected:", conn.connection.host);

  } catch (error) {

    console.log("DB Error:", error.message);

    process.exit(1);
  }
};

export default connectDB;