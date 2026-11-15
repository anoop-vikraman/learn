# 02 · Real-time and file handling

## 1. Choosing a real-time approach

> **In short:** Short polling is simplest, SSE is right for server→client streams, WebSockets for two-way, and push notifications for when the app is closed.

| Approach | Direction | Cost | Use for |
| --- | --- | --- | --- |
| **Short polling** | Client asks repeatedly | Wasteful but trivial | Status every 30 s, low-value data |
| **Long polling** | Client asks, server holds | Medium | Legacy environments without WS support |
| **SSE** (`text/event-stream`) | Server → client, one way | Cheap, plain HTTP, auto-reconnect | Progress bars, notifications, LLM token streaming, live dashboards |
| **WebSockets** | Bidirectional, persistent | Stateful connections to manage | Chat, collaborative editing, multiplayer, live trading |
| **Push notifications** | Server → device, app closed | Platform services | Mobile alerts (see [../../Mobile/02-App-Development/03-device-apis.md](../../Mobile/02-App-Development/03-device-apis.md)) |
| **Webhooks** | Server → another server | — | Integrations between backends |

**Default advice:** if the client only *receives*, use SSE — it's HTTP, works through most proxies, reconnects automatically, and needs no special infrastructure. Reach for WebSockets only when the client also sends frequently.

## 2. Server-Sent Events

> **In short:** A long-lived HTTP response streaming `data:` lines; the browser's `EventSource` reconnects on its own.

```python
# FastAPI
from fastapi.responses import StreamingResponse

@app.get("/jobs/{job_id}/events")
async def job_events(job_id: str):
    async def gen():
        while True:
            status = await get_status(job_id)
            yield f"event: progress\ndata: {json.dumps(status)}\n\n"
            if status["done"]:
                break
            await asyncio.sleep(1)
    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
```

```ts
// Express
res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
const timer = setInterval(() => res.write(`data: ${JSON.stringify(await status())}\n\n`), 1000);
req.on('close', () => clearInterval(timer));
```

```ts
// Browser
const es = new EventSource('/jobs/42/events');
es.addEventListener('progress', (e) => setProgress(JSON.parse(e.data)));
es.onerror = () => { /* EventSource retries automatically */ };
```

Gotchas: disable proxy buffering (`X-Accel-Buffering: no` for Nginx), send a heartbeat comment (`:ping\n\n`) every ~30 s so idle connections aren't dropped, and remember each connection holds a worker/connection slot.

## 3. WebSockets

> **In short:** A persistent bidirectional connection — the hard parts are authentication, scaling across instances, and reconnection.

```python
# FastAPI
@app.websocket("/ws/{room}")
async def ws(websocket: WebSocket, room: str, token: str | None = None):
    user = authenticate(token)                 # browsers can't set headers on WS: use a query token or cookie
    if not user:
        await websocket.close(code=4401); return
    await manager.connect(room, websocket)
    try:
        while True:
            msg = await websocket.receive_json()
            await manager.broadcast(room, {"user": user.id, "text": msg["text"]})
    except WebSocketDisconnect:
        manager.disconnect(room, websocket)
```

```ts
// Node with ws
import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ server });
wss.on('connection', (socket, req) => {
  const user = authenticate(new URL(req.url!, 'http://x').searchParams.get('token'));
  if (!user) return socket.close(4401);
  socket.on('message', (raw) => broadcast(room, raw));
});
```

### Scaling across instances

> **In short:** Each server only knows its own sockets — use Redis pub/sub (or a managed service) so a message reaches users connected elsewhere.

```
user A ──▶ instance 1 ──publish──▶ Redis channel ──▶ instance 2 ──▶ user B
```

Socket.IO has a Redis adapter; raw WS needs you to subscribe per instance and fan out. Managed alternatives: Pusher, Ably, Supabase Realtime, AWS API Gateway WebSockets.

### Production concerns

> **In short:** Auth, reconnection, dropped messages, load balancers, heartbeats and backpressure.

| Concern | Handling |
| --- | --- |
| Auth | Token in the connection query/cookie, validated on connect; re-check on sensitive actions |
| Reconnection | Client backoff + resume from a last-seen message ID |
| Dropped messages | Persist messages; don't treat the socket as storage |
| Load balancers | Sticky sessions or a shared pub/sub layer; raise idle timeouts |
| Heartbeats | Ping/pong to detect dead connections |
| Backpressure | Drop or coalesce messages for slow clients |
| Horizontal scale | Connections are stateful — plan connection counts per instance |

