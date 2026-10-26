# Schema Investigation Report
# Hotel POS Backend — jagali-Koota-Backend

---

## SUMMARY (Read First)

| Key Question | Answer |
|---|---|
| MongoDB env var | `MONGODBURL` (primary); `MONGO_URI` also accepted as fallback in server.js |
| Mongoose version | `^6.12.0` (package.json) |
| Any isSeed/isDummy field? | **None exists in any model** — seed script must use a separate `_isDummy: true` field, added at insert time without modifying schemas |
| Main order model for Categorized Orders page | `CounterOrder` (collection: `counterorders`) — queried by `categoryName` string field |
| Order total field name | `grandTotal` (CounterOrder, StaffOrder, CounterBill); `total` (Order/online order) |
| GST field name | `gstAmount` (CounterOrder); `tax` is the total tax field in most models |
| Order status field | `orderStatus` enum: `pending/processing/completed/cancelled` (CounterOrder); `status` in other models |
| Category ref in orders | `categoryId` (ObjectId ref) + `categoryName` (String, denormalized — **this drives the Categorized Orders page**) |
| Branch ref in orders | `branch` (ObjectId, CounterOrder); `branchId` (ObjectId, most others) |
| Item list field | `items` array in all order models |
| Payment method field | `paymentMethod` enum: `cash/card/upi/qr/wallet` |
| Existing npm scripts | Only `start` and `dev` — no seed scripts exist yet |

---

## 1. COMPLETE SCHEMA FOR EVERY MODEL

### 1.1 Core/Shared Models (seed these first)

#### Branch (`d:\Jagali koota\jagali-Koota-Backend\model\Branch.js`)
Model name: `Branch`

| Field | Type | Required | Default | Enum | Notes |
|---|---|---|---|---|---|
| name | String | ✅ | — | — | — |
| gstNumber | String | ❌ | — | — | — |
| address | String | ✅ | — | — | — |
| contact.phone | String | ❌ | — | — | — |
| contact.email | String | ❌ | — | — | — |
| openingHours.mondayToFriday | String | ❌ | "11:00 AM - 11:00 PM" | — | — |
| openingHours.saturday | String | ❌ | "11:00 AM - 12:00 AM" | — | — |
| openingHours.sunday | String | ❌ | "12:00 PM - 10:00 PM" | — | — |
| image | String | ❌ | — | — | — |
| category | String | ❌ | null | restaurant/hotel/both/null | — |
| createdAt | Date | ❌ | Date.now | — | — |

> timestamps: true

---

#### Category (`d:\Jagali koota\jagali-Koota-Backend\model\Category.js`)
Model name: `Categoryy` (**note the double-y** — this is the registered Mongoose model name)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| name | String | ✅ | — | — |
| image | String | ❌ | null | — |
| branchId | String | ❌ | — | Kept for backward compat; use branch.id |
| branch.id | String | ✅ | — | **Must match Branch._id.toString()** |
| branch.name | String | ✅ | — | — |
| branch.address | String | ✅ | — | — |
| loginPassword | String | ❌ | null | — |
| cancelOrderPassword | String | ❌ | null | — |
| gstRate | Number | ❌ | 0 | 0–100 |

> Unique index: `{ name: 1, 'branch.id': 1 }` — same name can exist across different branches.
> timestamps: true

**CRITICAL NOTE**: `branch.id` must be the **string** form of the Branch `_id`. When seeding, do `branch._id.toString()`.

---

#### Subcategory (`d:\Jagali koota\jagali-Koota-Backend\model\subcategoryModel.js`)
Model name: `Subcategory`

| Field | Type | Required | Default | Ref |
|---|---|---|---|---|
| name | String | ✅ | — | — |
| categoryId | ObjectId | ✅ | — | Categoryy |
| branchId | ObjectId | ✅ | — | Branch |
| description | String | ❌ | — | — |
| isActive | Boolean | ❌ | true | — |

> timestamps: true

---

#### Menu (`d:\Jagali koota\jagali-Koota-Backend\model\menuModel.js`)
Model name: `Menu`

| Field | Type | Required | Default | Enum/Notes |
|---|---|---|---|---|
| name | String | ❌ | — | Use this (itemName is legacy alias) |
| itemName | String | ❌ | — | Legacy backward compat |
| description | String | ❌ | — | — |
| price | Number | ✅ | — | min 0 |
| gstRate | Number | ❌ | 0 | 0–100 |
| foodType | String | ❌ | null | veg/non-veg/egg/sea-food/chef-special/spice-level/gluten-free |
| categoryId | ObjectId | ✅ | — | ref: Categoryy |
| subcategoryId | ObjectId | ❌ | null | ref: Subcategory |
| branchId | ObjectId | ✅ | — | ref: Branch |
| stock | Number | ❌ | 0 | — |
| lowStockAlert | Number | ❌ | 5 | — |
| isActive | Boolean | ❌ | true | — |
| membershipDiscount | Number | ❌ | 0 | 0–100% |
| discountByTier.Gold/Silver/Platinum/Basic | Number | ❌ | 0 | 0–100% |
| quantities | [String] | ❌ | [] | Legacy |
| subscriptionEnabled | Boolean | ❌ | false | — |
| disabledUntil | Date | ❌ | null | — |

