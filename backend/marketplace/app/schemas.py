from typing import Literal
from pydantic import BaseModel, Field

DeliveryMode = Literal["retrait_sur_place", "livraison", "point_relais"]

class ListingCreate(BaseModel):
    type_annonce: Literal["recolte", "dechet"]
    titre: str = Field(min_length=3, max_length=150)
    description: str = Field(min_length=10, max_length=4000)
    quantite: float = Field(gt=0)
    unite: str = Field(min_length=1, max_length=20)
    prix: float | None = Field(default=None, ge=0)
    culture_source: str | None = Field(default=None, max_length=100)
    terrain_id: str | None = None
    region: str | None = Field(default=None, max_length=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    modes_livraison: list[DeliveryMode] = ["retrait_sur_place"]
    rayon_livraison_km: float = Field(default=0, ge=0, le=500)
    certifications: list[str] = Field(default_factory=list, max_length=10)

class ReservationCreate(BaseModel):
    quantity: float = Field(gt=0)
    pickup_mode: DeliveryMode = "retrait_sur_place"
    note: str | None = Field(default=None, max_length=1000)

class ReservationStatusUpdate(BaseModel):
    status: Literal["accepted", "rejected", "cancelled", "completed"]

class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)
