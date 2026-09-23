const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Home
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Channel Reaction Backend is running 🚀"
  });
});

// Health check
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "Channel Reaction Backend"
  });
});

// Verify Channel
app.post("/api/channel", (req, res) => {
  const { channelLink } = req.body;

  if (!channelLink) {
    return res.status(400).json({
      success: false,
      message: "Channel link is required"
    });
  }

  if (!channelLink.startsWith("https://whatsapp.com/channel/")) {
    return res.status(400).json({
      success: false,
      message: "Invalid WhatsApp Channel link"
    });
  }

  res.json({
    success: true,
    message: "Channel link received",
    channelLink
  });
});

// Prepare reactions
app.post("/api/reactions", (req, res) => {
  const { channelLink, reactions } = req.body;

  if (!channelLink) {
    return res.status(400).json({
      success: false,
      message: "Channel link is required"
    });
  }

  res.json({
    success: true,
    message: "Reaction request received",
   
