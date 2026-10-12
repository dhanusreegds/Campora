const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9_]{3,24}$/,
    },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['seeker', 'helper'], required: true, index: true },
    department: { type: String, trim: true, maxlength: 80, default: '' },
    course: { type: String, trim: true, maxlength: 80, default: '' },
    year: { type: Number, min: 1, max: 6 },
    // For Helpers: skills they can teach. For Seekers: topics they want to learn.
    skills: { type: [String], default: [] },
    bio: { type: String, trim: true, maxlength: 600, default: '' },
    expertise: { type: String, trim: true, maxlength: 600, default: '' },
    availability: { type: String, trim: true, maxlength: 120, default: '' },
    // Prototype flag assigned manually (seed data). It is NOT real credential verification.
    verified: { type: Boolean, default: false },
    points: { type: Number, default: 0, min: 0 },
    studentsHelped: { type: Number, default: 0, min: 0 },
    profileImage: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(String(plain), this.password);
};

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(String(plain), 10);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
