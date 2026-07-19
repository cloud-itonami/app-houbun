# houbun XRPC Adapter

CF Worker exposing 12 kotoba commands as XRPC endpoints.

## Endpoints

- `POST /xrpc/com.etzhayyim.houbun.registerStatute` — register statute
- `GET /xrpc/com.etzhayyim.houbun.getStatute` — statute by ID
- `GET /xrpc/com.etzhayyim.houbun.listStatutes` — paginated list
- `POST /xrpc/com.etzhayyim.houbun.registerArticle` — register article
- `GET /xrpc/com.etzhayyim.houbun.getArticle` — article by DID
- `POST /xrpc/com.etzhayyim.houbun.registerTreaty` — register treaty
- `GET /xrpc/com.etzhayyim.houbun.getTreaty` — treaty by ID
- `POST /xrpc/com.etzhayyim.houbun.recordAmendment` — record amendment
- `POST /xrpc/com.etzhayyim.houbun.ingestStatuteJpn` — Japanese statutes
- `POST /xrpc/com.etzhayyim.houbun.ingestStatuteUsa` — US statutes
- `POST /xrpc/com.etzhayyim.houbun.ingestEurLex` — EU legislation
- `POST /xrpc/com.etzhayyim.houbun.ingestTreatyUn` — UN treaties

## Deploy

```bash
wrangler deploy
```

See ADR-2605210000.
