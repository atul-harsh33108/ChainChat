from contextlib import asynccontextmanager

import httpx
import structlog
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import jwt, exceptions as jose_exceptions

from src.gateway.config import settings
from src.gateway.routers import health

logger = structlog.get_logger()

SERVICE_MAP = {
    "auth": settings.auth_service_url,
    "workspaces": settings.auth_service_url,
    "users": settings.auth_service_url,
    "admin": settings.auth_service_url,
    "workflows": settings.workflow_service_url,
    "templates": settings.workflow_service_url,
    "executions": settings.execution_service_url,
    "billing": settings.billing_service_url,
    "notifications": settings.notification_service_url,
}

http_client: httpx.AsyncClient | None = None
jwks_client = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient(timeout=30.0)
    yield
    await http_client.aclose()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://chainchat.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1/health", tags=["health"])


async def get_clerk_public_key():
    if not settings.clerk_jwks_url or "placeholder" in settings.clerk_jwks_url:
        return None
    if http_client is None:
        return None
    resp = await http_client.get(settings.clerk_jwks_url)
    resp.raise_for_status()
    return resp.json()


async def validate_token(token: str) -> dict:
    jwks = await get_clerk_public_key()
    if jwks is None:
        # Development bypass: decode without verification.
        try:
            return jwt.get_unverified_claims(token)
        except jose_exceptions.JWTError as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    try:
        return jwt.decode(token, jwks, algorithms=["RS256"], audience="chainchat")
    except jose_exceptions.JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


@app.api_route("/api/v1/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(request: Request, path: str):
    first_segment = path.split("/")[0]
    target = SERVICE_MAP.get(first_segment)
    if target is None:
        raise HTTPException(status_code=404, detail="Service not found")

    url = f"{target}/api/v1/{path}"
    headers = dict(request.headers)
    headers.pop("host", None)

    if not path.startswith("webhooks/"):
        auth_header = headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing bearer token")
        token = auth_header.replace("Bearer ", "")
        claims = await validate_token(token)
        headers["x-user-id"] = claims.get("sub", "")
        headers["x-workspace-id"] = claims.get("org_id", "")
        headers["x-role"] = claims.get("org_role", "")

    body = await request.body()
    if http_client is None:
        # The lifespan handler always sets this before serving requests.
        raise HTTPException(status_code=503, detail="Gateway is not ready")
    try:
        resp = await http_client.request(
            method=request.method,
            url=url,
            headers=headers,
            content=body,
            params=dict(request.query_params),
        )
    except httpx.RequestError as e:
        logger.error("upstream_request_failed", url=url, error=str(e))
        raise HTTPException(status_code=503, detail="Upstream service unavailable")

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=dict(resp.headers),
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error("unhandled_exception", path=request.url.path, error=str(exc))
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
