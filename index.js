const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
require('dotenv').config();

// Middleware configuration
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Base Route
app.get('/', (req, res) => {
    res.send('ApexFit Fitness Gym Server is Running!')
});

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

//DATABASE AND ALL API ROUTES BLOCK

/*async function run() {
  try {
    // MongoDB Database and Collections Initializing References

    client.connect(() =>{
      console.log("Connecting to Mongo DB")
    }). catch(console.dir)*/
    async function connectDB() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB Atlas!");
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
  }
}
connectDB();

    
    const database = client.db("fitnessGym");
    const usersCollection = database.collection("user");
    const trainerApplicationsCollection = database.collection("trainerApplications");
    const classesCollection = database.collection("classes");
    const forumPostsCollection = database.collection("forumPosts");
    const bookingsCollection = database.collection("bookings");
    const favoritesCollection = database.collection("favorites");

    console.log("Connected successfully to MongoDB [fitnessGym]!");

    / 1. ADMIN DASHBOARD OVERVIEW STATS PIPELINE (ROLE SPECIFIC)
    
    app.get('/api/admin/stats', async (req, res) => {
      try {
        const totalAdmins = await usersCollection.countDocuments({ role: "admin" });
        const totalTrainers = await usersCollection.countDocuments({ role: "trainer" });
        const totalMembers = await usersCollection.countDocuments({ 
          $or: [{ role: "member" }, { role: { $exists: false } }, { role: "" }] 
        });

        const totalClasses = await classesCollection.countDocuments({});
        const totalBooked = await bookingsCollection.countDocuments({});
        
        const payments = await bookingsCollection.find({}).toArray();
        const totalRevenue = payments.reduce((sum, payment) => {
          return sum + (parseFloat(payment.price) || 0);
        }, 0);

        res.status(200).send({
          success: true,
          totalAdmins,
          totalTrainers,
          totalMembers,
          totalUsers: totalAdmins + totalTrainers + totalMembers, 
          totalClasses,
          totalBooked,
          totalRevenue
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

  // 2. MANAGE USERS API (BLOCK/UNBLOCK/MAKE ADMIN)
   
 

    app.patch('/api/admin/users/:id', async (req, res) => {
      try {
        const { action } = req.body;
        const filter = { _id: new ObjectId(req.params.id) };
        let updateDoc = {};

        if (action === "block") updateDoc = { $set: { status: "blocked" } };
        if (action === "unblock") updateDoc = { $set: { status: "active" } };
        if (action === "make-admin") updateDoc = { $set: { role: "admin" } };

        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
    
    


app.get('/api/users', async (req, res) => {
    try {
        const users = await usersCollection.find({}).toArray();
        res.send(users); 
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});
  
    //3.APPLIED TRAINERS PIPELINE (SUBMIT, PENDING, REVIEW)
   
    app.post('/api/apply-trainer', async (req, res) => {
      try {
        const applicationData = req.body;
        
        const existingApp = await trainerApplicationsCollection.findOne({ email: applicationData.email });
        if (existingApp) {
           return res.status(400).send({ message: "You have already submitted a trainer application!" });
        }

        const newApplication = {
          email: applicationData.email,
          name: applicationData.name,
          experience: parseInt(applicationData.experience) || 0,
          specialty: applicationData.specialty,
          bio: applicationData.bio,
          status: "pending", 
          feedback: "",
          createdAt: new Date()
        };

        const result = await trainerApplicationsCollection.insertOne(newApplication);
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error", error: error.message });
      }
    });

    app.get('/api/admin/applications/pending', async (req, res) => {
      try {
        const pendingApps = await trainerApplicationsCollection.find({ status: "Pending" }).toArray();
        res.send(pendingApps);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.patch('/api/admin/trainers/review/:id', async (req, res) => {
      try {
        const { action, feedback, userEmail } = req.body; 
        const appId = new ObjectId(req.params.id);
        
        if (action === "approve") {
          await trainerApplicationsCollection.updateOne({ _id: appId }, { $set: { status: "approved" } });
          await usersCollection.updateOne({ email: userEmail }, { $set: { role: "trainer" } });
        } else {
          await trainerApplicationsCollection.updateOne({ _id: appId }, { $set: { status: "rejected", feedback } });
        }
        res.send({ success: true });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    
    app.get('/api/users/trainer-status/:email', async (req, res) => {
      try {
        const userEmail = req.params.email;
        const application = await trainerApplicationsCollection.findOne({ email: userEmail });
        
        if (!application) {
          
          return res.send({ status: "none" });
        }
        
        res.send({
          status: application.status,       
          feedback: application.feedback || "" 
        });
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch status", error: error.message });
      }
    });
    //  4. MANAGE TRAINERS (VIEW & DEMOTE ACTIVE TRAINERS)
   
    app.get('/api/trainers', async (req, res) => {
      try {
        const trainers = await usersCollection.find({ role: "trainer" }).toArray();
        res.send(trainers);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.patch('/api/admin/trainers/demote', async (req, res) => {
      try {
        const { email } = req.body;
        const result = await usersCollection.updateOne({ email: email }, { $set: { role: "member" } });
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    //5. CLASSES MANAGEMENT PIPELINE
   
    /*app.post('/api/classes', async (req, res) => {
      try {
        const classData = req.body;
        const newClass = {
          name: classData.name,
          image: classData.image,
          category: classData.category,
          difficulty: classData.difficulty,
          duration: parseInt(classData.duration) || 0,
          scheduleDays: classData.scheduleDays,
          scheduleTime: classData.scheduleTime,
          price: parseFloat(classData.price) || 0,
          description: classData.description,
          trainerEmail: classData.trainerEmail,
          trainerName: classData.trainerName,
          status: "pending", 
          attendees: [], 
          createdAt: new Date()
        };
        const result = await classesCollection.insertOne(newClass);
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ message: "Failed to create class", error: error.message });
      }
    });*/
    app.post('/api/classes', async (req, res) => {
  try {
    const classData = req.body;
    const newClass = {
      name: classData.name,
      image: classData.image,
      category: classData.category,
      difficulty: classData.difficulty,
      duration: parseInt(classData.duration) || 0,
      scheduleDays: classData.scheduleDays,
      scheduleTime: classData.scheduleTime,
      price: parseFloat(classData.price) || 0,
      description: classData.description,
      trainerEmail: classData.trainerEmail,
      trainerName: classData.trainerName,
      status: "pending", 
      attendees: [], 
      totalSeats: parseInt(classData.totalSeats) || 0, 
      bookedSlots: 0, 
      createdAt: new Date()
    };
    
    const result = await classesCollection.insertOne(newClass);
    res.status(201).send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ message: "Failed to create class", error: error.message });
  }
});

 
    // PUBLIC CLASSES API (WITH EXTENDED SAFETY & FALLBACK QUERY)
   
    /*app.get('/api/public-classes', async (req, res) => {
      try {
       
        const collection = typeof classesCollection !== 'undefined' ? classesCollection : classCollection;

        if (!collection) {
          console.error(" Classes collection reference is missing in server.js!");
          return res.status(500).send({ message: "Collection reference not found" });
        }
        let query = { status: { $in: ["approved", "accepted", "Approved", "Accepted"] } };
        let result = await collection.find(query).toArray();

        if (result.length === 0) {
          console.log("⚠️ No classes found with status filter. Fetching all available documents as fallback...");
          result = await collection.find({}).toArray();
        }

        res.send(result);
      } catch (error) {
        console.error("Error in /api/public-classes backend route:", error);
        res.status(500).send({ message: "Internal Server Error", error: error.message });
      }
    });*/
    
    app.get('/api/public-classes', async (req, res) => {
  try {
    const collection = typeof classesCollection !== 'undefined' ? classesCollection : classCollection;

    if (!collection) {
      return res.status(500).send({ message: "Collection reference not found" });
    }
    const query = { status: { $in: ["approved", "accepted", "Approved", "Accepted"] } };
    let result = await collection.find(query).toArray();
    const cleanedResult = result.map(item => ({
      ...item,
      totalSeats: item.totalSeats || 0,
      bookedSlots: item.bookedSlots || 0
    }));

    res.send(cleanedResult);
  } catch (error) {
    console.error("Error in /api/public-classes:", error);
    res.status(500).send({ message: "Internal Server Error", error: error.message });
  }
});
app.get('/api/classes/featured', async (req, res) => {
    const result = await classesCollection.find()
        .sort({ bookedSlots: -1 }) 
        .limit(6)
        .toArray(); 
    res.send(result);
});

 app.get('/api/my-classes', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).send({ message: "Trainer email is missing!" });
        const result = await classesCollection.find({ trainerEmail: email }).sort({ createdAt: -1 }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get('/api/classes/:id',  async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID format" });
        const result = await classesCollection.findOne({ _id: new ObjectId(id) });
        if (!result) return res.status(404).send({ message: "Class not found" });
        res.send(result);
        
      } catch (error) {
        console.log(error)
        res.status(500).send({ message: error.message });
      }
    });

    app.post('/api/classes/:id/status', async (req, res) => {
      try {
        const classId = req.params.id;
        const { email } = req.body;
        if (!email) return res.status(400).send({ message: "User email required" });
        if (!ObjectId.isValid(classId)) return res.status(400).send({ message: "Invalid ID format" });

        const queryFilter = {
          userEmail: email,
          $or: [ { classId: classId }, { classId: new ObjectId(classId) } ]
        };
        const isBooked = await bookingsCollection.findOne(queryFilter);
        const isFavorite = await favoritesCollection.findOne(queryFilter);

        res.send({ hasBooked: !!isBooked, hasFavorited: !!isFavorite });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get('/api/admin/all-classes', async (req, res) => {
      try {
        const allClasses = await classesCollection.find({}).toArray();
        res.send(allClasses);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.patch('/api/admin/classes/:id', async (req, res) => {
      try {
        const { status } = req.body;
        const result = await classesCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status: status } }
        );
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.delete('/api/admin/classes/:id', async (req, res) => {
      try {
        const result = await classesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

     // 6. FAVORITES INTERACTION MATRIX

    app.post('/api/favorites/toggle', async (req, res) => {
      try {
        const { classId, userEmail, className, image, price } = req.body;
        if (!classId || !userEmail) return res.status(400).send({ message: "Required Context Missing" });

        const queryFilter = {
          userEmail,
          $or: [ { classId: classId }, { classId: ObjectId.isValid(classId) ? new ObjectId(classId) : classId } ]
        };

        const existing = await favoritesCollection.findOne(queryFilter);
        if (existing) {
          await favoritesCollection.deleteOne(queryFilter);
          return res.send({ success: true, isFavorited: false, message: "Removed from favorites" });
        }

        const favoriteDoc = { classId, userEmail, className, image, price: parseFloat(price) || 0, createdAt: new Date() };
        await favoritesCollection.insertOne(favoriteDoc);
        res.send({ success: true, isFavorited: true, message: "Successfully added to your favorites!" });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    //  6. FAVORITES INTERACTION MATRIX (GET & DELETE ADDED)
    app.get('/api/favorites', async (req, res) => {
      try {
        const userEmail = req.query.email;
        if (!userEmail) {
          return res.status(400).send({ message: "Email parameter required" });
        }
        
       
        const list = await favoritesCollection.find({ userEmail: userEmail }).toArray();
        res.send(list);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    
    app.delete('/api/favorites/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { 
          _id: ObjectId.isValid(id) ? new ObjectId(id) : id 
        };
        
        const result = await favoritesCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    //  7. TRANSACTIONS MANAGEMENT PAGE

 
   /* app.post('/api/bookings/confirm', async (req, res) => {
      try {
        const bookingData = req.body;
        const result = await bookingsCollection.insertOne(bookingData);
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ message: "Failed to store transaction log", error: error.message });
      }
    });*/

    app.post('/api/bookings/confirm', async (req, res) => {
  try {
    const { classId, userEmail, ...bookingData } = req.body;

    // ১. প্রথমে দেখুন ওই ক্লাসটি আছে কি না
    const query = { _id: new ObjectId(classId) };
    const fitnessClass = await classesCollection.findOne(query);

    if (!fitnessClass) {
      return res.status(404).send({ message: "Class not found" });
    }

    // ২. সিট ফাঁকা আছে কি না চেক করুন (আপনার ডাটাবেজে totalSeats ফিল্ডটি থাকতে হবে)
    if (fitnessClass.bookedSlots >= fitnessClass.totalSeats) {
      return res.status(400).send({ message: "No seats available for this class!" });
    }

    // ৩. বুকিং কনফার্ম করুন
    const result = await bookingsCollection.insertOne({ 
      ...bookingData, 
      classId: new ObjectId(classId), 
      userEmail 
    });

    // ৪. ক্লাসের সিট সংখ্যা ১ বাড়িয়ে দিন (Atomically)
    await classesCollection.updateOne(
      query, 
      { $inc: { bookedSlots: 1 } }
    );

    res.status(201).send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ message: "Transaction failed", error: error.message });
  }
});
    app.get('/api/admin/transactions', async (req, res) => {
      try {
        const collection = typeof bookingsCollection !== 'undefined' ? bookingsCollection : bookingCollection;
        
        if (!collection) {
          console.error(" MongoDB Booking Collection reference is missing in server.js!");
          return res.send([]); 
        }
        const history = await collection.find({}).sort({ bookingDate: -1 }).toArray();
        res.send(history);
      } catch (error) {
        console.error("Backend Error in /api/admin/transactions:", error);
        res.status(500).send({ message: "Internal server error reading bookings", error: error.message });
      }
    });

    //  8. COMMUNITY FORUM MANAGEMENT PIPELINE (WITH VOTING MATRIX)
  
    app.post('/api/forums', async (req, res) => {
      try {
        const postData = req.body;
        const newPost = {
          title: postData.title,
          image: postData.image,
          description: postData.description,
          authorEmail: postData.trainerEmail || postData.authorEmail,
          authorName: postData.trainerName || postData.authorName,
          authorRole: postData.authorRole || "trainer",
          upVotes: [],
          downVotes: [],
          createdAt: new Date()
        };
        const result = await forumPostsCollection.insertOne(newPost);
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ message: "Failed to post", error: error.message });
      }
    });
    

    app.get('/api/forums', async (req, res) => {
      try {
        const result = await forumPostsCollection.find().sort({ createdAt: -1 }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get('/api/my-forums', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).send({ message: "Email target parameter missing!" });
        
        const result = await forumPostsCollection.find({ authorEmail: email }).sort({ createdAt: -1 }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });
    



app.get('/api/forums/latest', async (req, res) => {
    const result = await forumPostsCollection.find()
        .sort({ _id: -1 }) 
        .limit(4)
        .toArray(); // 
    res.send(result);
});

    app.patch('/api/forum/:id/vote', async (req, res) => {
  try {
    const id = req.params.id;
    const { voteType, userEmail } = req.body; // ফ্রন্টএন্ড থেকে ইমেইল পাঠাতে হবে

    if (!userEmail) {
      return res.status(400).send({ message: "User email is required" });
    }

    const query = { _id: new ObjectId(id) };
    let updateDoc = {};

   
    if (voteType === 'upvote') {
      updateDoc = { $addToSet: { upVotes: userEmail }, $pull: { downVotes: userEmail } };
    } else if (voteType === 'downvote') {
      updateDoc = { $addToSet: { downVotes: userEmail }, $pull: { upVotes: userEmail } };
    }

    const result = await forumPostsCollection.updateOne(query, updateDoc);
    res.send({ success: true, result });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});
    app.delete('/api/admin/forums/:id', async (req, res) => {
      try {
        const result = await forumPostsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

app.get('/api/forums/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log("Searching for ID in forumPostsCollection:", id); // এই লগটি টার্মিনালে চেক করুন

        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid ID format" });
        }

        const result = await forumPostsCollection.findOne({ _id: new ObjectId(id) });
        
        if (!result) {
            console.log("Post not found in database");
            return res.status(404).send({ message: "Post not found" });
        }
        res.send(result);
    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).send({ message: error.message });
    }
});
   
    
    
    app.get('/api/trainer/classes', async (req, res) => {
      try {
        const trainerEmail = req.query.email;
        if (!trainerEmail) return res.status(400).send({ message: "Trainer email required" });

        const cleanEmail = trainerEmail.trim().toLowerCase();

        
        const trainerClasses = await classesCollection.find({
          $or: [
            { trainerEmail: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } },
            { email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } }
          ]
        }).toArray();

        let allBookings = [];
        try {
          allBookings = await bookingsCollection.find({}).toArray();
        } catch (bookingErr) {
          console.log("Bookings fetch skipped:", bookingErr.message);
        }

      
        const enrichedClasses = trainerClasses.map(singleClass => {
          const classIdStr = singleClass._id ? singleClass._id.toString() : '';
          
          const attendees = allBookings
            .filter(book => 
              (book.classId && book.classId === classIdStr) || 
              (book.className && book.className === singleClass.name)
            )
            .map(book => ({
              name: book.userName || book.name || "Active Member",
              email: book.userEmail || book.email || "No Email"
            }));

          return {
            ...singleClass,
            attendees: attendees
          };
        });

        res.send(enrichedClasses);
      } catch (error) {
        console.error("Trainer classes route error:", error);
        res.status(500).send({ message: error.message });
      }
    });

    // ২. ট্রেইনারের নিজের ক্লাস ডিলিট করার এপিআই
    app.delete('/api/classes/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await classesCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });
app.patch('/api/classes/increment-booking/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userEmail } = req.body;

        const result = await classesCollection.updateOne(
            { _id: new ObjectId(id) },
            { 
                $inc: { bookedSlots: 1 }, 
                $push: { attendees: userEmail } 
            }
        );
        res.send({ success: true, result });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});



//  } finally {
    
 // }
//}


    // 9. STRIPE PAYMENT INTENT GENERATION PIPELINE 
    
    app.post("/api/create-payment-intent", async (req, res) => { 
      try {
        const { price } = req.body;
        
        if (!price || isNaN(price)) {
          return res.status(400).send({ message: "Invalid or missing price parameter" });
        }

        
        const amount = Math.round(parseFloat(price) * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).send({ message: "Stripe Intent generation failure", error: error.message });
      }
    });

//run().catch(console.dir);

app.listen(port, () => {
  console.log(` Server is running hot on port: ${port}`);
});

module.exports=app;


