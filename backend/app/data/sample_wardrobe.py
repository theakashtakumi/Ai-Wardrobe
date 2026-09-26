from app.models.clothing import ClothingItem


sample_wardrobe = [
    ClothingItem(
        id="CLOTH_001",
        name="Black Oversized T-Shirt",
        category="T-Shirt",
        color="Black",
        pattern="Solid",
        material="Cotton",
        fit="Oversized",
        season="Summer",
        formality="Casual",
        favorite=True,
        comfortable=True,
        personal_rating=5,
    ),

    ClothingItem(
        id="CLOTH_002",
        name="Blue Jeans",
        category="Jeans",
        color="Blue",
        pattern="Solid",
        material="Denim",
        fit="Regular",
        season="All Season",
        formality="Casual",
        favorite=True,
        comfortable=True,
        personal_rating=4,
    ),
]