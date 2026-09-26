from dataclasses import dataclass
from typing import Optional


@dataclass
class ClothingItem:
    id: str
    name: str
    category: str
    color: str
    pattern: Optional[str] = None
    material: Optional[str] = None
    fit: Optional[str] = None
    season: Optional[str] = None
    formality: Optional[str] = None

    # User-specific information
    favorite: bool = False
    comfortable: Optional[bool] = None
    personal_rating: Optional[int] = None

    # Image
    image_path: Optional[str] = None