> timestamps: true. Many subscription price fields exist (legacy) — set all to 0 for seed.

---

#### Table (`d:\Jagali koota\jagali-Koota-Backend\model\Table.js`)
Model name: `Table`

| Field | Type | Required | Default | Enum/Notes |
|---|---|---|---|---|
| branchId | ObjectId | ✅ | — | ref: Branch |
| categoryId | ObjectId | ❌ | — | ref: Categoryy (optional for backward compat) |
| number | String | ✅ | — | Alphanumeric (A1, T1, VIP1) |
| capacity | Number | ❌ | — | 1–50 |
| status | String | ✅ | available | available/reserved/occupied |
| image | String | ❌ | — | — |
| qrCode | String | ❌ | — | — |
| createdAt | Date | ❌ | Date.now | — |

> Unique compound index: `{ branchId, categoryId, number }`.

---

### 1.2 Order Models (primary targets for the Categorized Orders page)

#### CounterOrder (`d:\Jagali koota\jagali-Koota-Backend\model\counterOrderModel.js`)
Model name: `CounterOrder` — **This is the primary model for Categorized Orders and Sales Reports pages.**

| Field | Type | Required | Default | Enum/Notes |
|---|---|---|---|---|
| userId | ObjectId | ❌ | null | ref: Counter (counterLoginModel) |
| customerName | String | ❌ | 'Walk-in Customer' | — |
| phoneNumber | String | ❌ | '0000000000' | — |
| branch | ObjectId | ✅ | — | ref: Branch |
| branchName | String | ❌ | null | — |
| categoryId | ObjectId | ❌ | null | ref: Category (Categoryy) |
| **categoryName** | **String** | ❌ | null | **KEY FIELD: drives getCategorizedOrders filter** |
| invoice | ObjectId | ❌ | null | ref: CounterInvoice |
| tableId | ObjectId | ❌ | null | ref: Table |
| tableNumber | String | ❌ | null | — |
| serverName | String | ❌ | null | — |
| kotNumber | String | ❌ | null | — |
| **invoiceNumber** | **String** | ❌ | null | **KEY: getCategorizedOrders requires this to be non-null** |
| discountAmount | Number | ❌ | 0 | — |
| discount.type | String | ❌ | — | percentage/amount |
| discount.value | Number | ❌ | — | — |
| discount.amount | Number | ❌ | — | — |
| items | [cOrderItemSchema] | — | — | see below |
| subtotal | Number | ✅ | — | — |
| gstAmount | Number | ❌ | 0 | **GST field** |
| tax | Number | ✅ | — | Total tax |
| serviceCharge | Number | ✅ | — | — |
| totalAmount | Number | ✅ | — | Subtotal + tax + serviceCharge |
| **grandTotal** | **Number** | ✅ | — | **The final total billed** |
| isComplimentary | Boolean | ❌ | false | — |
| isNonChargeable | Boolean | ❌ | false | — |
| nonChargeableType | String | ❌ | null | staff/management/tasting/wastage/other/null |
| **paymentMethod** | **String** | ✅ | — | **cash/card/upi/qr/wallet** |
| **orderStatus** | **String** | ✅ | processing | **pending/processing/completed/cancelled** |
| paymentStatus | String | ✅ | pending | pending/completed/failed/refunded/consolidated/billed |
| cancellationReason | String | ❌ | null | — |
| cancelledBy | String | ❌ | null | — |
| cancelledAt | Date | ❌ | null | — |
| **businessDay** | **String** | ❌ | null | YYYY-MM-DD, for business-day billing |
| createdAt | Date | ❌ | Date.now | — |

**cOrderItemSchema sub-fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| menuItemId | ObjectId | ❌ | ref: Menu |
| name | String | ✅ | — |
| quantity | Number | ✅ | min 1 |
| price | Number | ✅ | — |
| gstRate | Number | ❌ | 0 |
| isComplimentary | Boolean | ❌ | false |
| isNonChargeable | Boolean | ❌ | false |
| remark | String | ❌ | null |

> **Unique partial index**: `{ branch, businessDay, invoiceNumber }` — only applies when `invoiceNumber` and `businessDay` are strings. This means **each seed order needs a unique invoiceNumber per branch+businessDay combination**.

**IMPORTANT for getCategorizedOrders**: The query requires `invoiceNumber` to be non-null (`$exists: true, $ne: null, $ne: ''`). Seed data MUST have `invoiceNumber` set to pass this filter. Use format like `"INV-001"`.

