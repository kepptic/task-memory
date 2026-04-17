# TASK-002 Notes — Research API design patterns

_Created 2026-01-07. Captures context that would otherwise be lost at session end or compaction._

## Summary

Researched REST API patterns (pagination, errors, versioning) to inform v1 design.
Concluded on cursor-based pagination, JSON:API error format, and `/v1/` URL prefix.
Recommendations accepted by @alice; see TASK-006 for rollout.

## Patterns Discovered

- Cursor-based pagination avoids the consistency issues offset-based has when rows are inserted mid-scan.
- JSON:API error format (`{ errors: [{ status, title, detail }] }`) maps cleanly to HTTP status semantics.
- URL-prefix versioning (`/v1/`) beats header-based versioning for discoverability in dashboards and logs.

## Gotchas

- Cursor pagination requires a stable sort key — don't use `created_at` without a secondary tiebreaker (like `id`), or two rows with the same timestamp will alternate positions.
- GitHub's `Link` header pagination is standards-compliant but clients must parse it; in practice we got better DX returning cursors in the JSON body.

## Decisions

- Cursor-based pagination — avoids offset drift, scales cleanly to millions of rows.
- JSON:API error shape — industry-standard; lets generic clients render errors without per-endpoint logic.
- `/v1/` URL prefix — allows future v2 coexistence without breaking v1 consumers.

## Resources

- https://jsonapi.org/format/ — error shape + pagination links
- https://developer.github.com/v3/ — prior-art for rate-limit headers
- https://www.citusdata.com/blog/2016/03/30/five-ways-to-paginate/ — keyset vs. offset tradeoffs

## Open Questions

- Do we expose cursors as opaque tokens (base64) or plain keyset values? Opaque is safer for future schema changes.
