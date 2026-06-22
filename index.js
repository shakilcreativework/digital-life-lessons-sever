const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

// mongodb uri

// middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  }),
);
app.use(express.json());

// ----------------------- mongodb start ---------------------------

const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    // ----------- server db code start --------------

    const db = client.db("digitalLifeLessionsDB");
    const lessonsCollection = db.collection("lessons");

    // get routes
    app.get("/api/lessons", async (req, res) => {
      const lessons = await lessonsCollection.find().toArray();
      res.json(lessons);
    });

    // post routes
    app.post("/api/lessons", async (req, res) => {
      try {
        const newLesson = req.body;
        
        // Insert payload into MongoDB
        const result = await lessonsCollection.insertOne(newLesson);
        
        // Respond back with success metrics
        res.status(201).json({
          success: true,
          message: "Lesson stored successfully!",
          insertedId: result.insertedId
        });
      } catch (error) {
        console.error("Database Insert Error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
      }
    });

    app.get("/api/lessons/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // Verify if string payload is a structurally accurate MongoDB hexadecimal string
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ 
            success: false, 
            error: "The provided database identifier string format is invalid." 
          });
        }

        // Query document using casted ObjectId conversion layer
        const lesson = await lessonsCollection.findOne({ _id: new ObjectId(id) });

        // Fallback protection if document does not exist inside cluster index
        if (!lesson) {
          return res.status(404).json({ 
            success: false, 
            error: "No matching lesson asset document found in database records." 
          });
        }

        // Return the clean lesson document payload directly
        res.json(lesson);
      } catch (error) {
        console.error("Express internal lookup execution failure:", error);
        res.status(500).json({ 
          success: false, 
          error: "Internal server processing failure while reading database streams." 
        });
      }
    });
    // update routes
    // delete routes

    // ----------- server db code ends ---------------
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// ----------------------- mongodb ends ----------------------------

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
