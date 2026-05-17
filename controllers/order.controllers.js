import Shop from "../models/shop.model.js"
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import DeliveryAssignment from "../models/deliveryAssignment.model.js";
import { sendDeliveryOtpMail } from "../utils/mail.js";
// import DeliveryAssignment from '../models/DeliveryAssignment.js';
// RAZORPAY IMPORT
import Razorpay from 'razorpay'
import dotenv from 'dotenv'
dotenv.config()

let instance = new Razorpay({
  key_id:process.env.RAZORPAY_KEY_ID,
  key_secret:process.env.RAZORPAY_KEY_SECRET,
}); 


export const placeOrder = async (req, res) => {
    try {
        const { cartItems, paymentMethod, deliveryAddress, totalAmount } = req.body;
              // console.log("BODY RECEIVED ===>", req.body);
        if (cartItems.length == 0 || !cartItems) {
            return res.status(400).json({ message: "cart is empty" });
        }

        if (!deliveryAddress.text || !deliveryAddress.latitude || !deliveryAddress.longitude) {
            return res.status(400).json({ message: "send complete delivery address" });
        }

        const groupItemsByShop = {};
        cartItems.forEach(item => {
            const shopId = item.shop;
            if (!groupItemsByShop[shopId]) {
                groupItemsByShop[shopId] = [];
            }
            groupItemsByShop[shopId].push(item);
        });

        const shopOrders = await Promise.all(Object.keys(groupItemsByShop).map(async (shopId) => {
            const shop = await Shop.findById(shopId).populate({
    path: "owner",
    model: "User"
})

            if (!shop) {
                return res.status(400).json({ message: "shop not found" });
            }
            const items = groupItemsByShop[shopId];
            const subtotal = items.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);

            return {
                shop: shop._id,
                owner: shop?.owner?._id,
                subtotal,
                 shopOrderItems: items.map((i) => ({
                    item: i.id,
                    price: i.price,
                    quantity: i.quantity,
                    name: i.name
                }))
            };
        }));

        // RAZORPAY ORDER CREATION

        if(paymentMethod=="online"){
          const razorOrder= await instance.orders.create({
            amount:Math.round(totalAmount*100),
            currency:"INR",
            receipt:`receipt_${Date.now()}`
          })
           const newOrder = await Order.create({
            user: req.userId,
            paymentMethod,
            deliveryAddress,
            totalAmount,
            shopOrders,
            razorpayOrderId:razorOrder.id,
            payment:false
        })
        return res.status(200).json({
          razorOrder,
          orderId:newOrder._id,


        })
        }

        const newOrder = await Order.create({
            user: req.userId,
            paymentMethod,
            deliveryAddress,
            totalAmount,
            shopOrders
        })

await newOrder.populate("shopOrders.shopOrderItems.item","name image price")
await newOrder.populate("shopOrders.shop","name")
await newOrder.populate("shopOrders.owner","name socketId")
await newOrder.populate("user","name email mobile")
const io=req.app.get('io')

if(io){
newOrder.shopOrders.forEach(shopOrder =>{
   console.log("Owner socketId:", shopOrder.owner?.socketId);
  if(shopOrder.owner && shopOrder.owner.socketId){
   const ownerSocketId=shopOrder.owner.socketId
   if(ownerSocketId){
    io.emit("newOrder",{
            _id:newOrder._id,
            paymentMethod:newOrder.paymentMethod,
            user:newOrder.user,
            shopOrders:shopOrder,
            createdAt: newOrder.createdAt,
            deliveryAddress:newOrder.deliveryAddress,
            payment:newOrder.payment
           })
   }
  }
})
}
        return res.status(201).json(newOrder);

    } catch (error) {
        return res.status(500).json({ message: `place order error ${error}` });
        console.log(error);
    }
};

// VERIFY PAYMENT

