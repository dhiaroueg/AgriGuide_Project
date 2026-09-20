import json
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg2 import OperationalError

from app.db import get_cursor
from app.schemas import ListingCreate, MessageCreate, ReservationCreate, ReservationStatusUpdate, ReviewCreate
from app.security import get_current_user_id

router = APIRouter(prefix="/marketplace", tags=["marketplace"])

def _json(value: Any) -> Any:
    if isinstance(value, Decimal): return float(value)
    if isinstance(value, dict): return {k: _json(v) for k, v in value.items()}
    if isinstance(value, list): return [_json(v) for v in value]
    return value

def _user(cur, user_id: str) -> dict:
    cur.execute("SELECT id, nom, role FROM users WHERE id = %s", (user_id,))
    user = cur.fetchone()
    if not user: raise HTTPException(404, "Utilisateur introuvable.")
    return user

def _listing(cur, listing_id: str) -> dict:
    cur.execute("""
        SELECT a.*, COALESCE(t.region, '') AS region, u.nom AS seller_name,
               ST_Y(a.localisation::geometry) AS latitude, ST_X(a.localisation::geometry) AS longitude
        FROM annonces a JOIN users u ON u.id=a.user_id
        LEFT JOIN terrains t ON t.id=a.terrain_id WHERE a.id=%s
    """, (listing_id,))
    row = cur.fetchone()
    if not row: raise HTTPException(404, "Annonce introuvable.")
    return _json(row)

@router.get("/listings")
def list_listings(
    type_annonce: str | None = None, region: str | None = None, certification: str | None = None,
    delivery_mode: str | None = None, available_only: bool = True,
    latitude: float | None = Query(default=None, ge=-90, le=90), longitude: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float | None = Query(default=None, gt=0, le=500),
):
    clauses, params = ["1=1"], []
    if type_annonce:
        clauses.append("a.type_annonce=%s"); params.append(type_annonce)
    if region:
        clauses.append("t.region ILIKE %s"); params.append(f"%{region}%")
    if certification:
        clauses.append("a.certifications ? %s"); params.append(certification)
    if delivery_mode:
        clauses.append("a.modes_livraison ? %s"); params.append(delivery_mode)
    if available_only:
        clauses.append("a.statut='disponible' AND a.quantite_disponible > 0")
    distance_sql = "NULL::numeric AS distance_km"
    if latitude is not None and longitude is not None:
        point = f"SRID=4326;POINT({longitude} {latitude})"
        distance_sql = "ST_Distance(a.localisation::geography, ST_GeogFromText(%s))/1000 AS distance_km"
        params.insert(0, point)
        if radius_km is not None:
            clauses.append("a.localisation IS NOT NULL AND ST_DWithin(a.localisation::geography, ST_GeogFromText(%s), %s * 1000)")
            params.extend([point, radius_km])
    try:
        with get_cursor() as cur:
            cur.execute(f"""
                SELECT a.id, a.type_annonce, a.titre, a.description, a.quantite, a.quantite_disponible, a.unite, a.prix,
                       a.statut, a.certifications, a.modes_livraison, a.rayon_livraison_km, a.vendeur_verifie,
                       a.note_vendeur, a.nombre_avis, COALESCE(t.region, '') AS region, u.nom AS seller_name, {distance_sql}
                FROM annonces a JOIN users u ON u.id=a.user_id LEFT JOIN terrains t ON t.id=a.terrain_id
                WHERE {' AND '.join(clauses)} ORDER BY a.date_creation DESC
            """, params)
            return [_json(row) for row in cur.fetchall()]
    except OperationalError as exc:
        raise HTTPException(503, "Base de données Marketplace indisponible.") from exc

@router.get("/listings/{listing_id}")
def get_listing(listing_id: str):
    with get_cursor() as cur: return _listing(cur, listing_id)

