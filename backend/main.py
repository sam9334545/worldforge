from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from backend.engine import init_world
    from backend.models import WorldState
except ImportError:
    from engine import init_world
    from models import WorldState

app = FastAPI(title="Energy Ecosystem Simulation Engine", version="1.0.0")

# Enable CORS for local Vite frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global world state initialized with 2 players
world_state: WorldState = init_world(num_players=2)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Python Engine Active"}


@app.get("/api/state", response_model=WorldState)
def get_state():
    return world_state
