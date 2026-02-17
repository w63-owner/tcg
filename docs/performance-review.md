# Performance Review (Feed + Messages)

## Feed (`/`)

### Current behavior

- Server-side pagination via `range(from,to)` on `listings`.
- Filters: `status`, `title`, `set/card_ref`, `condition`, `is_graded`, `grade_note`, `display_price`.
- Sort: `created_at`, `display_price`, `grade_note`.

### Supporting indexes

From migrations:

- `idx_listings_status`
- `idx_listings_display_price_active`
- `idx_listings_condition_active`
- `idx_listings_graded_note_active`
- `idx_listings_card_ref_active`
- `idx_listings_title_trgm`
- `idx_cards_ref_set`

### Recommendation

- Keep page size at 40 (good trade-off).
- If dataset grows significantly (>100k listings), consider cursor pagination by `(created_at,id)` for better deep-page performance.

## Messages (`/messages`, `/messages/[conversationId]`)

### Current behavior

- Inbox pagination (20 conv/page).
- Thread pagination (30 msg/page).
- Realtime refresh on new events.

### Supporting indexes

- `idx_conversations_buyer`
- `idx_conversations_seller`
- `idx_conversations_listing`
- `idx_messages_conversation_created`
- `idx_messages_unread`

### Recommendation

- If unread count query becomes expensive, add materialized counter per conversation (denormalized field) updated on insert/read.
- Keep `updated_at` maintained on conversations for inbox sorting.

## Validation commands

Use SQL editor / psql:

```sql
explain analyze
select id, title, display_price
from public.listings
where status = 'ACTIVE'
order by created_at desc
limit 40;
```

```sql
explain analyze
select id, sender_id, content, created_at
from public.messages
where conversation_id = '<conversation-id>'
order by created_at desc
limit 30;
```

If execution time spikes, review missing index scans and add targeted composite indexes.
