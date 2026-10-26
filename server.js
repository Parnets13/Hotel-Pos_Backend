// ─── Timezone: MUST be set before anything creates a Date ───────────────────
// Every business-day calculation (the 3 AM cutoff, sales-report date windows,
// invoice/KOT day counters) uses server LOCAL time. Cloud VMs default to UTC,
// which would shift the cutoff by 5:30 and silently file late-night bills under
// the wrong trading day. Pin it explicitly.
process.env.TZ = process.env.TZ || "Asia/Kolkata";

const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
// Load environment variables from .env file
dotenv.config();
// Initialize Express app
const app = express();
// Middleware to parse JSON with increased limit for file uploads
app.use(express.json({ limit: '50mb' }));
// Middleware to parse URL-encoded data with increased limit
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Enable CORS for all routes - Allow all origins for React Native development
app.use(cors({ 
  origin: true, // Allow all origins for React Native
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-Requested-With']
})); // Vite dev aur production

// Handle preflight OPTIONS requests explicitly - MUST come before other routes
app.options('*', cors());
// Define the rate limiter

// Use morgan for logging - DISABLED to reduce log noise
// app.use(morgan("dev"));
// app.use(
//   helmet({
//     contentSecurityPolicy: {
//       useDefaults: true,
//       directives: {
//         "img-src": [
//           "'self'",
//           "data:",
//           "http://localhost:3000",
//           "http://localhost:5173",
//           "https://hotel-pos-backend-rfa4.onrender.com",
//           "https://hotelvirat.s3.amazonaws.com"
//         ],
//       },
//     },
//     crossOriginResourcePolicy: { policy: "cross-origin" },
//   })
// );
// Create upload directories if they don't exist - with error handling
const createDirIfNotExists = (dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log("✅ Created directory:", dirPath);
    }
  } catch (err) {
    console.warn("⚠️  Could not create directory:", dirPath, "-", err.message);
    console.warn("   → If using file uploads, ensure the app has write permissions or pre-create this directory manually");
  }
};
createDirIfNotExists("uploads");
createDirIfNotExists("uploads/profile");
createDirIfNotExists("uploads/category");
createDirIfNotExists("uploads/menu");
createDirIfNotExists("uploads/offer");
createDirIfNotExists("uploads/rooms");
createDirIfNotExists("uploads/table");
createDirIfNotExists("uploads/documents");
createDirIfNotExists("uploads/events");
createDirIfNotExists("uploads/gallery");

// Serve static files from the "uploads" directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// MongoDB Connection with better error handling and reconnection
// Database connection — read from .env. MONGODBURL is this project's variable
// (MONGO_URI / MONGODB_URI also accepted). There is deliberately NO silent
// fallback, so data can never accidentally land on an old/wrong database; if
// the connection string is missing the server refuses to start.
const mongoURI =
  process.env.MONGO_URI ||
  process.env.MONGODBURL ||
  process.env.MONGODB_URI;
if (!mongoURI) {
  console.error("❌ No MongoDB connection string found. Set MONGODBURL (or MONGO_URI) in .env.");
  process.exit(1);
}

// MongoDB Connection with automatic retry on failure.
// If the initial connection fails (transient Atlas/network slowness), retry
// every 5s instead of leaving the server running with no DB — a no-DB server
// still answers requests, but every query buffers and times out
// ("findOne() buffering timed out"). Crons start exactly once, on first
// successful connect.
let cronsStarted = false;
function startCrons() {
  if (cronsStarted) return;
  cronsStarted = true;
  const {
    startMonthlyServiceChargeCron,
    startBirthdayCron,
    startExpiryReminderCron,
    startAnniversaryCron,
    startMonthlyStatementCron,
  } = require("./services/monthlyServiceChargeCron");
  startMonthlyServiceChargeCron();
  startBirthdayCron();
  startExpiryReminderCron();
  startAnniversaryCron();
  startMonthlyStatementCron();
}