---

#### StaffOrder (`d:\Jagali koota\jagali-Koota-Backend\model\staffOrderModel.js`)
Model name: `StaffOrder`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| userId | ObjectId | ❌ | — | ref: StaffLogin |
| customerName | String | ❌ | — | For guest orders |
| customerMobile | String | ❌ | — | 10 digits |
| isGuestOrder | Boolean | ❌ | false | — |
| orderId | String | ✅ | — | — |
| kotNumber | String | ❌ | — | unique sparse |
| branchId | ObjectId | ✅ | — | ref: Branch |
| branchName | String | ✅ | — | — |
| categoryId | ObjectId | ❌ | — | ref: Categoryy |
| categoryName | String | ❌ | — | — |
| tableId | ObjectId | ❌ | — | ref: Table |
| tableNumber | String | ✅ | — | — |
| peopleCount | Number | ✅ | — | min 1 |
| items | [sOrderItemSchema] | — | — | see menuModel for item shape |
| status | String | ❌ | pending | pending/preparing/served/completed/cancelled |
| subtotal | Number | ✅ | — | — |
| tax | Number | ✅ | — | — |
| serviceCharge | Number | ✅ | — | — |
| totalAmount | Number | ✅ | — | — |
| grandTotal | Number | ✅ | — | — |
| paymentStatus | String | ❌ | pending/completed | — |
| paymentMethod | String | ✅ | — | card/upi/netbanking/cash/wallet |

> timestamps: true

---

#### Order (`d:\Jagali koota\jagali-Koota-Backend\model\orderModel.js`) — Online/App orders
Model name: `Order`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| orderNumber | String | — | auto-generated | DDMMYYYY-CODE-seq |
| userId | ObjectId | ✅ | — | ref: User |
| branchId | ObjectId | ✅ | — | ref: Branch |
| items | [orderItemSchema] | — | — | menuItemId, name, price, quantity, categoryId |
| subtotal | Number | ✅ | — | — |
| discount | Number | ❌ | 0 | — |
| tax | Number | ❌ | 0 | **GST here** |
| **total** | Number | ✅ | — | **Final total** (not grandTotal) |
| deliveryOption | String | ❌ | delivery | delivery/pickup |
| name | String | ✅ | — | Customer name |
| phone | String | ✅ | — | — |
| paymentMethod | String | ❌ | cash | cash/card/upi |
| paymentStatus | String | ❌ | pending | pending/completed/failed/refunded |
| status | String | ❌ | pending | pending/confirmed/preparing/out for delivery/delivered/cancelled |
| cancellationReason | String | ❌ | null | — |

> timestamps: true

---

#### MemberOrder (`d:\Jagali koota\jagali-Koota-Backend\membership\models\MemberOrder.js`)
Model name: `MemberOrder`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| memberId | ObjectId | ✅ | — | ref: Member |
| memberName | String | ❌ | "" | — |
| memberPhone | String | ❌ | "" | — |
| orderNumber | String | — | auto ORD000001 | unique |
| branchId | ObjectId | ❌ | null | ref: Branch |
| branchName | String | ❌ | "Jagali Koota" | — |
| tableId | ObjectId | ❌ | null | ref: Table |
| tableNumber | String | ❌ | null | — |
| items[].name | String | ✅ | — | — |
| items[].quantity | Number | ✅ | — | min 1 |
| items[].price | Number | ✅ | — | — |
| items[].subtotal | Number | ✅ | — | — |
| **totalAmount** | Number | ✅ | — | — |
| status | String | ❌ | pending | pending/processing/completed/cancelled |
| completedAt | Date | ❌ | — | — |
| cancelledAt | Date | ❌ | — | — |

> timestamps: true

---

### 1.3 User/Authentication Models

#### Admin (`d:\Jagali koota\jagali-Koota-Backend\model\adminModel.js`)
Model name: `Admin`

| Field | Type | Required | Notes |
|---|---|---|---|
| email | String | ✅ | unique, lowercase |
| password | String | ✅ | bcryptjs hashed pre-save |
| createdAt | Date | ❌ | Date.now |

> No roles/permissions — for full-permission admin access. Separate from `AdminAccess`.

---

#### AdminAccess (`d:\Jagali koota\jagali-Koota-Backend\model\adminAccessModel.js`)
Model name: `AdminAccess`

| Field | Type | Required | Notes |
|---|---|---|---|
| name | String | ✅ | — |
| email | String | ✅ | unique, lowercase |
| password | String | ✅ | bcryptjs hashed |
| isSuperAdmin | Boolean | ❌ | false |
| isActive | Boolean | ❌ | true |
| permissions.{module} | {view,edit,delete: Boolean} | ❌ | {} |

