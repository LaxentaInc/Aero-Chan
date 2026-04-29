import mongoose from "mongoose";
require('dotenv').config(); // Load .env file

const {
  MONGO_URI
} = process.env;

// Check if the model is already compiled
export default mongoose.models.GuildPrefix || mongoose.model('GuildPrefix', new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  prefix: {
    type: String,
    required: true
  }
}));