export const verifyPayment=async(req,res)=>{
  try{
   const {razorpay_payment_id, orderId}=req.body
   const payment=await instance.payments.fetch(razorpay_payment_id)
   if(!payment || payment.status!="captured"){
    return res.status(400).json({message:"payment not captured"})
   }
   const order=await Order.findById(orderId)
   if(!order){
    return res.status(400).json({message:"order not found"})
   }
   order.payment=true
   order.razorpayPaymentId=razorpay_payment_id
   await order.save()
 await order.populate("shopOrders.shopOrderItems.item","name image price")
await order.populate("shopOrders.shop","name")
await order.populate("shopOrders.owner","name socketId")
await order.populate("user","name email mobile")
const io=req.app.get('io')

if(io){
order.shopOrders.forEach(shopOrder =>{
  if(shopOrder.owner && shopOrder.owner.socketId){
   const ownerSocketId=shopOrder.owner.socketId
   if(ownerSocketId){
    io.to(ownerSocketId).emit("newOrder",{
            _id:order._id,
            paymentMethod:order.paymentMethod,
            user:order.user,
            shopOrders:shopOrder,
            ceatedAt: order.createdAt,
            deliveryAddress:order.deliveryAddress,
            payment:order.payment
           })
   }
  }
})
}
   res.status(200).json(order)
  }catch(error){
  return res.status(500).json({ message: `verify payment error ${error}` });
  }
}
// get all oders of user

export const getMyOrders=async(req,res)=>{
    try{
        const user=await User.findById(req.userId)
        if(user.role=="user"){
         const orders=await Order.find({user:req.userId})
       .populate("shopOrders.shop","name")
     .populate( "shopOrders.owner", "name email mobile" )
       .populate("shopOrders.shopOrderItems.item","name image price")
       .sort({createdAt:-1})

       return res.status(200).json(orders)
        }else if(user.role=="owner"){
             const orders=await Order.find({"shopOrders.owner":req.userId})
       .sort({createdAt:-1})
       .populate("shopOrders.shop","name")
       .populate("user")
       .populate("shopOrders.shopOrderItems.item","name image price")
       .populate("shopOrders.assignedDeliveryBoy","fullName mobile")
       // owner k pass whi data jaye jo uske dukaan se order hua haii
           const filteredOrders=orders.map((order=>({
            _id:order._id,
            paymentMethod:order.paymentMethod,
            user:order.user,
            shopOrders:order.shopOrders.find(o=>o.owner._id==req.userId),
            ceatedAt: order.createdAt,
            deliveryAddress:order.deliveryAddress,
            payment:order.payment
           })))
       return res.status(200).json(filteredOrders)
        }
       
    }catch(error){
         return res.status(500).json({ message: `get User order error ${error}` });
      
    }
}