> Permission modules: branches, categories, menu, tableQrGenerator, tables, tableReservations, categorizedOrders, salesReports, qrUploads, contactMessages, members, events, gallery, staffUsers, counterUsers, servers, purchaseUsers, categoryAccess, moduleAccess
> timestamps: true

---

#### CategoryAccess (`d:\Jagali koota\jagali-Koota-Backend\model\categoryAccessModel.js`)
Model name: `CategoryAccess`

| Field | Type | Required | Notes |
|---|---|---|---|
| name | String | ✅ | — |
| username | String | ✅ | unique, lowercase |
| password | String | ✅ | bcryptjs hashed (min 4 chars) |
| cancelPassword | String | ✅ | min 4 chars |
| categoryId | ObjectId | ✅ | ref: Category (Categoryy) |
| categoryName | String | ✅ | — |
| branchId | String | ❌ | — |
| branchName | String | ❌ | — |
| isActive | Boolean | ❌ | true |

> timestamps: true
> **NOTE**: `password` is only hashed if `isModified('password')` — so direct insert via Model.create() triggers pre-save hook, which hashes it. The `cancelPassword` is NOT hashed.

---

#### Counter (`d:\Jagali koota\jagali-Koota-Backend\model\counterLoginModel.js`)
Model name: `Counter`

| Field | Type | Required | Notes |
|---|---|---|---|
| name | String | ✅ | — |
| mobile | String | ✅ | unique, 10 digits |
| otp | String | ❌ | null |
| otpExpires | Date | ❌ | null |

> Login is OTP-based, not password-based. No password field to seed.
> timestamps: true

---

#### StaffLogin (`d:\Jagali koota\jagali-Koota-Backend\model\staffLoginModel.js`)
Model name: `StaffLogin`

| Field | Type | Required | Notes |
|---|---|---|---|
| name | String | ✅ | — |
| mobile | String | ✅ | unique, 10 digits |
| otp | String | ❌ | null |
| otpExpires | Date | ❌ | null |

> Same OTP-based auth as Counter. No password field.
> timestamps: true

---

#### PurchaseUser (`d:\Jagali koota\jagali-Koota-Backend\model\PurchaseUser.js`)
Model name: `PurchaseUser`

| Field | Type | Required | Notes |
|---|---|---|---|
| phoneNumber | String | ✅ | unique, 10 digits |
| name | String | ✅ | — |
| isActive | Boolean | ❌ | true |
| lastLoginAt | Date | ❌ | Date.now |

> OTP-based, no password.
> timestamps: true

---

#### User (`d:\Jagali koota\jagali-Koota-Backend\model\userModel.js`) — Public/App users
Model name: `User`

| Field | Type | Required | Notes |
|---|---|---|---|
| name | String | ✅ | — |
| mobile | String | ✅ | unique, 10 digits |
| email | String | ❌ | null |
| image | String | ❌ | null |
| otp / otpExpires | String/Date | ❌ | null | OTP login |

> timestamps: true

---

### 1.4 Membership Models

#### Member (`d:\Jagali koota\jagali-Koota-Backend\membership\models\Member.js`)
Model name: `Member`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| memberNumber | String | ❌ | auto JKM000001 | unique sparse, auto-generated pre-save |
| membershipId | String | ❌ | — | unique sparse, format LMK-001 |
| name | String | ✅ | — | — |
| email | String | ❌ | — | unique sparse, lowercase |
| password | String | ❌ | — | bcryptjs hashed, min 6 chars |
| phone | String | ✅ | — | unique |
| dateOfBirth | Date | ❌ | — | — |
| profileImage | String | ❌ | null | — |
| membershipType | String | ❌ | Member | Life Member/Temporary Member/Special Temporary Member/Honorary Member/Senior Life Member/Institutional Member/Platinum Member/Affiliated Member/Member |
| registrationStatus | String | ❌ | completed | pending/completed |
| walletBalance | Number | ❌ | 0 | min 0 |
| discountPercentage | Number | ❌ | 0 | 0–100 |
| monthlyServiceCharge | Number | ❌ | 0 | — |
| isActive | Boolean | ❌ | true | — |
| validUntil | Date | ❌ | +1 year | — |
| joiningDate | Date | ❌ | Date.now | — |
| address.street/city/state/zipCode/country | String | ❌ | — | — |
| qrCode | String | ❌ | null | Base64 or URL |

> timestamps: true
> Pre-save generates memberNumber (JKM000001) and hashes password.

---

#### AffiliatedMember (`d:\Jagali koota\jagali-Koota-Backend\membership\models\AffiliatedMember.js`)
Model name: `AffiliatedMember`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| name | String | ✅ | — | — |
| phone | String | ✅ | — | — |
| email | String | ❌ | "" | — |
| address | String | ❌ | "" | — |
| clubName | String | ✅ | — | — |
| clubLocation | String | ❌ | "" | — |
| membershipId | String | ❌ | "" | Their home club ID |
| purpose | String | ❌ | "" | — |
| visitDate | Date | ❌ | Date.now | — |
| notes | String | ❌ | "" | — |
| isActive | Boolean | ❌ | true | — |

