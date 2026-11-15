# API design and architecture

Language-independent backend topics that apply to **both** the FastAPI and Node tracks — and that interviewers ask about constantly.

| # | Lesson | Covers |
| --- | --- | --- |
| 01 | [API design](01-api-design.md) | REST properly, resource modelling, status codes, pagination, filtering, errors, versioning, idempotency, OpenAPI — plus **GraphQL** and **gRPC** and when to choose each |
| 02 | [Real-time and file handling](02-realtime-and-files.md) | Polling vs SSE vs WebSockets vs push, scaling real-time, file uploads with presigned URLs, streaming downloads |
| 03 | [Architecture and messaging](03-architecture-and-messaging.md) | Monolith vs modular monolith vs microservices, 12-factor, event-driven patterns, Kafka vs RabbitMQ vs Redis, outbox/saga, idempotent consumers |
| 04 | [System design for backend interviews](04-system-design-interviews.md) | A repeatable framework plus four worked examples (URL shortener, feed, chat, rate limiter) and capacity-estimation numbers |

Read these after you're comfortable building an API in one stack — they're about the decisions *above* the framework.
