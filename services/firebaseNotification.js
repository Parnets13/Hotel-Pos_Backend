const admin = require("firebase-admin");
const path = require("path");

// Initialize Firebase Admin SDK.
// Initialisation is wrapped so a missing/invalid service account file does
// NOT crash the server (the file is a deployment secret that may be absent in
// local/dev checkouts). When init fails, push notifications are disabled
// gracefully and the rest of the app — including the scheduled cron jobs —
// continues to run. Add config/firebase-service-account.json to enable FCM.
const serviceAccountPath = path.join(
  __dirname,
  "../config/firebase-service-account.json"
);

let firebaseReady = false;
if (!admin.apps.length) {
  try {
    let credential;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Production: load from environment variable (JSON string)
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(serviceAccount);
    } else {
      // Local dev: load from file
      credential = admin.credential.cert(serviceAccountPath);
    }

    admin.initializeApp({ credential });
    firebaseReady = true;
  } catch (err) {
    console.warn(
      "[FCM] Firebase Admin could not be initialised — push notifications disabled. Reason:",
      err.message
    );
    firebaseReady = false;
  }
} else {
  firebaseReady = true;
}

/**
 * Send push notification to a single device
 * @param {string} fcmToken - The device's FCM token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional data payload
 */
const sendToDevice = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) {
    console.warn("[FCM] No token provided, skipping notification");
    return null;
  }

  if (!firebaseReady) {
    console.warn("[FCM] Not initialised (service account missing) — skipping notification");
    return null;
  }

  try {
    const message = {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        // Ensure all values are strings (FCM requirement)
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
      },
      android: {
        priority: "high",
        notification: {
          channelId: "jagali_koota_orders",
          sound: "default",
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log("[FCM] Notification sent:", title, "->", response);
    return response;
  } catch (error) {
    // Token might be expired/invalid — don't crash
    if (
      error.code === "messaging/registration-token-not-registered" ||
      error.code === "messaging/invalid-registration-token"
    ) {
      console.warn("[FCM] Invalid/expired token, should remove:", fcmToken.slice(0, 20) + "...");
      return { error: "invalid_token" };
    }
    console.error("[FCM] Error sending notification:", error.message);
    return null;
  }
};

/**
 * Send notification to a member by their ID
 * @param {string} memberId - Member's MongoDB _id
 * @param {string} title
 * @param {string} body
 * @param {object} data
 */
const sendToMember = async (memberId, title, body, data = {}) => {
  try {
    const Member =
      require("mongoose").connection.models.Member ||
      require("../membership/models/Member");

    const member = await Member.findById(memberId).select("fcmToken name");
    if (!member || !member.fcmToken) {
      console.warn("[FCM] Member has no FCM token:", memberId);
      return null;
    }

    return await sendToDevice(member.fcmToken, title, body, data);
  } catch (error) {
    console.error("[FCM] Error in sendToMember:", error.message);
    return null;
  }
};

/**
 * Send notification to a member by phone number
 * @param {string} phone
 * @param {string} title
 * @param {string} body
 * @param {object} data
 */
const sendToMemberByPhone = async (phone, title, body, data = {}) => {
  try {
    const Member =
      require("mongoose").connection.models.Member ||
      require("../membership/models/Member");

    const member = await Member.findOne({ phone }).select("fcmToken name");
    if (!member || !member.fcmToken) {
      console.warn("[FCM] Member (phone:", phone, ") has no FCM token");
      return null;
    }

    return await sendToDevice(member.fcmToken, title, body, data);
  } catch (error) {
    console.error("[FCM] Error in sendToMemberByPhone:", error.message);
    return null;
  }
};

/**
 * Send to multiple devices (broadcast)
 * @param {string[]} tokens - Array of FCM tokens
 * @param {string} title
 * @param {string} body
 * @param {object} data
 */
const sendToMultiple = async (tokens, title, body, data = {}) => {
  if (!tokens || tokens.length === 0) return [];

  const validTokens = tokens.filter(Boolean);
  if (validTokens.length === 0) return [];

  if (!firebaseReady) {
    console.warn("[FCM] Not initialised (service account missing) — skipping multicast");
    return null;
  }

  try {
    const message = {
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: "high",
        notification: {
          channelId: "jagali_koota_orders",
          sound: "default",
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast({
      ...message,
      tokens: validTokens,
    });

    console.log(
      `[FCM] Multicast: ${response.successCount} success, ${response.failureCount} failed`
    );
    return response;
  } catch (error) {
    console.error("[FCM] Multicast error:", error.message);
    return null;
  }
};

module.exports = {
  sendToDevice,
  sendToMember,
  sendToMemberByPhone,
  sendToMultiple,
};