> timestamps: true

---

#### Blacklist (`d:\Jagali koota\jagali-Koota-Backend\membership\models\Blacklist.js`)
Model name: `Blacklist`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| name | String | ✅ | — | — |
| phone | String | ✅ | — | indexed |
| reason | String | ✅ | — | — |
| blacklistedBy | String | ❌ | "Admin" | — |
| notes | String | ❌ | "" | — |
| isActive | Boolean | ❌ | true | — |

> timestamps: true

---

#### Event (`d:\Jagali koota\jagali-Koota-Backend\membership\models\Event.js`)
Model name: `Event`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| title | String | ✅ | — | — |
| description | String | ✅ | — | — |
| images | [String] | ❌ | [] | — |
| eventDate | Date | ✅ | — | — |
| eventTime | String | ✅ | — | e.g. "7:00 PM" |
| location | String | ❌ | "" | — |
| branchId | ObjectId | ❌ | null | ref: Branch |
| isActive | Boolean | ❌ | true | — |
| isPinned | Boolean | ❌ | false | — |
| bookingEnabled | Boolean | ❌ | false | — |
| pricePerPerson | Number | ❌ | 0 | — |
| maxBookings | Number | ❌ | null | null = unlimited |
| totalBooked | Number | ❌ | 0 | — |
| createdBy | ObjectId | ❌ | null | ref: Admin |

> timestamps: true

---

#### Sport (`d:\Jagali koota\jagali-Koota-Backend\membership\models\Sport.js`)
Model name: `Sport`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| name | String | ✅ | — | — |
| description | String | ❌ | "" | — |
| image | String | ❌ | null | — |
| priceMonthly | Number | ✅ | — | min 0 |
| priceYearly | Number | ❌ | 0 | — |
| schedule | String | ❌ | "" | "Mon, Wed, Fri – 6:00 PM" |
| maxMembers | Number | ❌ | 0 | 0 = unlimited |
| currentMembers | Number | ❌ | 0 | — |
| branchId | ObjectId | ❌ | null | ref: Branch |
| isActive | Boolean | ❌ | true | — |

> timestamps: true

---

#### SportSubscription (`d:\Jagali koota\jagali-Koota-Backend\membership\models\SportSubscription.js`)
Model name: `SportSubscription`

| Field | Type | Required | Notes |
|---|---|---|---|
| memberId | ObjectId | ✅ | ref: Member |
| sportId | ObjectId | ✅ | ref: Sport |
| startDate | Date | ✅ | Date.now |
| endDate | Date | ✅ | — |
| duration | String | ✅ | monthly/yearly |
| amount | Number | ✅ | — |
| paymentMethod | String | ❌ | wallet | wallet/cash/card/upi |
| status | String | ❌ | active | active/expired/cancelled |
| autoRenew | Boolean | ❌ | false | — |

> timestamps: true

---

#### Gallery (`d:\Jagali koota\jagali-Koota-Backend\membership\models\Gallery.js`)
Model name: `Gallery`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| title | String | ✅ | — | — |
| image | String | ✅ | — | Path like /uploads/gallery/... |
| description | String | ❌ | "" | — |
| isActive | Boolean | ❌ | true | — |
| createdBy | ObjectId | ❌ | null | — |

> timestamps: true

---

#### EventBooking (`d:\Jagali koota\jagali-Koota-Backend\membership\models\EventBooking.js`)
Model name: `EventBooking`

| Field | Type | Required | Notes |
|---|---|---|---|
| eventId | ObjectId | ✅ | ref: Event |
| memberId | ObjectId | ✅ | ref: User |
| memberName | String | ✅ | — |
| memberEmail | String | ✅ | — |
| memberPhone | String | ❌ | "" |
| numberOfPeople | Number | ✅ | min 1 |
| guests | [{name, age}] | ❌ | [] |
| pricePerPerson | Number | ✅ | — |
| totalAmount | Number | ✅ | — |
| status | String | ❌ | confirmed | confirmed/cancelled/attended/no-show |
| paymentStatus | String | ❌ | pending | pending/paid/refunded |
| paymentMethod | String | ❌ | other | wallet/cash/card/upi/other |

> timestamps: true

---

#### WalletTransaction (`d:\Jagali koota\jagali-Koota-Backend\membership\models\WalletTransaction.js`)
Model name: `WalletTransaction`

| Field | Type | Required | Notes |
|---|---|---|---|
| memberId | ObjectId | ✅ | ref: Member |
| type | String | ✅ | credit/debit |
| amount | Number | ✅ | min 0 |
| balanceBefore | Number | ✅ | — |
| balanceAfter | Number | ✅ | — |
| description | String | ✅ | — |
| orderId | ObjectId | ❌ | null | ref: Order |
| createdBy | String | ❌ | system | admin/member/system |

