-- Marketplace professionnel : localisation approximative, logistique, r\u00e9servations,
-- messagerie et confiance. Cette migration est rejouable sans effet de bord.
ALTER TABLE annonces ADD COLUMN IF NOT EXISTS localisation GEOMETRY(POINT, 4326);
ALTER TABLE annonces ADD COLUMN IF NOT EXISTS rayon_livraison_km NUMERIC(6,1) DEFAULT 0;
ALTER TABLE annonces ADD COLUMN IF NOT EXISTS modes_livraison JSONB NOT NULL DEFAULT '["retrait_sur_place"]'::jsonb;
ALTER TABLE annonces ADD COLUMN IF NOT EXISTS certifications JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE annonces ADD COLUMN IF NOT EXISTS quantite_disponible NUMERIC(10,2);
ALTER TABLE annonces ADD COLUMN IF NOT EXISTS vendeur_verifie BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE annonces ADD COLUMN IF NOT EXISTS note_vendeur NUMERIC(3,2);
ALTER TABLE annonces ADD COLUMN IF NOT EXISTS nombre_avis INTEGER NOT NULL DEFAULT 0;
UPDATE annonces SET quantite_disponible = quantite WHERE quantite_disponible IS NULL;
ALTER TABLE annonces ALTER COLUMN quantite_disponible SET NOT NULL;
ALTER TABLE annonces ADD CONSTRAINT annonces_quantite_disponible_check
    CHECK (quantite_disponible >= 0) NOT VALID;
CREATE INDEX IF NOT EXISTS idx_annonces_localisation ON annonces USING GIST (localisation);

CREATE TABLE IF NOT EXISTS marketplace_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    annonce_id UUID NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'cancelled', 'completed', 'rejected')),
    pickup_mode VARCHAR(30) NOT NULL DEFAULT 'retrait_sur_place',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservations_listing ON marketplace_reservations(annonce_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_buyer ON marketplace_reservations(buyer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    annonce_id UUID NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (annonce_id, buyer_id)
);
CREATE TABLE IF NOT EXISTS marketplace_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES marketplace_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON marketplace_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS marketplace_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID NOT NULL UNIQUE REFERENCES marketplace_reservations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT CHECK (char_length(comment) <= 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
