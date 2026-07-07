import mongoose, { Document, Schema } from 'mongoose';

export interface IAfk extends Document {
  userId: string;
  guildId: string;
  reason: string;
  timestamp: Date;
}

const AfkSchema = new Schema<IAfk>({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  reason: { type: String, default: 'AFK' },
  timestamp: { type: Date, default: Date.now }
});

// A user can only have one AFK status per guild
AfkSchema.index({ userId: 1, guildId: 1 }, { unique: true });

export default mongoose.models.Afk || mongoose.model<IAfk>('Afk', AfkSchema);