> timestamps: true

---

#### Feedback (`d:\Jagali koota\jagali-Koota-Backend\membership\models\Feedback.js`)
Model name: `Feedback`

| Field | Type | Required | Notes |
|---|---|---|---|
| memberId | ObjectId | ✅ | ref: Member |
| memberName | String | ✅ | — |
| memberEmail | String | ✅ | — |
| feedbackFor | String | ✅ | server/waiter/cook/general |
| rating | Number | ✅ | 1–5 |
| feedback | String | ✅ | max 1000 chars |
| branch | ObjectId | ❌ | null | ref: Branch |

> timestamps: true

---

### 1.5 Content / Static Models

#### ContactMessage (`d:\Jagali koota\jagali-Koota-Backend\model\ContactMessage.js`)
Model name: `ContactMessage`

| Field | Type | Required | Enum |
|---|---|---|---|
| name | String | ✅ | — |
| email | String | ✅ | — |
| phone | String | ❌ | — |
| subject | String | ✅ | room-booking/catering-service/general-inquiry/feedback/complaint/other |
| message | String | ✅ | — |
| status | String | ❌ | unread/read/replied (default: unread) |

> timestamps: true

---

#### HelpSupport (`d:\Jagali koota\jagali-Koota-Backend\model\helpSupportModel.js`)
Model name: `HelpSupport`

| Field | Type | Required | Notes |
|---|---|---|---|
| title | String | ✅ | — |
| mobile | String | ✅ | — |
| email | String | ✅ | — |
| workingHours | String | ❌ | "24/7" |
| isActive | Boolean | ❌ | true |

> timestamps: true

---

#### AboutUs (`d:\Jagali koota\jagali-Koota-Backend\model\aboutUsModel.js`)
Model name: `AboutUs`

| Field | Type | Required |
|---|---|---|
| description | String | ✅ |
| mission | String | ✅ |
| isActive | Boolean | ❌ (true) |

> timestamps: true

---

#### Terms (`d:\Jagali koota\jagali-Koota-Backend\model\termsModel.js`)
Model name: `Terms`

| Field | Type | Required | Enum |
|---|---|---|---|
| title | String | ✅ | — |
| description | String | ✅ | — |
| category | String | ✅ | Order Policy/Delivery Policy/Privacy Policy/Terms of Service/Refund Policy/Other |
| order | Number | ❌ | 0 |
| isActive | Boolean | ❌ | true |

> timestamps: true

---

#### CarouselImage (`d:\Jagali koota\jagali-Koota-Backend\model\CarouselImage.js`)
Model name: `CarouselImage` (used for QR uploads / banner images)

| Field | Type | Required | Notes |
|---|---|---|---|
| title | String | ✅ | — |
| description | String | ❌ | — |
| imageUrl | String | ✅ | — |
| order | Number | ❌ | 0 |
| isActive | Boolean | ❌ | true |

> timestamps: true

---

#### Staff (`d:\Jagali koota\jagali-Koota-Backend\model\staffModel.js`)
Model name: `Staff`

| Field | Type | Required | Enum |
|---|---|---|---|
| employeeId | String | — | auto EMP001, unique |
| name | String | ✅ | — |
| role | String | ✅ | Chef/Waiter/Cashier/Manager/Cleaner |
| salary | Number | ✅ | — |
| shift | String | ✅ | Morning/Evening/Night |
| joiningDate | Date | ✅ | — |
| mobile | String | ✅ | unique, 10 digits |
| isActive | Boolean | ❌ | true |

> Pre-save auto-generates employeeId. timestamps: true

---

#### Server (Waiter) (`d:\Jagali koota\jagali-Koota-Backend\model\serverModel.js`)
Model name: `Server`

| Field | Type | Required | Notes |
|---|---|---|---|
| name | String | ✅ | — |
| branch | ObjectId | ✅ | ref: Branch |
| isActive | Boolean | ❌ | true |
| createdAt | Date | ❌ | Date.now |

> Unique index: `{ name, branch }`. 

---

#### CounterInvoice (`d:\Jagali koota\jagali-Koota-Backend\model\counterInvoiceModel.js`)
Model name: `CounterInvoice`

| Field | Type | Required | Notes |
|---|---|---|---|
| invoiceNumber | String | ✅ | unique |
| customerName | String | ✅ | — |
| phoneNumber | String | ✅ | 10 digits |
| branch | ObjectId | ✅ | ref: Branch |
| date | String | ✅ | e.g. "18/08/2025" |
| time | String | ✅ | e.g. "14:30" |
| createdAt | Date | ❌ | Date.now |

---

#### BillCounter (`d:\Jagali koota\jagali-Koota-Backend\model\billCounterModel.js`)
Model name: `BillCounter`

