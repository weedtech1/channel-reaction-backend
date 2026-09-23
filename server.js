const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Channel Reaction Backend is running 🚀"
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "Channel Reaction Backend"
  });
});

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

  return res.json({
    success: true,
    message: "Channel link received",
    channelLink
  });
});

app.post("/api/reactions", (req, res) => {
  const { channelLink, reactions } = req.body;

  if (!channelLink) {
    return res.status(400).json({
      success: false,
      message: "Channel link is required"
    });
  }

  return res.json({
    success: true,
    message: "Reaction request received",
    channelLink,
    reactions: reactions || {}
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