@router.post("/listings", status_code=status.HTTP_201_CREATED)
def create_listing(payload: ListingCreate, user_id: str = Depends(get_current_user_id)):
    with get_cursor() as cur:
        user = _user(cur, user_id)
        if user["role"] != "farmer": raise HTTPException(403, "Seuls les agriculteurs peuvent publier.")
        cur.execute("SELECT 1 FROM terrains WHERE id=%s AND user_id=%s", (payload.terrain_id, user_id)) if payload.terrain_id else None
        if payload.terrain_id and not cur.fetchone(): raise HTTPException(403, "Terrain non autorisé.")
        cur.execute("SELECT EXISTS(SELECT 1 FROM terrains WHERE user_id=%s)", (user_id,))
        verified = bool(cur.fetchone()["exists"])
        point = f"SRID=4326;POINT({payload.longitude} {payload.latitude})" if payload.latitude is not None and payload.longitude is not None else None
        cur.execute("""
            INSERT INTO annonces (user_id, terrain_id, type_annonce, culture_source, titre, description, quantite,
                quantite_disponible, unite, prix, statut, localisation, rayon_livraison_km, modes_livraison, certifications, vendeur_verifie)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'disponible',ST_GeomFromEWKT(%s),%s,%s::jsonb,%s::jsonb,%s)
            RETURNING id
        """, (user_id, payload.terrain_id, payload.type_annonce, payload.culture_source, payload.titre, payload.description,
              payload.quantite, payload.quantite, payload.unite, payload.prix, point, payload.rayon_livraison_km,
              json.dumps(payload.modes_livraison), json.dumps(payload.certifications), verified))
        return _listing(cur, str(cur.fetchone()["id"]))

@router.post("/listings/{listing_id}/reservations", status_code=status.HTTP_201_CREATED)
def reserve(listing_id: str, payload: ReservationCreate, user_id: str = Depends(get_current_user_id)):
    with get_cursor() as cur:
        listing = _listing(cur, listing_id); _user(cur, user_id)
        if str(listing["user_id"]) == user_id: raise HTTPException(400, "Vous ne pouvez pas réserver votre annonce.")
        if listing["statut"] != "disponible" or float(listing["quantite_disponible"]) < payload.quantity:
            raise HTTPException(409, "Quantité non disponible.")
        if payload.pickup_mode not in listing["modes_livraison"]: raise HTTPException(400, "Mode de livraison indisponible.")
        cur.execute("""INSERT INTO marketplace_reservations (annonce_id,buyer_id,quantity,pickup_mode,note)
            VALUES (%s,%s,%s,%s,%s) RETURNING *""", (listing_id,user_id,payload.quantity,payload.pickup_mode,payload.note))
        return _json(cur.fetchone())

@router.get("/reservations/me")
def my_reservations(user_id: str = Depends(get_current_user_id)):
    with get_cursor() as cur:
        cur.execute("""SELECT r.*, a.titre, a.unite, a.user_id AS seller_id
            FROM marketplace_reservations r JOIN annonces a ON a.id=r.annonce_id
            WHERE r.buyer_id=%s OR a.user_id=%s ORDER BY r.created_at DESC""", (user_id,user_id))
        return [_json(r) for r in cur.fetchall()]

@router.patch("/reservations/{reservation_id}")
def update_reservation(reservation_id: str, payload: ReservationStatusUpdate, user_id: str = Depends(get_current_user_id)):
    with get_cursor() as cur:
        cur.execute("""SELECT r.*, a.user_id AS seller_id, a.id AS listing_id, a.quantite_disponible
            FROM marketplace_reservations r JOIN annonces a ON a.id=r.annonce_id WHERE r.id=%s FOR UPDATE""", (reservation_id,))
        reservation = cur.fetchone()
        if not reservation: raise HTTPException(404, "Réservation introuvable.")
        is_seller = str(reservation["seller_id"]) == user_id; is_buyer = str(reservation["buyer_id"]) == user_id
        if payload.status in ("accepted", "rejected", "completed") and not is_seller: raise HTTPException(403, "Action réservée au vendeur.")
        if payload.status == "cancelled" and not (is_seller or is_buyer): raise HTTPException(403, "Action non autorisée.")
        if reservation["status"] != "pending" and payload.status != "completed": raise HTTPException(409, "Réservation déjà traitée.")
        cur.execute("UPDATE marketplace_reservations SET status=%s, updated_at=now() WHERE id=%s RETURNING *", (payload.status,reservation_id))
        updated = cur.fetchone()
        if payload.status == "accepted":
            cur.execute("UPDATE annonces SET quantite_disponible=quantite_disponible-%s, statut=CASE WHEN quantite_disponible-%s=0 THEN 'reserve' ELSE statut END WHERE id=%s", (reservation["quantity"],reservation["quantity"],reservation["listing_id"]))
        return _json(updated)

