const asyncHandler = require("express-async-handler");
const Member = require("../models/Member");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

// Helper function to save uploaded file locally
const saveFileLocally = (file, folder) => {
  const uploadsDir = path.join(__dirname, "../../uploads", folder);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const ext = path.extname(file.originalname);
  const filename = `${path.basename(file.originalname, ext)}-${uniqueSuffix}${ext}`;
  const filepath = path.join(uploadsDir, filename);
  fs.writeFileSync(filepath, file.buffer);
  return `/uploads/${folder}/${filename}`;
};

// @desc    Create new member (Admin only)
// @route   POST /api/v1/hotel/member/create
// @access  Private/Admin
const createMember = asyncHandler(async (req, res) => {
  const { name, email, password, phone, dateOfBirth, address, joiningDate, validUntil, initialWalletBalance, membershipType, membershipId } = req.body;

  if (!name || !email || !password || !phone) {
    res.status(400);
    throw new Error("Please provide all required fields: name, email, password, phone");
  }

  // Check if email already exists
  const existingMember = await Member.findOne({ email });
  if (existingMember) {
    res.status(400);
    throw new Error("Member with this email already exists");
  }

  // Check if phone already exists
  const existingPhone = await Member.findOne({ phone });
  if (existingPhone) {
    res.status(400);
    throw new Error("Member with this phone number already exists");
  }

  // Check if membershipId already exists (if provided)
  if (membershipId) {
    const existingId = await Member.findOne({ membershipId });
    if (existingId) {
      res.status(400);
      throw new Error("This membership ID is already in use");
    }
  }
  const member = await Member.create({
    name,
    email,
    password,
    phone,
    dateOfBirth,
    address,
    membershipType: membershipType || "Member",
    membershipId: membershipId || undefined,
    registrationStatus: "completed",
    joiningDate: joiningDate || Date.now(),
    validUntil: validUntil || new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
    walletBalance: initialWalletBalance || 0,
  });

  // Generate QR code
  const qrData = JSON.stringify({
    memberId: member._id,
    memberNumber: member.memberNumber,
    name: member.name,
    membershipType: member.membershipType,
  });

  const qrCodeBase64 = await QRCode.toDataURL(qrData, {
    width: 300,
    margin: 2,
  });

  member.qrCode = qrCodeBase64;
  await member.save();

  res.status(201).json({
    success: true,
    message: "Member created successfully",
    member,
  });
});

// @desc    Get all members (Admin only)
// @route   GET /api/v1/hotel/member/all
// @access  Private/Admin
const getAllMembers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, membershipType, isActive } = req.query;

  const query = {};

  // Search by name, email, or member number
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { memberNumber: { $regex: search, $options: "i" } },
    ];
  }

  // Filter by membership type
  if (membershipType) {
    query.membershipType = membershipType;
  }

  // Filter by active status
  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  }

  const members = await Member.find(query)
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const count = await Member.countDocuments(query);

  res.json({
    success: true,
    members,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    total: count,
  });
});

// @desc    Get single member by ID (Admin only)
// @route   GET /api/v1/hotel/member/:id
// @access  Private/Admin
const getMemberById = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);

  if (!member) {
    res.status(404);
    throw new Error("Member not found");
  }

  res.json({
    success: true,
    member,
  });
});

// @desc    Update member (Admin only)
// @route   PUT /api/v1/hotel/member/:id
// @access  Private/Admin
const updateMember = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);

  if (!member) {
    res.status(404);
    throw new Error("Member not found");
  }

  const {
    name,
    email,
    phone,
    dateOfBirth,
    isActive,
    validUntil,
    joiningDate,
    address,
    discountPercentage,
  } = req.body;

  // Update fields
  if (name) member.name = name;
  if (email) member.email = email;
  if (phone) member.phone = phone;
  if (dateOfBirth) member.dateOfBirth = dateOfBirth;
  if (isActive !== undefined) member.isActive = isActive;
  if (validUntil) member.validUntil = validUntil;
  if (joiningDate) member.joiningDate = joiningDate;
  if (address) member.address = address;
  if (discountPercentage !== undefined) member.discountPercentage = Number(discountPercentage);
  if (req.body.monthlyServiceCharge !== undefined) member.monthlyServiceCharge = Number(req.body.monthlyServiceCharge);

  const updatedMember = await member.save();

  res.json({
    success: true,
    message: "Member updated successfully",
    member: updatedMember,
  });
});

// @desc    Delete/Deactivate member (Admin only)
// @route   DELETE /api/v1/hotel/member/:id
// @access  Private/Admin
const deleteMember = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);

  if (!member) {
    res.status(404);
    throw new Error("Member not found");
  }

  // Soft delete - just deactivate
  member.isActive = false;
  await member.save();

  res.json({
    success: true,
    message: "Member deactivated successfully",
  });
});

// @desc    Upload member document (Aadhar/Passport)
// @route   POST /api/v1/hotel/member/upload-document
// @access  Private/Admin
const uploadDocument = asyncHandler(async (req, res) => {
  const { memberId, documentType } = req.body;

  if (!memberId || !documentType || !req.file) {
    res.status(400);
    throw new Error("Please provide memberId, documentType, and file");
  }

  if (!["aadhar", "passport", "pan", "profilePhoto"].includes(documentType)) {
    res.status(400);
    throw new Error("Document type must be 'aadhar', 'passport', 'pan', or 'profilePhoto'");
  }

  const member = await Member.findById(memberId);

  if (!member) {
    res.status(404);
    throw new Error("Member not found");
  }

  // Save file locally
  const fileUrl = saveFileLocally(req.file, documentType === "profilePhoto" ? "profile" : "documents");

  // Update member document or profile image
  if (documentType === "profilePhoto") {
    member.profileImage = fileUrl;
  } else {
    member.documents[documentType] = fileUrl;
  }
  await member.save();

  res.json({
    success: true,
    message: `${documentType.toUpperCase()} uploaded successfully`,
    documentUrl: fileUrl,
  });
});

