# syntax=docker/dockerfile:1

# ---- Stage 1: build the React frontend -------------------------------------
FROM node:20-alpine AS frontend-build

WORKDIR /build

# Manifests first, so `npm ci` is cached independently of source changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build


# ---- Stage 2: runtime ------------------------------------------------------
FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# ffmpeg/ffprobe drive duration probes and thumbnail extraction; curl backs the healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Layout must mirror the repo, because the backend resolves paths as
# PROJECT_ROOT = backend/.. and serves frontend/dist from there.
COPY backend/ ./backend/
COPY assets/ ./assets/
COPY --from=frontend-build /build/dist ./frontend/dist
COPY start.sh LICENSE README.md ./

RUN mkdir -p /app/backend/storage/uploads /app/backend/storage/outputs /app/backend/storage/thumbnails

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

# 0.0.0.0 is required inside a container; the host decides what to publish.
# The uploads/outputs/thumbnails subdirectories are created by the application on
# startup, so an empty bind-mounted storage volume is safe. Exec form keeps uvicorn
# as PID 1 so `docker stop` delivers SIGTERM cleanly.
WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