export const updateOrderStatus=async(req,res)=>{

    try{
        const {orderId, shopId}=req.params
        const {status}=req.body
        const order=await Order.findById(orderId)
        const shopOrder=order.shopOrders.find(o=>o.shop==shopId)
        if(!shopOrder){
            return res.status(400).json({message:"shop order not found"})

        }
        shopOrder.status=status
        let deliveryBoyPayload=[]
        if(status=="out of delivery" && !shopOrder.assignment){
          const{longitude, latitude}=  order.deliveryAddress
          const nearByDeliveryBoys=await User.find({
            role:"deliveryBoy",
            location:{
                $near:{
                    $geometry:{type:"Point",coordinates:[Number(longitude),
                         Number(latitude)]},
                         $maxDistance:800000
                }
            }
          })
          const nearByIds=nearByDeliveryBoys.map(b=>b._id)
          const busyIds=await DeliveryAssignment.find({
            assignedTo:{$in: nearByIds},
            status:{$nin:["brodcasted","completed"]}

          }).distinct("assignedTo")
          const busyIdSet=new Set(busyIds.map(id=>String(id)))
          const availableBoys = nearByDeliveryBoys.filter(b=>!busyIdSet.has(String(b._id)))
          const candidates=availableBoys.map(b=>b._id)
          if(candidates.length==0){
            await order.save()
            return res.json({
                message:"order status updated but there is no available delivery boys "
            })
          }

          const deliveryAssignment=await DeliveryAssignment.create({
            order:order._id,  
            shop:shopOrder.shop,
            shopOrderId:shopOrder._id,
            brodcastedTo:candidates,
            status:"brodcasted"

          })
          shopOrder.assignedDeliveryBoy=deliveryAssignment.assignedTo
          shopOrder.assignment=deliveryAssignment._id
           deliveryBoyPayload=availableBoys.map(b=>({
             id:b._id,
             fullName:b.fullName,
             longitude:b.location.coordinates?.[0],
             latitude:b.location.coordinates?.[1],
             mobile:b.mobile
           }))


           await deliveryAssignment.populate('order')
           
           await deliveryAssignment.populate('shop')

          const io = req.app.get("io");

if (io) {
  availableBoys.forEach((boy) => {
    console.log("Boy socketId:", boy.socketId);

    if (boy.socketId) {
      io.to(boy.socketId).emit("newAssignment", {
        sentTo:boy._id,
        assignmentId: deliveryAssignment._id,
        orderId: order?._id,
        shopName: shop?.name,
        deliveryAddress: order?.deliveryAddress,
        items: shopOrder?.shopOrderItems ?? [],
        subtotal: shopOrder?.subtotal ?? 0,
      });
    }
  });
}
}
        // await shopOrder.save()
        await order.save()
         const updatedShopOrder=order.shopOrders.find(o=>o.shop==shopId)
        await order.populate("shopOrders.shop", "name")
         await order.populate("shopOrders.assignedDeliveryBoy", "fullName email mobile")
          await order.populate("user", "socketId")


        // Status update socket emit
const io = req.app.get('io');

if (io) {
  const userSocketId = order.user?.socketId;

  console.log("📤 Sending to user socket:", userSocketId);

  if (userSocketId) {
    io.to(userSocketId).emit("update-status", {
      orderId: order._id,
      shopId: updatedShopOrder?.shop?._id,
      status: updatedShopOrder?.status, // ✅ fixed
      userId: order.user?._id
    });
  }
}
           
        
        return res.status(200).json({
          shopOrder: updatedShopOrder,
          assignedDeliveryBoy:updatedShopOrder?.assignedDeliveryBoy,
          availableBoys:deliveryBoyPayload,
          assignment:updatedShopOrder?.assignment._id
        })
    }
    catch(error){
          return res.status(500).json({ message: ` order status error ${error}` });
    }
}


// get all orders for owner

export const getDeliveryBoyAssignment = async (req, res) => {
  try {
    const deliveryBoyId = req.userId;

    const assignments = await DeliveryAssignment.find({
  brodcastedTo: { $in: [deliveryBoyId] },
  status: "brodcasted",
})
.populate("order")
.populate("shop");

    const formated = assignments.map((a) => {
      const order = a.order;
      const shop = a.shop;

      const shopOrder = order?.shopOrders?.find((so) =>
        so._id.equals(a.shopOrderId)
      );

      return {
        assignmentId: a._id,
        orderId: order?._id || null,
        shopName: shop?.name || "",
        deliveryAddress: order?.deliveryAddress || "",
        items: shopOrder?.shopOrderItems || [],
        subtotal: shopOrder?.subtotal || 0,
      };
    });

    return res.status(200).json(formated);
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ message: `get Assignment error ${error.message}` });
  }
};


// Accept Delivery Assignment

export const acceptOrder = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    // 1️⃣ Find assignment
    const assignment = await DeliveryAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(400).json({ message: "assignment not found" });
    }
    if (assignment.status !== "brodcasted") {
      return res.status(400).json({ message: "assignment not expired" });
    }

    // 2️⃣ Check if delivery boy already assigned
    const alreadyAssigned = await DeliveryAssignment.findOne({
      assignedTo: req.userId,
      status: { $nin: ["brodcasted", "completed"] },
    });
    if (alreadyAssigned) {
      return res
        .status(400)
        .json({ message: "You are already assigned to another order" });
    }

    // 3️⃣ Assign the delivery boy
    assignment.assignedTo = req.userId;
    assignment.status = "assigned";
    assignment.acceptedAt = new Date();
    await assignment.save();

    
    const order = await Order.findById(assignment.order);
    if (!order) {
      return res.status(400).json({ message: "order not found" });
    }

  
    const shopOrder = order.shopOrders.id(assignment.shopOrderId);
    if (!shopOrder) {
      return res.status(400).json({ message: "shopOrder not found" });
    }

    shopOrder.assignedDeliveryBoy = req.userId;
    await order.save();

    return res.status(200).json({ message: "order accepted" });
  } catch (error) {
    console.error("Accept order error:", error);
    return res.status(500).json({ message: "accept order error", error: error.message });
  }
};


