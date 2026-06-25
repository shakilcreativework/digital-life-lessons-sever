const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  }),
);
app.use(express.json());

// MongoDB connection
const uri = process.env.MONGODB_URI;
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

    const db = client.db("digitalLifeLessionsDB");
    const lessonsCollection = db.collection("lessons");
    const reportsCollection = db.collection("lessonsReports");
    const favoritesCollection = db.collection("favorites");
    const commentsCollection = db.collection("comments");
    const usersCollection = db.collection("user");

    // ==========================================
    // 1. LESSON DATA RETRIEVAL (WITH AUTHOR STATS & SIMILAR LESSONS)
    // ==========================================

    // Get all lessons
    app.get("/api/lessons", async (req, res) => {
      const lessons = await lessonsCollection.find().toArray();
      res.json(lessons);
    });

    // Get a specific lesson detail page payload
    app.get("/api/lessons/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({ success: false, error: "Invalid identifier format." });
        }

        const lesson = await lessonsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!lesson) {
          return res.status(404).json({
            success: false,
            error: "No matching lesson asset document found.",
          });
        }

        // STEP 1.2: Compute Total Lessons Created by Author Card
        const totalLessonsCreated = await lessonsCollection.countDocuments({
          creatorId: lesson.creatorId,
        });

        // STEP 7: Fetch up to 6 Similar/Recommended cards matching Category or Emotional Tone
        const recommendedLessons = await lessonsCollection
          .find({
            _id: { $ne: new ObjectId(id) },
            $or: [
              { category: lesson.category },
              { emotionalTone: lesson.emotionalTone },
            ],
          })
          .limit(6)
          .toArray();

        // Send a complete combined response map to the client
        res.json({
          success: true,
          lesson,
          authorStats: { totalLessonsCreated },
          recommendedLessons,
        });
      } catch (error) {
        console.error("Fetch single lesson breakdown execution error:", error);
        res.status(500).json({
          success: false,
          error: "Internal server processing failure.",
        });
      }
    });

    // Get users
    app.get("/api/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();

        const usersWithStats = await Promise.all(
          users.map(async (user) => {
            const userIdString = user._id.toString();

            const lessonCount = await lessonsCollection.countDocuments({
              creatorId: userIdString,
            });

            return {
              _id: user._id,
              name: user.name || "User Profile",
              email: user.email,
              image: user.image,
              role: user.role || "user",
              isPremium: user.isPremium || false,
              totalLessons: lessonCount,
            };
          }),
        );

        res.json(usersWithStats);
      } catch (err) {
        console.error("❌ Failed to resolve users statistics payload:", err);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // Get Reports
    app.get("/api/lessonsReports", async (req, res) => {
      const lessonsReports = await reportsCollection.find().toArray();
      res.json(lessonsReports);
    });

    // Create a new lesson document entry
    app.post("/api/lessons", async (req, res) => {
      try {
        const newLesson = {
          ...req.body,
          likes: [],
          likesCount: 0,
          comments: [],
          CommentsCount: 0,
          isFeatured: false,
          isReviewed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await lessonsCollection.insertOne(newLesson);
        res.status(201).json({
          success: true,
          message: "Lesson stored successfully!",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Database Insert Error:", error);
        res
          .status(500)
          .json({ success: false, error: "Internal Server Error" });
      }
    });

    // Content Violation Reporting Pipeline Data Logging Handler
    app.post("/api/lessons/:id/report", async (req, res) => {
      try {
        const { id } = req.params;
        // 🟢 Destructure both 'reason' and 'details' fields coming from the body payload
        const { reporterUserId, reportedUserEmail, reason, details } = req.body;

        const reportDocument = {
          lessonId: new ObjectId(id),
          reporterUserId: new ObjectId(reporterUserId),
          reportedUserEmail,
          reason,
          details: details || "",
          timestamp: new Date(),
        };

        await reportsCollection.insertOne(reportDocument);

        res.status(201).json({
          success: true,
          message: "Thank you for your review request flag.",
        });
      } catch (error) {
        console.error("Reporting engine sync error:", error);
        res.status(500).json({
          success: false,
          error: "Reporting engine submission failed.",
        });
      }
    });

    // Comments api
    app.post("/api/lessons/:id/comment", async (req, res) => {
      try {
        const { id } = req.params;
        const { userId, authorName, authorImg, text } = req.body;

        const newCommentId = new ObjectId();

        // 1. Log structural timestamp record inside the standalone historical ledger
        await commentsCollection.insertOne({
          _id: newCommentId,
          lessonId: new ObjectId(id),
          userId: new ObjectId(userId),
          text,
          createdAt: new Date(),
        });

        // 2. Prepend the UI configuration snapshot onto the parent component block array directly
        const inlineCommentPayload = {
          _id: newCommentId.toString(),
          userId,
          authorName,
          authorImg,
          text,
          createdAt: new Date().toISOString(),
        };

        await lessonsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $push: {
              comments: { $each: [inlineCommentPayload], $position: 0 },
            },
            $inc: { CommentsCount: 1 },
          },
        );

        res.status(201).json({ success: true, comment: inlineCommentPayload });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, error: "Comment insertion failed." });
      }
    });

    // Handle both Promotion and Demotion
    app.patch("/api/users/:id/role", async (req, res) => {
      try {
        const userId = req.params.id;
        const { role } = req.body;
        
        if (role !== "admin" && role !== "user") {
          return res
            .status(400)
            .json({ error: "Invalid role type requested." });
        }

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { role: role } },
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ error: "Target platform account not found." });
        }

        res.json({
          success: true,
          message: `Account successfully changed to ${role}.`,
        });
      } catch (err) {
        console.error("❌ Failed to update user access role:", err);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // Done: Atomic Like / Unlike Toggle Operation Backend Handler
    app.patch("/api/lessons/:id/like", async (req, res) => {
      try {
        const { id } = req.params;
        const { userId } = req.body; // In production, replace this with validated JWT session decoding layers

        if (!userId) {
          return res.status(401).json({
            success: false,
            error: "Please log in to like this lesson.",
          });
        }

        const lesson = await lessonsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!lesson)
          return res
            .status(404)
            .json({ success: false, error: "Lesson not found." });

        const userHasLiked = lesson.likes && lesson.likes.includes(userId);

        // Atomic array manipulation block patterns
        const updateQuery = userHasLiked
          ? { $pull: { likes: userId }, $inc: { likesCount: -1 } }
          : { $addToSet: { likes: userId }, $inc: { likesCount: 1 } };

        await lessonsCollection.updateOne(
          { _id: new ObjectId(id) },
          updateQuery,
        );

        res.json({ success: true, isLiked: !userHasLiked });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: "Operation execution processing failed.",
        });
      }
    });

    // Done: Atomic Favorite / Unfavorite Toggle Operation Backend Handler
    app.patch("/api/lessons/:id/favorite", async (req, res) => {
      try {
        const { id } = req.params;
        const { userId } = req.body; // In production, replace this with validated JWT session decoding layers

        if (!userId) {
          return res.status(401).json({
            success: false,
            error: "Please log in to favorite this lesson.",
          });
        }

        const lesson = await lessonsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!lesson)
          return res
            .status(404)
            .json({ success: false, error: "Lesson not found." });

        const userHasbookmarked =
          lesson.bookmarkedBy && lesson.bookmarkedBy.includes(userId);

        // Atomic array manipulation block patterns
        const updateQuery = userHasbookmarked
          ? { $pull: { bookmarkedBy: userId }, $inc: { bookmarkedByCount: -1 } }
          : {
              $addToSet: { bookmarkedBy: userId },
              $inc: { bookmarkedByCount: 1 },
            };

        await lessonsCollection.updateOne(
          { _id: new ObjectId(id) },
          updateQuery,
        );

        res.json({ success: true, isBookmarked: !userHasbookmarked });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: "Operation execution processing failed.",
        });
      }
    });

    // ==========================================
    // DATABASE CHECK / MONITORING
    // ==========================================
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (err) {
    console.dir(err);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Life Lesson API Hub Online.");
});

app.listen(port, () => {
  console.log(`Server executing active tasks on port ${port}`);
});
