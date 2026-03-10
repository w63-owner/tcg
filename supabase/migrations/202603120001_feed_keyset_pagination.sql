-- Keyset pagination for search_listings_feed (replaces OFFSET)
-- Cursor: (id, created_at, display_price, grade_note) — RPC uses the right pair based on p_sort
-- Max page size 50 to prevent OOM

CREATE OR REPLACE FUNCTION public.search_listings_feed(
  p_q text DEFAULT NULL,
  p_set text DEFAULT NULL,
  p_rarity text DEFAULT NULL,
  p_condition text DEFAULT NULL,
  p_is_graded boolean DEFAULT NULL,
  p_grade_min numeric DEFAULT NULL,
  p_grade_max numeric DEFAULT NULL,
  p_price_min numeric DEFAULT NULL,
  p_price_max numeric DEFAULT NULL,
  p_sort text DEFAULT 'date_desc',
  p_cursor_id uuid DEFAULT NULL,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_display_price numeric DEFAULT NULL,
  p_cursor_grade_note numeric DEFAULT NULL,
  p_limit integer DEFAULT 41,
  p_exclude_seller_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  cover_image_url text,
  price_seller numeric,
  display_price numeric,
  condition text,
  is_graded boolean,
  grading_company text,
  grade_note numeric,
  card_ref_id text,
  created_at timestamptz,
  language text,
  favorite_count bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 41), 1), 50);
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.title,
    l.cover_image_url,
    l.price_seller,
    l.display_price,
    l.condition,
    l.is_graded,
    l.grading_company,
    l.grade_note,
    l.card_ref_id,
    l.created_at,
    c.language,
    (SELECT count(*)::bigint FROM public.favorite_listings fl WHERE fl.listing_id = l.id) AS favorite_count
  FROM public.listings l
  LEFT JOIN public.tcgdex_cards c ON c.card_key = l.card_ref_id
  WHERE l.status = 'ACTIVE'
    AND (p_exclude_seller_id IS NULL OR l.seller_id <> p_exclude_seller_id)
    AND (p_condition IS NULL OR p_condition = '' OR l.condition::text = p_condition)
    AND (p_is_graded IS NULL OR l.is_graded = p_is_graded)
    AND (p_grade_min IS NULL OR l.grade_note >= p_grade_min)
    AND (p_grade_max IS NULL OR l.grade_note <= p_grade_max)
    AND (p_price_min IS NULL OR l.display_price >= p_price_min)
    AND (p_price_max IS NULL OR l.display_price <= p_price_max)
    AND (p_set IS NULL OR p_set = '' OR c.set_name = p_set)
    AND (p_rarity IS NULL OR p_rarity = '' OR c.rarity = p_rarity)
    AND (
      p_q IS NULL
      OR p_q = ''
      OR l.title ILIKE '%' || p_q || '%'
      OR (
        coalesce(c.name, '') || ' ' || coalesce(c.set_id, '') || ' ' || coalesce(c.set_name, '') || ' ' || coalesce(c.id, '') || ' ' || coalesce(c.local_id, '') || ' ' || coalesce(c.language, '')
      ) ILIKE '%' || p_q || '%'
    )
    -- Keyset: next page = rows strictly after cursor (sort-dependent)
    AND (
      p_cursor_id IS NULL
      OR (
        CASE
          WHEN p_sort = 'date_desc' OR p_sort IS NULL OR p_sort = '' THEN
            (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
          WHEN p_sort = 'date_asc' THEN
            (l.created_at, l.id) > (p_cursor_created_at, p_cursor_id)
          WHEN p_sort = 'price_desc' THEN
            (COALESCE(l.display_price, -1), l.id) < (COALESCE(p_cursor_display_price, -1), p_cursor_id)
          WHEN p_sort = 'price_asc' THEN
            (COALESCE(l.display_price, -1), l.id) > (COALESCE(p_cursor_display_price, -1), p_cursor_id)
          WHEN p_sort = 'grade_desc' THEN
            (COALESCE(l.grade_note, -1), l.id) < (COALESCE(p_cursor_grade_note, -1), p_cursor_id)
          WHEN p_sort = 'grade_asc' THEN
            (COALESCE(l.grade_note, -1), l.id) > (COALESCE(p_cursor_grade_note, -1), p_cursor_id)
          ELSE
            (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
        END
      )
    )
  ORDER BY
    CASE WHEN p_sort = 'price_asc' THEN l.display_price END ASC NULLS LAST,
    CASE WHEN p_sort = 'price_desc' THEN l.display_price END DESC NULLS LAST,
    CASE WHEN p_sort = 'grade_asc' THEN l.grade_note END ASC NULLS LAST,
    CASE WHEN p_sort = 'grade_desc' THEN l.grade_note END DESC NULLS LAST,
    CASE WHEN p_sort = 'date_asc' THEN l.created_at END ASC,
    CASE WHEN p_sort = 'date_desc' OR p_sort IS NULL OR p_sort = '' THEN l.created_at END DESC,
    l.id ASC
  LIMIT v_limit;
END;
$$;

-- Update GRANT for new signature (cursor params, no p_offset)
GRANT EXECUTE ON FUNCTION public.search_listings_feed(text, text, text, text, boolean, numeric, numeric, numeric, numeric, text, uuid, timestamptz, numeric, numeric, integer, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.search_listings_feed(text, text, text, text, boolean, numeric, numeric, numeric, numeric, text, uuid, timestamptz, numeric, numeric, integer, uuid) TO authenticated;