function connectWithRetry(attempt = 1) {
  mongoose
    .connect(mongoURI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    })
    .then(() => {
      console.log("✅ MongoDB Connected Successfully");
      console.log("📊 Database:", mongoose.connection.name);
      startCrons();
    })
    .catch((err) => {
      console.error(`❌ MongoDB connection attempt ${attempt} failed:`, err.message);
      console.error("⚠️  Retrying in 5 seconds...");
      setTimeout(() => connectWithRetry(attempt + 1), 5000);
    });
}
connectWithRetry();
// MongoDB connection event handlers
mongoose.connection.on('connected', () => {
  console.log('🔗 MongoDB connection established');
});
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
});
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});
mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconnected');
});
// Use Routes — only active routes for this project
const userRoutes = require("./routes/userRoutes");
const branchRoutes = require("./routes/branchRoutes");
// const restaurantBranchRoutes = require("./routes/restaurantBranchRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const subcategoryRoutes = require("./routes/subcategoryRoutes");
const menuRoutes = require("./routes/menuRoutes");
// const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
// const couponRoutes = require("./routes/couponRoutes");
const aboutUsRoutes = require("./routes/aboutUsRoutes");
const helpSupportRoutes = require("./routes/helpSupportRoutes");
const termsRoutes = require("./routes/termsRoutes");
const addressRoutes = require("./routes/addressRoutes");
const adminRoutes = require("./routes/adminRoutes");
const counterLoginRoutes = require("./routes/counterLoginRoutes");
// const customerDetailsRoutes = require("./routes/customerDetailsRoutes");
const counterInvoiceRoutes = require("./routes/counterInvoiceRoutes");
const staffLoginRoutes = require("./routes/staffLoginRoutes");
const tableRoutes = require("./routes/tableRoutes");
// const peopleSelectionRoutes = require("./routes/peopleSelectionRoutes");
const staffOrderRoutes = require("./routes/staffOrderRoutes");
const mobileStaffOrderRoutes = require("./routes/mobileStaffOrderRoutes");
const counterOrderRoutes = require("./routes/counterOrderRoutes");
const billingSessionRoutes = require("./routes/billingSessionRoutes");
const counterBillRoutes = require("./routes/counterBillRoutes");
const serverRoutes = require("./routes/serverRoutes");
// const staffInvoiceRoutes = require("./routes/staffInvoiceRoutes");
// const recipeRoutes = require("./routes/recipeRoutes");
// const customerRoutes = require("./routes/customerRoutes");
// const supplierRoutes = require("./routes/supplierRoutes");
// const purchaseRoutes = require("./routes/purchaseRoutes");
// const rawMaterialRoutes = require("./routes/rawMaterialRoutes");
// const RawMaterial = require("./routes/rawMaterialRoutes");
const reservationRoutes = require("./routes/reservationRoutes");
// const goodsReceiptNoteRoutes = require("./routes/goodReceipNotesRoutes");
// const expenseRoutes = require("./routes/expenseRoutes");
const purchaseUserRoutes = require("./routes/purchaseUserRoutes");
const productSubmissionRoutes = require("./routes/productSubmissionRoutes");
// const stockRoutes = require("./routes/stockInwardRoutes");
// const storeLocationRoutes = require("./routes/storeLocationRoutes");
// const inventoryRoutes = require("./routes/inventoryRoutes");
// const subscriptionRoutes = require("./routes/subscriptionRoutes");
// const subscriptionOrderRoutes = require("./routes/subscriptionOrderRoutes");
// const mealOfTheDayRoutes = require("./routes/mealOfTheDayRoutes");
// const roomRoutes = require("./routes/roomRoutes");
// const roomBookingRoutes = require("./routes/roomBookingRoutes");
// const mobileRoomBookingRoutes = require("./routes/mobileRoomBookingRoutes");
// const housekeepingRoutes = require("./routes/housekeepingRoutes");
const categoryAccessRoutes = require("./routes/categoryAccessRoutes");
// const receptionistAccessRoutes = require("./routes/receptionistAccessRoutes");

// Bill Reset Routes
const billResetRoutes = require("./routes/billResetRoutes");

