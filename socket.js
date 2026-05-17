// Here we connect socket.io with the help of frontend or backend
import User from "./models/user.model.js"

export const socketHandler=async (io)=>{
  io.on('connection',(socket)=>{
     console.log("✅ User connected:", socket.id);
    socket.on('identity',async({userId})=>{
      try{
         console.log("📥 Identity received:", userId);
        const user=await User.findByIdAndUpdate(userId,{
          socketId:socket.id,isOnline:true
        },{new:true})
          console.log("✅ Socket saved in DB:", user?.socketId);
      }catch(error){
        console.log(error)
      }
    })
    // When user Disconnected
    socket.on('disconnect',async()=>{
       console.log("❌ User disconnected:", socket.id);
      try{
         await User.findOneAndUpdate({socketId:socket.id},{
        socketId:null,
        isOnline:false
      })
      }catch(error){
      console.log(error)
      }
     
    })

  })
}