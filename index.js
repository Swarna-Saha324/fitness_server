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