// Website Routes — commented out (not in use)
const websiteRoutes = require("./routes/websiteRoutes");

// Restaurant Profile Adapter Routes
const restaurantProfileRoutes = require("./routes/restaurantProfileRoutes");
// Public Restaurant Order Routes
const publicRestaurantOrderRoutes = require("./routes/publicRestaurantOrderRoutes");

// Membership Routes
const memberAuthRoutes = require("./membership/routes/memberAuthRoutes");
const memberRoutes = require("./membership/routes/memberRoutes");
const walletRoutes = require("./membership/routes/walletRoutes");
const eventRoutes = require("./membership/routes/eventRoutes");
const feedbackRoutes = require("./membership/routes/feedbackRoutes");
const memberOrderRoutes = require("./membership/routes/memberOrderRoutes");
const galleryRoutes = require("./membership/routes/galleryRoutes");
const blacklistRoutes = require("./membership/routes/blacklistRoutes");
const salesReportRoutes = require("./routes/salesReportRoutes");
// hotel Routes — active
app.use("/api/v1/hotel/user-auth", userRoutes);
app.use("/api/v1/hotel/branch", branchRoutes);
// app.use("/api/v1/hotel/restaurant-branches", restaurantBranchRoutes);
app.use("/api/v1/hotel", restaurantProfileRoutes);
app.use("/api/v1/hotel/category", categoryRoutes);
app.use("/api/v1/hotel/subcategory", subcategoryRoutes);
app.use("/api/v1/hotel/menu", menuRoutes);
// app.use("/api/v1/hotel/cart", cartRoutes);
app.use("/api/v1/hotel/order", orderRoutes);
// app.use("/api/v1/hotel/coupon", couponRoutes);
app.use("/api/v1/hotel/about-us", aboutUsRoutes);
app.use("/api/v1/hotel/help-support", helpSupportRoutes);
app.use("/api/v1/hotel/terms", termsRoutes);
app.use("/api/v1/hotel/address", addressRoutes);
app.use("/api/v1/hotel/admin-auth", adminRoutes);
app.use("/api/v1/hotel/counter-auth", counterLoginRoutes);
// app.use("/api/v1/hotel/customer-details", customerDetailsRoutes);
app.use("/api/v1/hotel/counter-invoice", counterInvoiceRoutes);
app.use("/api/v1/hotel/staff-auth", staffLoginRoutes);
app.use("/api/v1/hotel/table", tableRoutes);
// app.use("/api/v1/hotel/people-selection", peopleSelectionRoutes);
app.use("/api/v1/hotel/staff-order", staffOrderRoutes);
app.use("/api/v1/hotel/mobile-staff-order", mobileStaffOrderRoutes);
app.use("/api/v1/hotel/counter-order", counterOrderRoutes);
app.use("/api/v1/hotel/billing-session", billingSessionRoutes);
app.use("/api/v1/hotel/servers", serverRoutes);
app.use("/api/v1/hotel/counter-bill", counterBillRoutes);
// app.use("/api/v1/hotel/staff-invoice", staffInvoiceRoutes);
// app.use("/api/v1/hotel/raw-materials", RawMaterial);
// app.use("/api/v1/hotel/recipes", recipeRoutes);
// app.use("/api/v1/hotel/customer", customerRoutes);
// app.use("/api/v1/hotel/supplier", supplierRoutes);
// app.use("/api/v1/hotel/purchase", purchaseRoutes);
// app.use("/api/v1/hotel/raw-material", rawMaterialRoutes);
// app.use("/api/v1/hotel/grn", goodsReceiptNoteRoutes);
app.use("/api/v1/hotel/reservation", reservationRoutes);
// app.use("/api/v1/hotel/expense", expenseRoutes);
app.use("/api/v1/hotel/purchase-user-auth", purchaseUserRoutes);
app.use("/api/v1/hotel/product-submission", productSubmissionRoutes);
// app.use("/api/v1/hotel/stock", stockRoutes);
// app.use("/api/v1/hotel/store-location", storeLocationRoutes);
// app.use("/api/v1/hotel/inventory", inventoryRoutes);
// app.use("/api/v1/hotel/subscription", subscriptionRoutes);
// app.use("/api/v1/hotel/subscription-order", subscriptionOrderRoutes);
// app.use("/api/v1/hotel/meal-of-the-day", mealOfTheDayRoutes);
// app.use("/api/v1/hotel/room", roomRoutes);
// app.use("/api/v1/hotel/room-booking", roomBookingRoutes);
// app.use("/api/v1/hotel/mobile-room-booking", mobileRoomBookingRoutes);
// app.use("/api/v1/hotel/housekeeping", housekeepingRoutes);
app.use("/api/v1/hotel/category-access", categoryAccessRoutes);
app.use("/api/v1/hotel/admin-access", require("./routes/adminAccessRoutes"));
// app.use("/api/v1/hotel/receptionist-access", receptionistAccessRoutes);

