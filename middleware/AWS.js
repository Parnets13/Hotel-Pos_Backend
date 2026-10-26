/**
 * middleware/AWS.js
 *
 * File storage layer used across the app's controllers (branch, category,
 * menu, room, table, coupon, user, expense, productSubmission, membership
 * events, etc.). Exports two functions:
 *
 *   - uploadFile2(buffer, originalname, mimetype)   // memory-storage form
 *   - uploadFile2(file, folder)                     // multer-file form
 *   - deleteFile(urlOrKey)                          // remove a stored file
 *
 * Storage strategy:
 *   - When AWS credentials + a bucket are present in the environment, files
 *     are uploaded to S3 and full https URLs are returned (the original intent
 *     of this module — see the commented helmet CSP referencing
 *     https://hotelvirat.s3.amazonaws.com).
 *   - Otherwise it falls back to local disk storage under <root>/uploads,
 *     returning relative paths like "/uploads/<folder>/<file>". This matches
 *     the convention already used by membership/controllers/sportController,
 *     memberController and galleryController, and the frontend resolvers in
 *     Branches.jsx / Categories.jsx / MembershipCard.jsx prepend the backend
 *     root to those paths.
 */

const fs = require("fs");
const path = require("path");

const BACKEND_ROOT = path.join(__dirname, "..");
const UPLOADS_ROOT = path.join(BACKEND_ROOT, "uploads");

// ─── AWS S3 configuration (optional) ────────────────────────────────────────
const S3_BUCKET =
  process.env.AWS_S3_BUCKET ||
  process.env.AWS_BUCKET_NAME ||
  process.env.S3_BUCKET ||
  "";
const S3_REGION =
  process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1";
const S3_ACCESS_KEY =
  process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY || "";
const S3_SECRET_KEY =
  process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY || "";
// Optional custom base URL / CDN. When set, returned URLs use this prefix
// instead of the default S3 endpoint Location.
const S3_BASE_URL = process.env.AWS_S3_BASE_URL || process.env.S3_BASE_URL || "";

const USE_S3 = Boolean(S3_BUCKET && S3_ACCESS_KEY && S3_SECRET_KEY);

let s3 = null;
if (USE_S3) {
  try {
    const AWS = require("aws-sdk");
    AWS.config.update({
      accessKeyId: S3_ACCESS_KEY,
      secretAccessKey: S3_SECRET_KEY,
      region: S3_REGION,
    });
    s3 = new AWS.S3();
  } catch (err) {
    console.warn(
      "⚠️  middleware/AWS: aws-sdk could not be initialised, using local storage instead:",
      err.message
    );
  }
}

const ACTIVE_S3 = Boolean(s3);

if (ACTIVE_S3) {
  console.log("☁️  middleware/AWS: S3 storage active (bucket:", S3_BUCKET + ")");
} else {
  console.log(
    "📁 middleware/AWS: local disk storage active at",
    UPLOADS_ROOT,
    USE_S3 ? "(S3 init failed)" : "(no AWS credentials in .env)"
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Build a unique, filesystem-safe filename, preserving the original extension.
 */
function buildFilename(originalname) {
  const ext = path.extname(originalname || "").toLowerCase();
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Upload a Buffer to S3 under `<folder>/<filename>` and return its public URL.
 */
async function uploadBufferToS3(buffer, folder, filename, mimetype) {
  const key = `${folder}/${filename}`;
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype || "application/octet-stream",
    ACL: "public-read",
  };
  const result = await s3.upload(params).promise();
  if (S3_BASE_URL) {
    return `${S3_BASE_URL.replace(/\/+$/, "")}/${key}`;
  }
  return result.Location;
}

/**
 * Write a Buffer to <root>/uploads/<folder>/<filename> and return its public
 * relative path "/uploads/<folder>/<filename>".
 */
function uploadBufferToLocal(buffer, folder, filename) {
  const dir = path.join(UPLOADS_ROOT, folder);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `/uploads/${folder}/${filename}`;
}

/**
 * Upload a raw Buffer (memory-storage multer files, or controllers that read
 * the file into a buffer themselves).
 */
async function uploadBuffer(buffer, originalname, mimetype, folder) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error(
      "uploadFile2: no file buffer available (multer may be using disk storage — pass the file object instead)"
    );
  }
  const filename = buildFilename(originalname);
  if (ACTIVE_S3) {
    return await uploadBufferToS3(buffer, folder, filename, mimetype);
  }
  return uploadBufferToLocal(buffer, folder, filename);
}

