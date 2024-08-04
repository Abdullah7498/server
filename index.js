require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcrypt");
const User = require("./schemas/UserSchema");
const mongoose = require("mongoose");
const cors = require("cors");
const Post = require("./schemas/PostSchemas");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const PORT = process.env.PORT || 3001;
const DATABASE_URL = process.env.DATABASE_URL;

mongoose
  .connect(DATABASE_URL)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage: storage });

app.get("/getUser/:id", async (req, res) => {
  try {
    const _id = req.params.id;
    const user = await User.findOne({ _id });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

app.post("/register", upload.single("profilePhoto"), async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const profilePhoto = req.file ? req.file.path : null;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res
        .status(409)
        .json({ success: false, error: "Username or email already exists" });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      profilePhoto,
    });

    const savedUser = await newUser.save();
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: savedUser,
    });
  } catch (err) {
    console.error("Error registering user:", err);
    res
      .status(500)
      .json({ success: false, error: err.message || "Internal Server Error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid username or password" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid username or password" });
    }

    res.status(200).json({ success: true, message: "Login successful", user });
  } catch (err) {
    console.error("Error logging in:", err);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

app.post("/CreatePost", upload.single("image"), async (req, res) => {
  try {
    const { title, description, user_id } = req.body;
    const image = req.file ? req.file.filename : null;

    const newPost = new Post({ title, description, image, user: user_id });
    const savedPost = await newPost.save();
    res.status(201).json({
      success: true,
      message: "Post created successfully",
      post: savedPost,
    });
  } catch (err) {
    console.error("Error creating post:", err);
    res
      .status(500)
      .json({ success: false, error: "Error creating post: " + err.message });
  }
});

app.get("/getPosts", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res
      .status(400)
      .json({ success: false, error: "User ID is required" });
  }

  try {
    const posts = await Post.find({ user: userId })
      .populate("user", "username profilePhoto")
      .populate({
        path: "comments.user",
        select: "username profilePhoto",
      });

    res.json({ message: "Successfull", success: true, data: posts });
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

app.delete("/deletePost/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const result = await Post.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }
    res
      .status(200)
      .json({ success: true, message: "Post deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/posts/:id/like", async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.body.userId;
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    const alreadyLiked = post.likes.includes(userId);

    if (alreadyLiked) {
      post.likes = post.likes.filter(
        (id) => id.toString() !== userId.toString()
      );
    } else {
      post.likes.push(userId);
    }

    await post.save();

    res.status(200).json(post);
  } catch (err) {
    res.status(500).json(err);
  }
});
app.post("/comment/:id", async (req, res) => {
  try {
    const postID = req.params.id;
    const { userId, text } = req.body;

    if (!userId || !text) {
      return res
        .status(400)
        .json({ error: "User ID and comment text are required" });
    }

    const post = await Post.findById(postID);

    if (!post) {
      return res.status(404).json({ error: "Post does not exist" });
    }

    const user = await User.findById(userId).select("username profilePhoto");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const newComment = {
      user: userId,
      text: text,
    };

    post.comments.push(newComment);
    await post.save();

    await post.populate({
      path: "comments.user",
      select: "username profilePhoto",
    });

    const addedComment = post.comments[post.comments.length - 1];

    res.status(201).json({
      message: "Comment added successfully",
      comment: {
        _id: addedComment._id,
        user: {
          _id: addedComment.user._id,
          username: addedComment.user.username,
          profilePhoto: addedComment.user.profilePhoto,
        },
        text: addedComment.text,
        createdAt: addedComment.createdAt,
      },
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app
  .listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  })
  .on("error", (err) => {
    console.error("Error starting server:", err);
  });
