import { useEffect, useState } from "react"


function App() {
  const [wardrobe, setWardrobe] = useState([])
  const [loading, setLoading] = useState(true)


  useEffect(() => {
    fetch("http://127.0.0.1:8000/wardrobe")
      .then((response) => response.json())
      .then((data) => {
        setWardrobe(data)
        setLoading(false)
      })
      .catch((error) => {
        console.error("Failed to load wardrobe:", error)
        setLoading(false)
      })
  }, [])


  return (
    <div>
      <h1>AI Wardrobe</h1>

      {loading ? (
        <p>Loading wardrobe...</p>
      ) : (
        <div>
          {wardrobe.map((item) => (
            <div key={item.id}>
              <h2>{item.name}</h2>

              <p>Category: {item.category}</p>
              <p>Color: {item.color}</p>
              <p>Fit: {item.fit}</p>
              <p>Rating: {item.personal_rating}/5</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


export default App