from dataclasses import dataclass
from typing import Optional


@dataclass
class ClothingItem:
    id: str
    name: str

    # AI-detectable attributes
    category: str = "Unknown"
    color: str = "Unknown"
    pattern: Optional[str] = None
    material: Optional[str] = None
    fit: Optional[str] = None
    season: Optional[str] = None
    formality: Optional[str] = None

    # User-specific information
    favorite: bool = False
    comfortable: Optional[bool] = None
    personal_rating: Optional[int] = None

    # Image information
    image_path: Optional[str] = None