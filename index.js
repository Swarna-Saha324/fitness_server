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