// Current Orders

export const getCurrentOrder=async(req,res)=>{
  try{
    const assignment=await DeliveryAssignment.findOne({
      assignedTo:req.userId,
      status:"assigned"
    })
    .populate("shop","name")
    .populate("assignedTo","fullName email mobile location")
    .populate({
      path:"order",
      populate:[{path:"user", select:"fullName email location mobile"}],
      
    })
    if(!assignment){
      return res.status(400).json({message:"assignment not found"})
    }
    if(!assignment.order){
      return res.status(400).json({message:"order not found"})
    }
    const shopOrder=assignment.order.shopOrders.find(so=>String(so._id)==String(assignment.shopOrderId))
    if(!shopOrder){
       return res.status(400).json({message:"shopOrder not found"})
    }
    let deliveryBoyLocation={lat:null, lon:null}
    if(assignment.assignedTo.location.coordinates.length==2){
    deliveryBoyLocation.lat=assignment.assignedTo.location.coordinates[1]
    deliveryBoyLocation.lon=assignment.assignedTo.location.coordinates[0]
    }
   

    let customerLocation={lat:null, lon:null}
    if(assignment.order.deliveryAddress){
        customerLocation.lat=assignment.order.deliveryAddress.latitude
        customerLocation.lon=assignment.order.deliveryAddress.longitude
    }
    return res.status(200).json({
      _id:assignment.order._id,
      user:assignment.order.user,
      shopOrder,
      deliveryAddress:assignment.order.deliveryAddress,
      deliveryBoyLocation,
      customerLocation
    })
   
  }catch(error){
      return res.status(500).json({ message: "current order error", error: error.message });
  }
}


// get order by id

export const getOrderById=async(req,res)=>{
  try{
    const {orderId}=req.params
    const order=await Order.findById(orderId)
    .populate("user")
    .populate({
      path:"shopOrders.shop",
      model:"Shop"
    })
    .populate({
      path:"shopOrders.assignedDeliveryBoy",
      model:"User"
    })
    .populate({
      path:"shopOrders.shopOrderItems.item",
      model:"Item"
    })
    .lean()
    if(!order){
      return res.status(400).json({message:"order not found"})
    }
    return res.status(200).json(order)

  }catch(error){
     return res.status(500).json({ message: "get by id order error", error: error.message });
  
  }
}


export const sendDeliveryOtp=async(req,res)=>{
  try{
    const {orderId, shopOrderId}=req.body
    const order=await Order.findById(orderId).populate("user")
    const shopOrder=order.shopOrders.id(shopOrderId)
    if(!order || !shopOrder){
      return res.status(400).json({mesage:"enter valid order/shopOrderid"})
    }
    const otp=Math.floor(1000 + Math.random() * 9000).toString()
    shopOrder.deliveryOtp=otp
    shopOrder.otpExpires=Date.now() + 5*60*1000
    await order.save()
    await sendDeliveryOtpMail(order.user, otp)
    return res.status(200).json({message:`Otp sent Successfully to ${order?.user?.fullName}`})
  }catch(error){
     return res.status(500).json({ message: "delivery otp error", error: error.message });
  
  }
}



export const verifyDeliveryOtp=async(req,res)=>{
  try{
       const {orderId, shopOrderId,otp}=req.body
       const order=await Order.findById(orderId).populate("user")
    const shopOrder=order.shopOrders.id(shopOrderId)
    if(!order || !shopOrder){
      return res.status(400).json({mesage:"enter valid order/shopOrderid"})
    }
    if(shopOrder.deliveryOtp!==otp || !shopOrder.otpExpires || shopOrder.otpExpires<Date.now()){
      return res.status(400).json({message:"Invalid/Expired Otp"})

    }
    shopOrder.status="delivered"
    shopOrder.deliveredAt=Date.now()
    await order.save()
    await DeliveryAssignment.deleteOne({
      shopOrderId:shopOrder._id,
      order:order._id,
      assignedTo:shopOrder.assignedDeliveryBoy
    })
    return res.status(200).json({message:"Order Delivered Successfully"})
  }catch(error){
     return res.status(500).json({ message: " verify delivery otp error", error: error.message });
  
  }
}