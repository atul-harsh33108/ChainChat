from fastapi import APIRouter, Request

router = APIRouter()


@router.post("/clerk")
async def clerk_webhook(request: Request):
    return {"received": True}
