const mongoose = require("mongoose");
const SondageSchema = new mongoose.Schema({
  titre: { type: String, required: true },
  description: { type: String, default: "" },
  categorie: { type: String, default: "societe" },
  options: [{ label: String, votes: { type: Number, default: 0 } }],
  totalVotes: { type: Number, default: 0 },
  actif: { type: Boolean, default: true },
  dureeJours: { type: Number, default: 7 },
  closedAt: { type: Date, default: null },
  votants: [String],
}, { timestamps: true });
const Sondage = mongoose.models.Sondage || mongoose.model("Sondage", SondageSchema);
module.exports = Sondage;
