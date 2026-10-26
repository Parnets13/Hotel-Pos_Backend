const AboutUs = require("../model/aboutUsModel")

// Get about us information
exports.getAboutUs = async (req, res) => {
  try {
    const aboutUs = await AboutUs.findOne({ isActive: true }).sort({ createdAt: -1 })
    // Return null data with 200 when no record exists yet (first-time setup)
    res.status(200).json(aboutUs || null)
  } catch (error) {
    res.status(500).json({ message: "Error fetching about us information", error: error.message })
  }
}

// Admin: Create about us information
exports.createAboutUs = async (req, res) => {
  try {
    const { description, mission } = req.body

    if (!description || !mission) {
      return res.status(400).json({ message: " description, and mission are required" })
    }

    const aboutUs = new AboutUs({ 
     
      description,
      mission,
    })

    await aboutUs.save()

    res.status(201).json({ message: "About us information created successfully", aboutUs })
  } catch (error) {
    res.status(400).json({ message: "Error creating about us information", error: error.message })
  }
}

// Admin: Update about us information
exports.updateAboutUs = async (req, res) => {
  try {
    const { id } = req.params
    const { description, mission, isActive } = req.body

    const aboutUs = await AboutUs.findByIdAndUpdate(
      id,
      { description, mission, isActive },
      { new: true, runValidators: true }
    )

    if (!aboutUs) {
      return res.status(404).json({ message: "About us information not found" })
    }

    res.status(200).json({ message: "About us information updated successfully", aboutUs })
  } catch (error) {
    res.status(400).json({ message: "Error updating about us information", error: error.message })
  }
}
// Admin: Get all about us entries
exports.getAllAboutUs = async (req, res) => {
  try {
    const aboutUsEntries = await AboutUs.find().sort({ createdAt: -1 })
    res.status(200).json(aboutUsEntries)
  } catch (error) {
    res.status(500).json({ message: "Error fetching about us entries", error: error.message })
  }
}

// Admin: Delete about us entry
exports.deleteAboutUs = async (req, res) => {
  try {
    const { id } = req.params

    const aboutUs = await AboutUs.findByIdAndDelete(id)
    if (!aboutUs) {
      return res.status(404).json({ message: "About us information not found" })
    }

    res.status(200).json({ message: "About us information deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Error deleting about us information", error: error.message })
  }
}