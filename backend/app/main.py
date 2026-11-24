"""FastAPI application entry point for 净影 CleanFrame."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import PROJECT_ROOT, get_settings
from .db import SessionLocal, init_db
from .routers import assets, jobs, resources, system
from .seed import seed_initial_data
from .services.scheduler import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    await scheduler.start()
    yield
    await scheduler.stop()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="净影 CleanFrame — 基于火山引擎 LAS（las_video_inpaint_pro / las_video_translate）的批量视频修复与多语翻译后台服务",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routers
    app.include_router(system.router)
    app.include_router(assets.router)
    app.include_router(jobs.router)
    app.include_router(resources.router)

    # Static media mounts
    app.mount("/media/uploads", StaticFiles(directory=str(settings.uploads_path)), name="media_uploads")
    app.mount("/media/outputs", StaticFiles(directory=str(settings.outputs_path)), name="media_outputs")
    app.mount("/media/thumbnails", StaticFiles(directory=str(settings.thumbnails_path)), name="media_thumbnails")

    sample_dir = PROJECT_ROOT / "assets"
    if sample_dir.exists():
        app.mount("/media/sample", StaticFiles(directory=str(sample_dir)), name="media_sample")

    screens_dir = PROJECT_ROOT / "web" / "assets" / "screens"
    if screens_dir.exists():
        app.mount("/media/screens", StaticFiles(directory=str(screens_dir)), name="media_screens")

    # Optional production React build serving
    frontend_dist = PROJECT_ROOT / "frontend" / "dist"
    if frontend_dist.exists():
        assets_dir = frontend_dist / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend_assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def serve_spa(full_path: str):
            candidate = frontend_dist / full_path
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(frontend_dist / "index.html")

    return app


app = create_app()