/**
 * Handle a multer file object that was saved to disk (file.path set, no
 * buffer). The file is already on disk under uploads/; for local storage we
 * just return its URL, for S3 we read it and upload it.
 */
async function uploadDiskFile(file, folder) {
  const srcPath = path.resolve(file.path);
  const filename = path.basename(srcPath);

  if (ACTIVE_S3) {
    const buffer = fs.readFileSync(srcPath);
    return await uploadBufferToS3(buffer, folder, filename, file.mimetype);
  }

  // Local: if multer already saved it under uploads/, return that path.
  const rel = path.relative(UPLOADS_ROOT, srcPath).replace(/\\/g, "/");
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return `/uploads/${rel}`;
  }

  // Otherwise copy it into the requested folder under uploads/.
  const dir = path.join(UPLOADS_ROOT, folder);
  ensureDir(dir);
  fs.copyFileSync(srcPath, path.join(dir, filename));
  return `/uploads/${folder}/${filename}`;
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Upload a file. Supports two call signatures used across the codebase:
 *
 *   uploadFile2(buffer, originalname, mimetype)  // 3-arg, memory/buffer form
 *   uploadFile2(file, folder)                   // 2-arg, multer-file form
 *
 * Returns a public URL string (S3 https URL, or a "/uploads/..." local path).
 */
async function uploadFile2(arg1, arg2, arg3) {
  // Signature 1: (buffer, originalname, mimetype)
  if (arg3 !== undefined && Buffer.isBuffer(arg1)) {
    return await uploadBuffer(arg1, arg2, arg3, "general");
  }

  // Signature 2: (file, folder)
  const file = arg1;
  const folder = (arg2 && String(arg2)) || "general";
  if (!file || typeof file !== "object") {
    throw new Error("uploadFile2: no file provided");
  }

  // memory storage → file.buffer
  if (file.buffer) {
    return await uploadBuffer(file.buffer, file.originalname, file.mimetype, folder);
  }

  // disk storage → file.path
  if (file.path) {
    return await uploadDiskFile(file, folder);
  }

  throw new Error("uploadFile2: file object has neither buffer nor path");
}

/**
 * Delete a previously stored file. Accepts a full URL, a "/uploads/..." local
 * path, or an S3 key. Silently ignores empty/invalid input.
 */
async function deleteFile(value) {
  if (!value || typeof value !== "string") return;

  if (ACTIVE_S3) {
    let key = value;
    if (value.startsWith("http")) {
      try {
        const u = new URL(value);
        key = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      } catch (_) {
        key = value;
      }
    }
    try {
      await s3.deleteObject({ Bucket: S3_BUCKET, Key: key }).promise();
    } catch (err) {
      console.warn("deleteFile: S3 delete failed:", err.message);
    }
    return;
  }

  // Local: resolve to <root>/uploads/<...> and unlink.
  let rel = value;
  if (value.startsWith("http")) {
    try {
      rel = new URL(value).pathname; // "/uploads/branch/123.jpg"
    } catch (_) {
      return;
    }
  }
  rel = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel.startsWith("uploads/")) return; // only delete files we manage
  const filePath = path.join(BACKEND_ROOT, rel);
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("deleteFile: local delete failed:", err.message);
    }
  }
}

module.exports = { uploadFile2, deleteFile };