// @desc    Scan member QR code (Staff/Counter)
// @route   POST /api/v1/hotel/member/scan-qr
// @access  Private
const scanMemberQR = asyncHandler(async (req, res) => {
  const { qrData } = req.body;

  if (!qrData) {
    res.status(400);
    throw new Error("Please provide QR code data");
  }

  let memberId;

  // Support both formats:
  // 1. URL format: https://hotel-pos-backend-rfa4.onrender.com/member/<id>
  // 2. Legacy JSON format: {"memberId":"...","memberNumber":"...","name":"..."}
  if (qrData.startsWith("http")) {
    // Extract member ID from URL (last path segment)
    const parts = qrData.split("/");
    memberId = parts[parts.length - 1];
  } else {
    try {
      const parsed = JSON.parse(qrData);
      memberId = parsed.memberId;
    } catch (error) {
      res.status(400);
      throw new Error("Invalid QR code data");
    }
  }

  if (!memberId) {
    res.status(400);
    throw new Error("Could not extract member ID from QR code");
  }

  const member = await Member.findById(memberId);

  if (!member) {
    res.status(404);
    throw new Error("Member not found");
  }

  // Check if membership is valid
  const isValid = member.isValidMembership();

  res.json({
    success: true,
    isValid,
    member: {
      id: member._id,
      memberNumber: member.memberNumber,
      name: member.name,
      phone: member.phone,
      membershipType: member.membershipType,
      walletBalance: member.walletBalance,
      validUntil: member.validUntil,
      isActive: member.isActive,
    },
    message: isValid ? "Valid membership" : "Membership expired or inactive",
  });
});

// @desc    Upload member photo
// @route   POST /api/v1/hotel/member/upload-photo
// @access  Private/Admin
const uploadPhoto = asyncHandler(async (req, res) => {
  const { memberId } = req.body;

  if (!memberId || !req.file) {
    res.status(400);
    throw new Error("Please provide memberId and photo file");
  }

  const member = await Member.findById(memberId);

  if (!member) {
    res.status(404);
    throw new Error("Member not found");
  }

  // Save photo locally
  const photoUrl = saveFileLocally(req.file, "profile");

  // Update member profile image
  member.profileImage = photoUrl;
  await member.save();

  res.json({
    success: true,
    message: "Photo uploaded successfully",
    photoUrl: photoUrl,
  });
});

// @desc    Admin partial registration — creates member with type+name+phone only
// @route   POST /api/v1/hotel/member/register-partial
// @access  Private/Admin
const registerPartialMember = asyncHandler(async (req, res) => {
  const { name, phone, email, membershipType, membershipId, initialWalletBalance, sendWelcomeEmail } = req.body;

  if (!name || !phone || !membershipType) {
    res.status(400);
    throw new Error("Please provide name, phone, and membershipType");
  }

  // Validate membership type
  const { MEMBERSHIP_TYPES } = require("../models/Member");
  if (!MEMBERSHIP_TYPES.includes(membershipType)) {
    res.status(400);
    throw new Error(`Invalid membership type. Allowed: ${MEMBERSHIP_TYPES.join(", ")}`);
  }

  // Check if phone already exists
  const existingMember = await Member.findOne({ phone });
  if (existingMember) {
    res.status(400);
    throw new Error("A member with this phone number already exists");
  }

  // Generate membership ID if not provided by admin
  let finalMembershipId = membershipId;
  if (!finalMembershipId) {
    finalMembershipId = await Member.generateMembershipId(membershipType, name);
  } else {
    // Check if provided ID is already taken
    const existingId = await Member.findOne({ membershipId: finalMembershipId });
    if (existingId) {
      res.status(400);
      throw new Error("This membership ID is already in use");
    }
  }

  // Create partial member (email captured now, password set later in app)
  const member = await Member.create({
    name,
    phone,
    email: email || undefined,
    membershipType,
    membershipId: finalMembershipId,
    walletBalance: Number(initialWalletBalance) || 0,
    registrationStatus: "pending",
    isActive: false, // Not active until registration is completed
  });

  // Send welcome email with app download link + login details
  if (sendWelcomeEmail && email) {
    try {
      const { sendWelcomeMemberEmail } = require("../../services/emailService");
      sendWelcomeMemberEmail(email, {
        name,
        phone,
        membershipId: finalMembershipId,
        membershipType,
        walletBalance: Number(initialWalletBalance) || 0,
      }).catch((e) => console.warn("[Welcome Email] Failed:", e.message));
    } catch (e) {
      console.warn("[Welcome Email] Error:", e.message);
    }
  }

  res.status(201).json({
    success: true,
    message: "Member registered. Welcome email sent with app download link.",
    member: {
      id: member._id,
      memberNumber: member.memberNumber,
      membershipId: member.membershipId,
      name: member.name,
      phone: member.phone,
      email: member.email,
      membershipType: member.membershipType,
      registrationStatus: member.registrationStatus,
    },
  });
});
   module.exports = {
  createMember,
  getAllMembers,
  getMemberById,
  updateMember,
  deleteMember,
  uploadDocument,
  uploadPhoto,
  scanMemberQR,
  registerPartialMember,
};
