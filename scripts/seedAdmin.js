/**
 * scripts/seedAdmin.js
 *
 * Idempotently creates (or updates) the admin login in the database the app
 * actually connects to. Defaults to admin@gmail.com / admin123, overridable via
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars.
 *
 * Connection logic mirrors server.js exactly (process.env.MONGO_URI || fallback)
 * so the seeded admin lives in the same database the app authenticates against.
 *
 * Usage:
 *   node scripts/seedAdmin.js
 */
require("dotenv").config();

const mongoose = require("mongoose");
const Admin = require("../model/adminModel");

const EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@gmail.com";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || "admin123";

// Must match server.js' connection logic so the admin lands in the right DB.
const mongoURI =
  process.env.MONGO_URI ||
  process.env.MONGODBURL ||
  process.env.MONGODB_URI;
if (!mongoURI) {
  console.error("❌ No MongoDB connection string. Set MONGODBURL in .env.");
  process.exit(1);
}

(async () => {
  try {
    console.log("Connecting to:", mongoURI.replace(/:([^:@]+)@/, ":***@"));
    await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 15000 });
    console.log("Connected. DB:", mongoose.connection.name);

    let admin = await Admin.findOne({ email: EMAIL });
    if (admin) {
      admin.password = PASSWORD; // marks the field modified → pre-save re-hashes it
      await admin.save();
      console.log(`Updated existing admin: ${EMAIL}`);
    } else {
      admin = await Admin.create({ email: EMAIL, password: PASSWORD });
      console.log(`Created admin: ${EMAIL}`);
    }

    // Verify the credentials actually log in.
    const check = await Admin.findOne({ email: EMAIL });
    const ok = await check.comparePassword(PASSWORD);
    console.log(
      `Verification — login with ${EMAIL} / ${PASSWORD} => ${ok ? "SUCCESS" : "FAIL"}`
    );

    await mongoose.disconnect();
    process.exit(ok ? 0 : 1);
  } catch (err) {
    console.error("seedAdmin error:", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
})();