| Field | Type | Required | Enum |
|---|---|---|---|
| branchId | ObjectId | ✅ | ref: Branch |
| category | String | ✅ | Restaurant/Self Service/Temple Meals |
| date | String | ✅ | YYYY-MM-DD |
| lastBillNumber | Number | ❌ | 0 |
| lastInvoiceNumber | Number | ❌ | 0 |
| lastKOTNumber | Number | ❌ | 0 |

> Unique index: `{ branchId, category, date }`.

---

#### KotCounter (`d:\Jagali koota\jagali-Koota-Backend\model\kotCounterModel.js`)
Model name: `KotCounter`

| Field | Type | Required | Notes |
|---|---|---|---|
| branchId | ObjectId | ✅ | unique per branch |
| currentKotNumber | Number | ✅ | 0 |
| lastResetDate | Date | ❌ | Date.now |

---

---

## 2. DEPENDENCY GRAPH — Seed in This Order

```
Tier 0 (no dependencies):
  Branch

Tier 1 (depends on Branch):
  Categoryy  ← branchId/branch.id → Branch._id
  Server     ← branch → Branch._id
  Staff      (standalone)
  StaffLogin (standalone, OTP auth only)
  Counter    (standalone, OTP auth only)
  PurchaseUser (standalone)
  Admin      (standalone)
  AdminAccess (standalone)
  Sport      ← branchId → Branch._id (optional)

Tier 2 (depends on Branch + Categoryy):
  Subcategory ← categoryId → Categoryy, branchId → Branch
  Table       ← branchId → Branch, categoryId → Categoryy (optional)
  CategoryAccess ← categoryId → Categoryy

Tier 3 (depends on Branch + Categoryy + Subcategory):
  Menu ← categoryId → Categoryy, subcategoryId → Subcategory, branchId → Branch

Tier 4 (depends on many above):
  CounterInvoice ← branch → Branch
  User           (standalone for online orders)
  Member         (standalone)
  AffiliatedMember (standalone)
  Blacklist      (standalone)
  Event          ← branchId → Branch (optional)
  Gallery        (standalone)

Tier 5 (core seeding targets — depends on Tier 0–4):
  CounterOrder ← branch → Branch, categoryId → Categoryy (optional), invoice → CounterInvoice (optional)
  StaffOrder   ← branchId → Branch, categoryId → Categoryy (optional)
  Order        ← userId → User, branchId → Branch
  MemberOrder  ← memberId → Member, branchId → Branch (optional)
  MemberOrder  ← memberId → Member

Tier 6 (depends on Member + Sport/Event):
  SportSubscription ← memberId → Member, sportId → Sport
  EventBooking      ← eventId → Event, memberId → Member
  WalletTransaction ← memberId → Member

Static/Content (no deps):
  ContactMessage, HelpSupport, AboutUs, Terms, CarouselImage
```

---

## 3. EXACT FIELD NAMES FOR KEY QUERIES

### Categorized Orders page (`getCategorizedOrders`)
- **Filter field**: `categoryName` (String, regex match, case-insensitive)
- **Required to appear**: `invoiceNumber` must be non-null/non-empty string
- **Date field**: `createdAt` (with businessDayRange window)
- **Branch filter**: `branch` (ObjectId field in CounterOrder)
- **Status filter**: `orderStatus` enum: `pending/processing/completed/cancelled`
- **Payment method**: `paymentMethod` enum: `cash/card/upi/qr/wallet`
- **Total field**: `grandTotal`
- **GST field**: `gstAmount`
- **Cancelled orders**: set `orderStatus: "cancelled"`, `cancellationReason: "..."`, `cancelledAt: Date`

### Sales Reports (`getSalesReport`)
- Queries `CounterOrder`, `StaffOrder`, `MemberOrder`
- CounterOrder filter: `orderStatus: { $ne: 'cancelled' }`, date via `createdAt`
- StaffOrder filter: `status: { $ne: 'cancelled' }`
- Branch filter on CounterOrder: field name `branch`; on StaffOrder: field name `branchId`

### Category Portal Orders page
- Uses same `CounterOrder` collection filtered by `categoryName`
- Shows `pending`, `completed`, and `cancelled` orders per category
- Seeds must include orders for ALL category names (e.g. "Restaurant", "Self Service", "Temple Meals")

---

## 4. SEEDING STRATEGY NOTES

### No isDummy/isSeed field exists
- **No existing seed marker** in any model was found.
- The seed script must add `_isDummy: true` by injecting it as a field during insert (`insertMany` / direct MongoDB write), or by maintaining a separate collection of dummy document IDs.
- **Recommended approach**: Add `_isDummy: true` field directly into each document object before insertion. Mongoose allows extra fields not in the schema unless `strict: true` is explicitly enforced. Test with `Model.insertMany([...], { lean: true })` or use `mongoose.connection.collection('...')` for direct insert to bypass strict mode. Alternatively, consider using `Model.collection.insertMany()` which bypasses schema validation entirely.
- The seed script should store all inserted `_id` values in a manifest file (e.g. `backend/seeds/.dummy-manifest.json`) for safe removal.