// Public Restaurant Order Routes
app.use("/api/v1/hotel/public-order", publicRestaurantOrderRoutes);

// Membership Routes
app.use("/api/v1/hotel/member-auth", memberAuthRoutes);
app.use("/api/v1/hotel/member", memberRoutes);
app.use("/api/v1/hotel/wallet", walletRoutes);
app.use("/api/v1/hotel/events", eventRoutes);
app.use("/api/v1/hotel/feedback", feedbackRoutes);
app.use("/api/v1/hotel/member-orders", memberOrderRoutes);
app.use("/api/v1/hotel/gallery", galleryRoutes);
app.use("/api/v1/hotel/blacklist", blacklistRoutes);
app.use("/api/v1/hotel/sales-report", salesReportRoutes);
app.use("/api/v1/hotel/sports", require("./membership/routes/sportRoutes"));
app.use("/api/v1/hotel/affiliated-members", require("./membership/routes/affiliatedMemberRoutes"));

// Bill Reset Routes
app.use("/api/v1/hotel/bill-reset", billResetRoutes);

// Website Routes
app.use("/api/website", websiteRoutes);

// Serve React Frontend Build (add your build folder here)
// This must come AFTER all API routes
app.use(express.static(path.join(__dirname, 'build')));

// Redirect all non-API GET requests to the index.html file (for React Router)
// IMPORTANT: Only handle GET requests to avoid interfering with API routes
app.get("*", (req, res, next) => {
  // Only serve index.html for non-API routes
  if (!req.url.startsWith('/api') && !req.url.startsWith('/uploads')) {
    const indexPath = path.join(__dirname, 'build', 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    } else {
      return res.status(404).json({ 
        success: false, 
        message: 'Frontend build not found. Please add build folder to backend.' 
      });
    }
  }
  next();
});

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error("=== GLOBAL ERROR HANDLER ===");
  console.error("Error:", err);
  console.error("Error type:", err && err.constructor ? err.constructor.name : 'Unknown');
  console.error("Error message:", err && err.message ? err.message : 'No message');
  console.error("Request URL:", req.url);
  console.error("Request method:", req.method);

  // Mongoose validation error → 400
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message).join(', ')
    return res.status(400).json({
      success: false,
      message: messages || 'Validation error',
      error: messages,
    })
  }

  // Mongoose CastError (bad ObjectId) → 400
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid value for field: ${err.path}`,
      error: err.message,
    })
  }

  // Use status already set by controller, or default to 500
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal server error",
    error: err.message,
    debug: {
      errorType: err.constructor.name,
      timestamp: new Date().toISOString(),
      url: req.url,
      method: req.method
    },
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});
// Define Port
const PORT = process.env.PORT || 9000;
// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Server accessible at: http://0.0.0.0:${PORT}`);
  console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
});

// ─── Socket.IO for real-time KOT notifications ─────────────────────────────
const { Server: SocketServer } = require('socket.io');
const io = new SocketServer(server, {
  cors: { origin: true, methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

// Export io so controllers can emit events
app.set('io', io);