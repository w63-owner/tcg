-- Permettre a tous les utilisateurs de voir la page d'une annonce meme si elle est vendue, reservee ou bloquee.
-- Cela evite l'erreur 404 lors du clic depuis la messagerie.
CREATE POLICY "listings_public_read_unavailable"
ON public.listings
FOR SELECT
USING (status IN ('LOCKED', 'RESERVED', 'SOLD'));
