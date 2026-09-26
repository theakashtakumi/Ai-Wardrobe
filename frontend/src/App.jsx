import { useEffect, useState } from "react"

function App() {
  const [wardrobe, setWardrobe] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    loadWardrobe()
  }, [])

  async function loadWardrobe() {
    try {
      const response = await fetch(
        "http://127.0.0.1:8000/wardrobe"
      )

      const data = await response.json()

      setWardrobe(data)
    } catch (error) {
      console.error("Failed to load wardrobe:", error)
    }
  }

  function handleFileChange(event) {
    const file = event.target.files[0]

    if (!file) {
      return
    }

    setSelectedFile(file)
    setMessage("")
  }

  async function handleUpload() {
    if (!selectedFile) {
      setMessage("Please select an image first.")
      return
    }

    const name = window.prompt(
      "Enter a name for this clothing item:"
    )

    if (!name) {
      setMessage("Upload cancelled.")
      return
    }

    const formData = new FormData()

    formData.append("name", name)
    formData.append("file", selectedFile)

    setUploading(true)
    setMessage("Uploading...")

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/wardrobe",
        {
          method: "POST",
          body: formData,
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || "Upload failed"
        )
      }

      setMessage(
        `${data.name} was added successfully!`
      )

      setSelectedFile(null)

      await loadWardrobe()
    } catch (error) {
      console.error(error)

      setMessage(
        "Failed to add clothing item."
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <h1>AI Wardrobe</h1>

      <h2>Add Clothing</h2>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
      />

      <button
        onClick={handleUpload}
        disabled={uploading}
      >
        {uploading ? "Uploading..." : "Upload Clothing"}
      </button>

      <p>{message}</p>

      <h2>Current Wardrobe</h2>

      {wardrobe.map((item) => (
        <div key={item.id}>
          {item.image_path && (
            <img
              src={`http://127.0.0.1:8000/${item.image_path}`}
              alt={item.name}
              width="200"
            />
          )}

          <h3>{item.name}</h3>

          <p>
            Category: {item.category}
          </p>

          <p>
            Color: {item.color}
          </p>

          <p>
            Rating: {item.personal_rating ?? "Not rated"}
          </p>
        </div>
      ))}
    </div>
  )
}

export default App