## 4. Long-running jobs: the standard pattern

> **In short:** Accept the request, return 202 with a job ID, process in a worker, and let the client poll or subscribe.

```
POST /reports        → 202 { "reportId": "abc", "status": "queued" }
GET  /reports/abc    → { "status": "running", "progress": 40 }
GET  /reports/abc    → { "status": "done", "url": "https://…" }
   (or SSE/WebSocket push instead of polling)
```

Store status in **your database**, not only in the queue — see [../FastAPI/06-Celery/01-basics.md](../FastAPI/06-Celery/01-basics.md) and [../Node/04-Redis-BullMQ/02-bullmq.md](../Node/04-Redis-BullMQ/02-bullmq.md).

## 5. File uploads: presigned URLs

> **In short:** Don't stream large files through your API — have the client upload directly to object storage using a short-lived signed URL.

```
1. Client → API:  "I want to upload avatar.jpg, 2 MB, image/jpeg"
2. API validates (size, type, quota, auth) → asks S3 for a presigned PUT URL (expires in 5 min)
3. API → Client:  { uploadUrl, fileKey }
4. Client → S3:   PUT the bytes directly        ← your server never sees them
5. Client → API:  "done, key = uploads/u123/avatar.jpg"
6. API verifies the object exists (HEAD), records it, and may queue processing (thumbnails, virus scan)
```

```python
# FastAPI + boto3
@router.post("/uploads/presign")
def presign(req: PresignRequest, user: CurrentUser):
    if req.content_type not in ALLOWED or req.size_bytes > MAX_SIZE:
        raise HTTPException(422, "Unsupported file")
    key = f"uploads/{user.id}/{uuid4()}{Path(req.filename).suffix}"
    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": key, "ContentType": req.content_type},
        ExpiresIn=300,
    )
    return {"uploadUrl": url, "key": key}
```

Why this is the standard answer in interviews:
- Your API servers don't buffer gigabytes or hold connections open.
- It scales with the storage provider, not your app.
- Resumable/multipart uploads are supported by the provider.
- Downloads work the same way: presigned GET URLs (short-lived, so links can't be shared forever).

Security checklist: validate type **and** size server-side before signing, never trust the client's filename (generate your own key), scan for malware if users share files, serve user content from a **separate domain** (so stored HTML/SVG can't run scripts on your origin), and set `Content-Disposition: attachment` where appropriate.

## 6. Direct uploads through your API (when you must)

> **In short:** Acceptable for small files — stream to disk/storage rather than reading into memory, and enforce hard limits.

```python
@app.post("/upload")
async def upload(file: UploadFile):
    if file.content_type not in ALLOWED: raise HTTPException(400)
    size = 0
    with open(dest, "wb") as out:
        while chunk := await file.read(1024 * 1024):          # stream in 1 MB chunks
            size += len(chunk)
            if size > MAX_SIZE: raise HTTPException(413, "Too large")
            out.write(chunk)
```

Also set a body-size limit at the proxy (`client_max_body_size` in Nginx) — otherwise a 5 GB POST reaches your app before any of your code runs.

## 7. Serving and streaming downloads

> **In short:** Redirect to signed storage URLs or a CDN; stream generated files instead of building them in memory.

```python
# Stream a CSV export without materialising it
@app.get("/export.csv")
def export(db: DbSession):
    def rows():
        yield "id,title\n"
        for t in db.stream_tasks():
            yield f"{t.id},{t.title}\n"
    return StreamingResponse(rows(), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="tasks.csv"'})
```

Support `Range` requests for video/audio, use CDN caching for public assets, and generate very large exports as **background jobs** that email or notify a download link.

---

## 8. Exercises

1. Build a job-progress endpoint with SSE and consume it in the browser with `EventSource`.
2. Add a heartbeat and prove the connection survives an idle proxy timeout.
3. Build a WebSocket chat room, then make it work across two server instances with Redis pub/sub.
4. Implement presigned upload: validate, sign, upload from the client, confirm, and store the key.
5. Add a background thumbnail job triggered after upload confirmation.
6. Stream a 100k-row CSV export and watch memory stay flat.
