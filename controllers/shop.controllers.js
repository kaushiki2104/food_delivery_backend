import Shop from "../models/shop.model.js";
import uploadOnCloudinary from "../utils/cloudinary.js";

// Create or Edit Shop
export const createEditShop = async (req, res) => {
  try {
    const { name, city, state, address } = req.body;
    let image;

    // Only try to upload if a file exists
    if (req.file) {
      // Check if buffer exists (for memory storage)
      if (req.file.buffer) {
        image = await uploadOnCloudinary(req.file.buffer);
      } else if (req.file.path) {
        // If using diskStorage, use path
        image = await uploadOnCloudinary(req.file.path);
      }
    }

    // Find existing shop
    let shop = await Shop.findOne({ owner: req.userId });

    if (!shop) {
      // Create new shop
      shop = await Shop.create({
        name,
        city,
        state,
        address,
        image,
        owner: req.userId,
      });
    } else {
      // Update existing shop
      shop = await Shop.findByIdAndUpdate(
        shop._id,
        { name, city, state, address, image, owner: req.userId },
        { new: true }
      );
    }

    await shop.populate("owner items");

    return res.status(201).json(shop);
  } catch (error) {
    console.error("create shop error:", error);
    return res.status(500).json({ message: `create shop error: ${error.message}` });
  }
};

// Get My Shop
export const getMyShop = async (req, res) => {
  try {
    const shop = await Shop.findOne({ owner: req.userId }).populate("owner").populate({
      path:"items",
      options:{sort:{updatedAt:-1}}

        });
    if (!shop) {
      return res.status(200).json(null);
    }
    return res.status(200).json(shop);
  } catch (error) {
    console.error("get my shop error:", error);
    return res.status(500).json({ message: `get my shop error: ${error.message}` });
  }
};

export const getShopByCity = async (req, res) => {
  try {
    const { city } = req.params;

    const shops = await Shop.find({
      city: { $regex: new RegExp(`^${city}$`, "i") }
    }).populate("items");

    return res.status(200).json(shops);

  } catch (error) {
    return res
      .status(500)
      .json({ message: `get shop by city error: ${error.message}` });
  }
};
