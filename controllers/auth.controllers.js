import User from "../models/user.model.js"
import bcrypt from "bcryptjs"
import genToken from "../utils/token.js"
import pkg from 'jsonwebtoken';
import { sendOtpMail } from "../utils/mail.js";
const { verify } = pkg;



// SIGNUP

export const signUp=async (req,res)=>{
     console.log("SignUp request body:", req.body);
    try{
        const{fullName, email, password, mobile,role}=req.body
        let user=await User.findOne({email})
        if(user){
            return res.status(400).json({message:"User already exist."})
        }
        if(password.length<6){
           return res.status(400).json({message:"Password must be six character."}) 
        }
        if(mobile.length<10){
            return res.status(400).json({message:"Mobile number must be at least 10 digits."})
        }

        const hashedPassword=await bcrypt.hash(password,10)
        user=await User.create({
            fullName,
            email,
            role,
            mobile,
            password:hashedPassword

        })

        const token=await genToken(user._id)
        res.cookie("token",token,{
            secure:false,
            sameSite:"strict",
            maxAge: 7*24*60*60*1000,
            httpOnly:true
        })
        return res.status(201).json(user)
    }catch(error){
      return res.status(500).json(`sign up error ${error}`)
    }
}


// SIGNIN

export const signIn=async (req,res)=>{
    try{
        const{ email, password}=req.body
        let user=await User.findOne({email})
        if(!user){
            return res.status(400).json({message:"User does not exist."})
        }
         console.log('user found', user);
         const isMatch=await bcrypt.compare(password, user.password)

         if(!isMatch){
            return res.status(400).json({message:"incorrect password"})
         }
      
        const token=await genToken(user._id)
        res.cookie("token",token,{
            secure:false,
            sameSite:"strict",
            maxAge: 7*24*60*60*1000,
            httpOnly:true
        })
        return res.status(200).json(user)
    }catch(error){
      return res.status(500).json(`sign in error ${error}`)
    }
}

// LOGOUT

export const signOut=async (req,res)=>{
    try{
      res.clearCookie("token")
      return res.status(200).json({message:"logout successfully"})
    }catch(error){
        return res.status(500).json(`sign out error ${error}`)
    }
}

export const sendOtp = async(req,res)=>{
    try{
      const {email}=req.body
      const user = await User.findOne({email})
      if(!user){
       return res.status(400).json({message:"User does not exist."})
      }
      const otp=Math.floor(100000 + Math.random() * 900000).toString();
      user.resetOtp=otp
      user.otpExpires=Date.now()+5*60*1000
      user.isOtpVerified=false
      await user.save()
      await sendOtpMail(email,otp)
      return res.status(200).json({message:"OTP sent successfully"})
    }catch(error){
       return res.status(500).json(`send otp error ${error}`)
    }
}

// verify otp

export const verifyOtp = async(req,res)=>{
    try{
        const {email,otp}=req.body
        const user=await User.findOne({email})
        if(!user || user.resetOtp!=otp || user.otpExpires<Date.now()){
            res.status(400).json({message:"Invalid or expired OTP"})
        }
        user.isOtpVerified=true
        user.resetOtp=undefined
        user.otpExpires=undefined
        await user.save()
          res.status(200).json({message:"OTP verify  successfully"})

    }catch(error){
         return res.status(500).json(`verify OTP error  ${error}`)
    }
}

// reset password


export const resetPassword = async(req,res)=>{
    try{
        const {email,newPassword}=req.body
        const user=await User.findOne({email})
        if(!user || !user.isOtpVerified){
       return res.status(400).json({message:"OTP verification required"});
        }

        const hashedPassword = await bcrypt.hash(newPassword,10)
        user.password=hashedPassword
        user.isOtpVerified=false
        await user.save()
          res.status(200).json({message:"Password reset  successfully"})

    }catch(error){
         return res.status(500).json(`Password reset  error  ${error}`)
    }
}
// google authentication
export const googleAuth = async (req, res) => {
  try {
    const { fullName, email, mobile, role } = req.body;
    let user = await User.findOne({ email });

    if (!user) {
      // ✅ Create new user if not exists
      user = await User.create({
        fullName,
        email,
        mobile,
        role,
        password: null // since Google users don’t need passwords
      });
    }

    const token = await genToken(user._id);

    res.cookie("token", token, {
      secure: false,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true
    });

    return res.status(200).json(user);
  } catch (error) {
    console.error("googleAuth error:", error);
    return res.status(500).json({ message: "Google Auth failed" });
  }
};