### Invoice number uniqueness constraint
- The partial unique index on `{ branch, businessDay, invoiceNumber }` means **each invoice number must be unique per branch per day**. 
- Seed formula: `INV-YYYYMMDD-NNN` (e.g. `INV-20250818-001`) ensures no conflicts across days.

### Category name matching
- The `getCategorizedOrders` controller uses **case-insensitive regex** on `categoryName`. 
- Seed orders must use consistent names like `"Restaurant"`, `"Self Service"`, `"Temple Meals"` that match actual Category documents.

### 10 orders today requirement
- Create at least 10 CounterOrder documents with today's `createdAt` and a valid `invoiceNumber`.

### Order distribution
- 80–100 total over 30 days, at least 10 today
- ~10–15% cancelled: set `orderStatus: "cancelled"`, `paymentStatus: "pending"` or `"failed"`, `cancellationReason`, `cancelledAt`
- Remainder: ~40% `completed`, ~45% `processing` or `completed`
- Every category must have both `completed` and `cancelled` orders

---

## 5. ENV VARIABLES (KEY NAMES ONLY — NO VALUES)

From `.env` (keys only):
- `MONGODBURL` — primary MongoDB connection string
- `PORT` — server port

From `server.js` (fallback order checked in code):
- `MONGO_URI` — accepted as fallback
- `MONGODBURL` — primary

**Seed script must use**: `process.env.MONGODBURL || process.env.MONGO_URI`

---

## 6. PACKAGE.JSON — EXISTING npm SCRIPTS

```json
{
  "start": "nodemon server.js",
  "dev": "nodemon server.js"
}
```

**No seed scripts exist.** The task requires adding:
- `"seed:dummy": "node backend/seeds/seedDummyData.js"`
- `"seed:dummy:clear": "node backend/seeds/seedDummyData.js --clear"`

Since `package.json` is at `d:\Jagali koota\jagali-Koota-Backend\package.json`, the scripts should be:
- `"seed:dummy": "node seeds/seedDummyData.js"`
- `"seed:dummy:clear": "node seeds/seedDummyData.js --clear"`

(Run from project root `jagali-Koota-Backend`)

---

## 7. MONGOOSE VERSION

`mongoose: ^6.12.0` (from package.json)

Mongoose 6 has `strict: true` by default, meaning extra fields NOT in the schema are silently dropped on save. **To insert `_isDummy: true` without changing schemas**, the seed script must use `Model.collection.insertMany()` (bypasses Mongoose strict mode) rather than `Model.create()` or `new Model()`.

---

## 8. CONCLUSIONS AND RECOMMENDATIONS FOR THE SEED SCRIPT

1. **Use `Model.collection.insertMany(docs, { ordered: false })`** for all collections so that `_isDummy: true` persists without schema changes.

2. **Seed order** (strict):
   - Branch → Categoryy + Admin + Staff + Counter + StaffLogin + PurchaseUser + Member (tier 0-1)
   - Subcategory + Table + CategoryAccess + Server → AdminAccess (tier 2)
   - Menu (tier 3)
   - CounterInvoice + User + AffiliatedMember + Blacklist + Event + Gallery (tier 4)
   - CounterOrder + StaffOrder + Order + MemberOrder (tier 5)
   - SportSubscription + EventBooking + WalletTransaction (tier 6)
   - ContactMessage + HelpSupport + AboutUs + Terms + CarouselImage (content, any time)

3. **At minimum, create these categories** (to show data on all portals):
   - "Restaurant" — gstRate: 5
   - "Self Service" — gstRate: 5
   - "Temple Meals" — gstRate: 0

4. **CounterOrder `invoiceNumber` is required** for the Categorized Orders page. Every non-KOT seed order must have one set.

5. **The `categoryName` field on CounterOrder must exactly match** (case-insensitively) one of the category names, because the frontend filter uses a regex on this field.

6. **Print credentials** at script end:
   - Admin: `admin@jagalikoota.com` / `Admin@123`
   - CategoryAccess per category: username = `restaurant_user`, `selfservice_user`, `templemeals_user`; password = `Test@1234`

7. **Production guard**: Check `process.env.NODE_ENV === 'production'` and exit with error before any DB writes.

8. **Manifest file**: Write inserted IDs to `backend/seeds/.dummy-manifest.json`. The `--clear` flag reads this file and calls `Model.collection.deleteMany({ _id: { $in: ids } })`.

---

*Report generated by schema-investigation step. All findings are based on direct file reads from the codebase.*
