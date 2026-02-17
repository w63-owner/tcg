# Security/RLS Audit (Favorites, Saved Searches, Conversations, Messages)

## Scope

- `favorite_listings`
- `favorite_sellers`
- `saved_searches`
- `conversations`
- `messages`

Audit source of truth:

- `supabase/migrations/202602160006_favorites_messages_search.sql`

## Policy Review

### 1) `favorite_listings`

- **SELECT**: only `user_id = auth.uid()`
- **INSERT**: only `user_id = auth.uid()`
- **DELETE**: only `user_id = auth.uid()`

Expected isolation: user B cannot read/insert/delete favorites of user A.

### 2) `favorite_sellers`

- **SELECT**: only `user_id = auth.uid()`
- **INSERT**: only `user_id = auth.uid()` and `user_id <> seller_id`
- **DELETE**: only `user_id = auth.uid()`

Expected isolation: same as above + cannot favorite self.

### 3) `saved_searches`

- **SELECT/INSERT/UPDATE/DELETE**: only `user_id = auth.uid()`

Expected isolation: strict owner-only CRUD.

### 4) `conversations`

- **SELECT/UPDATE**: only participants (`buyer_id = auth.uid()` or `seller_id = auth.uid()`)
- **INSERT**: only participant side and `buyer_id <> seller_id`

Expected isolation: non-participant cannot read/update conversation metadata.

### 5) `messages`

- **SELECT**: only if linked conversation has current user as buyer/seller
- **INSERT**: only participant and `sender_id = auth.uid()`
- **UPDATE**: only participants (used for `read_at`)

Expected isolation: non-participant cannot read or write messages.

## Intrusion Matrix (expected)

| Scenario | Expected result |
|---|---|
| User B selects `favorite_listings` of user A | Empty / forbidden by RLS |
| User B deletes user A favorite row | 0 row affected |
| User B selects user A `saved_searches` by id | Empty |
| User B updates user A `saved_searches` by id | 0 row affected |
| User C reads conversation between A and B | Empty |
| User C inserts message in A/B conversation | Forbidden |
| User A inserts message with `sender_id = B` | Forbidden |

## Operational checks

- Run script: `scripts/rls-intrusion-audit.mjs` with two auth users.
- Re-run after each migration touching these tables/policies.

## Notes

- `ensure_conversation_for_offer` RPC is `SECURITY DEFINER` and enforces seller + accepted offer checks.
- Unique keys prevent duplication:
  - `favorite_listings(user_id, listing_id)`
  - `favorite_sellers(user_id, seller_id)`
  - `conversations(listing_id, buyer_id, seller_id)`