@router.post("/listings/{listing_id}/conversations", status_code=status.HTTP_201_CREATED)
def start_conversation(listing_id: str, user_id: str = Depends(get_current_user_id)):
    with get_cursor() as cur:
        listing = _listing(cur, listing_id)
        if str(listing["user_id"]) == user_id: raise HTTPException(400, "Vous êtes le vendeur.")
        cur.execute("""INSERT INTO marketplace_conversations (annonce_id,buyer_id,seller_id) VALUES (%s,%s,%s)
            ON CONFLICT (annonce_id,buyer_id) DO UPDATE SET updated_at=now() RETURNING *""", (listing_id,user_id,listing["user_id"]))
        return _json(cur.fetchone())

@router.get("/conversations/{conversation_id}/messages")
def messages(conversation_id: str, user_id: str = Depends(get_current_user_id)):
    with get_cursor() as cur:
        cur.execute("SELECT * FROM marketplace_conversations WHERE id=%s AND (buyer_id=%s OR seller_id=%s)", (conversation_id,user_id,user_id))
        if not cur.fetchone(): raise HTTPException(404, "Conversation introuvable.")
        cur.execute("SELECT id,sender_id,body,created_at,read_at FROM marketplace_messages WHERE conversation_id=%s ORDER BY created_at", (conversation_id,))
        return [_json(r) for r in cur.fetchall()]

@router.post("/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
def send_message(conversation_id: str, payload: MessageCreate, user_id: str = Depends(get_current_user_id)):
    with get_cursor() as cur:
        cur.execute("SELECT * FROM marketplace_conversations WHERE id=%s AND (buyer_id=%s OR seller_id=%s)", (conversation_id,user_id,user_id))
        if not cur.fetchone(): raise HTTPException(404, "Conversation introuvable.")
        cur.execute("INSERT INTO marketplace_messages (conversation_id,sender_id,body) VALUES (%s,%s,%s) RETURNING *", (conversation_id,user_id,payload.body))
        cur.execute("UPDATE marketplace_conversations SET updated_at=now() WHERE id=%s", (conversation_id,))
        return _json(cur.fetchone())

@router.post("/reservations/{reservation_id}/review", status_code=status.HTTP_201_CREATED)
def review(reservation_id: str, payload: ReviewCreate, user_id: str = Depends(get_current_user_id)):
    with get_cursor() as cur:
        cur.execute("""SELECT r.*, a.user_id AS seller_id FROM marketplace_reservations r JOIN annonces a ON a.id=r.annonce_id
            WHERE r.id=%s""", (reservation_id,)); reservation = cur.fetchone()
        if not reservation or reservation["status"] != "completed": raise HTTPException(400, "Une transaction terminée est requise.")
        if str(reservation["buyer_id"]) == user_id: target = reservation["seller_id"]
        elif str(reservation["seller_id"]) == user_id: target = reservation["buyer_id"]
        else: raise HTTPException(403, "Action non autorisée.")
        cur.execute("INSERT INTO marketplace_reviews (reservation_id,author_id,target_user_id,rating,comment) VALUES (%s,%s,%s,%s,%s) RETURNING *", (reservation_id,user_id,target,payload.rating,payload.comment))
        return _json(cur.fetchone())
