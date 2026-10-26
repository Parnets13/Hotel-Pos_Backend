const HelpSupport = require("../model/helpSupportModel")

// Get help and support information
exports.getHelpSupport = async (req, res) => {
  try {
    const helpSupport = await HelpSupport.findOne({ isActive: true }).sort({ createdAt: -1 })
    // Return null data with 200 when no record exists yet (first-time setup)
    res.status(200).json(helpSupport || null)
  } catch (error) {
    res.status(500).json({ message: "Error fetching help and support information", error: error.message })
  }
}

// Admin: Create help and support information
exports.createHelpSupport = async (req, res) => {
  try {
    const { title, mobile, email, workingHours } = req.body

    if (!title || !mobile || !email) {
      return res.status(400).json({ message: "Title, mobile, and email are required" })
    }

    // Create new help and support entry
    const helpSupport = new HelpSupport({
      title,
      mobile,
      email,
      workingHours: workingHours || "24/7",
    })

    await helpSupport.save()

    res.status(201).json({ message: "Help and support information created successfully", helpSupport })
  } catch (error) {
    res.status(400).json({ message: "Error creating help and support information", error: error.message })
  }
}

// Admin: Update help and support information
exports.updateHelpSupport = async (req, res) => {
  try {
    const { id } = req.params
    const { title, mobile, email, workingHours, isActive } = req.body

    const helpSupport = await HelpSupport.findByIdAndUpdate(
      id,
      { title, mobile, email, workingHours, isActive },
      { new: true, runValidators: true },
    )

    if (!helpSupport) {
      return res.status(404).json({ message: "Help and support information not found" })
    }

    res.status(200).json({ message: "Help and support information updated successfully", helpSupport })
  } catch (error) {
    res.status(400).json({ message: "Error updating help and support information", error: error.message })
  }
}

// Admin: Get all help and support entries
exports.getAllHelpSupport = async (req, res) => {
  try {
    const helpSupports = await HelpSupport.find().sort({ createdAt: -1 })
    res.status(200).json(helpSupports)
  } catch (error) {
    res.status(500).json({ message: "Error fetching help and support entries", error: error.message })
  }
}

// Admin: Delete help and support entry
exports.deleteHelpSupport = async (req, res) => {
  try {
    const { id } = req.params

    const helpSupport = await HelpSupport.findByIdAndDelete(id)
    if (!helpSupport) {
      return res.status(404).json({ message: "Help and support information not found" })
    }

    res.status(200).json({ message: "Help and support information deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Error deleting help and support information", error: error.message })
  }
}