import app._compat_shims  # noqa: F401 — pdfminer shim before any rag/unstructured import
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.agriculture import router as agriculture_router
from app.routers.diagnostic import router as diagnostic_router

app = FastAPI(title="AgriAdvisor — Agent Agriculture", version="0.1.0")

# Dev only : le frontend (Vite) tourne sur un port différent de ce service.
# À restreindre à l'origine réelle du frontend une fois déployé.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agriculture_router)
app.include_router(diagnostic_router)


@app.get("/health")
def health():
    return {"status": "ok", "agent": "agriculture"}
