import mongoose, { Document, Schema } from 'mongoose';

export interface IGuildPrefix extends Document {
  guildId: string;
  prefix: string;
}

const GuildPrefixSchema = new Schema<IGuildPrefix>({
  guildId: { type: String, required: true, unique: true },
  prefix: { type: String, required: true }
});

export default mongoose.models.GuildPrefix || mongoose.model<IGuildPrefix>('GuildPrefix', GuildPrefixSchema);
