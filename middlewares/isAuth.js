// import jwt from "jsonwebtoken";

// const isAuth = (req, res, next) => {
//   try {
//     // ✅ Changed from req.cookies.token to req.headers.token
//     const token = req.headers.token;
// console.log("cookies:", req.cookies);
// console.log("cookie header:", req.headers.cookie);
//     if (!token) {
//       return res.status(400).json({ message: "token not found" });
//     }

//     const decodeToken = jwt.verify(token, process.env.JWT_SECRET);

//     if (!decodeToken) {
//       return res.status(400).json({ message: "token not verify" });
//     }

//     console.log(decodeToken);
//     req.userId = decodeToken.userId;
//     next();

//   } catch (error) {
//     return res.status(500).json({ message: "isAuth error" });
//   }
// };

// export default isAuth;


import jwt from "jsonwebtoken";

const isAuth = (req, res, next) => {
  try {
    const token = req.cookies.token;

    console.log("cookies:", req.cookies);

    if (!token) {
      return res.status(400).json({ message: "token not found" });
    }

    const decodeToken = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = decodeToken.userId;
    next();

  } catch (error) {
    return res.status(500).json({ message: "isAuth error" });
  }
};

export default isAuth;
