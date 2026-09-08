"""Test FastAPI Benchmark Router endpoints."""

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_list_agents():
    res = client.get("/api/benchmark/agents")
    assert res.status_code == 200
    data = res.json()
    assert "available_agents" in data
    assert "donothing" in data["available_agents"]
    assert "heuristic" in data["available_agents"]
    assert "lookup" in data["available_agents"]
    assert "random" in data["available_agents"]


def test_list_seeds():
    res = client.get("/api/benchmark/seeds")
    assert res.status_code == 200
    data = res.json()
    assert data["training_seeds"] == [1, 2, 3, 4, 5]
    assert data["held_out_seeds"] == [101, 102, 103, 104, 105]


@pytest.mark.parametrize("agent_type", ["donothing", "random", "lookup", "heuristic"])
def test_run_benchmark_all_agent_types(agent_type):
    payload = {
        "seed": 2,
        "agent_type": agent_type,
        "max_steps": 200,
        "decision_interval": 100,
    }
    res = client.post("/api/benchmark/run", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["seed"] == 2
    assert data["seed_category"] == "training"
    assert data["agent_type"] == agent_type
    assert data["max_steps"] == 200

    # Verify scoring metrics
    metrics = data["scoring_metrics"]
    assert "score" in metrics
    assert 0.0 <= metrics["score"] <= 100.0
    assert "terminal_equity" in metrics
    assert "starting_equity" in metrics
    assert "total_return" in metrics
    assert "components" in metrics
    assert "weights" in metrics

    # Verify transmission efficiency
    tx = data["transmission_efficiency"]
    assert "mwh_generated" in tx
    assert "mwh_delivered" in tx
    assert "mwh_curtailed" in tx
    assert "transmission_loss_mwh" in tx
    assert "delivery_efficiency" in tx
    assert "loss_rate" in tx
    assert "curtailment_rate" in tx

    # Verify performance logs
    logs = data["performance_logs"]
    assert logs["total_ticks"] == 200
    assert "sim_years" in logs
    assert "wall_time_seconds" in logs
    assert "summary_report" in logs
    assert len(logs["step_logs"]) >= 1


def test_run_benchmark_held_out_seed():
    payload = {
        "seed": 102,
        "agent_type": "heuristic",
        "max_steps": 300,
    }
    res = client.post("/api/benchmark/run", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["seed"] == 102
    assert data["seed_category"] == "held_out"
    assert data["scoring_metrics"]["machines_built"] > 0


def test_invalid_agent_type():
    payload = {
        "seed": 1,
        "agent_type": "non_existent_agent",
        "max_steps": 100,
    }
    res = client.post("/api/benchmark/run", json=payload)
    assert res.status_code == 400
    assert "Unknown agent type" in res.json()["detail"]


def test_invalid_max_steps():
    payload = {
        "seed": 1,
        "agent_type": "donothing",
        "max_steps": 0,
    }
    res = client.post("/api/benchmark/run", json=payload)
    assert res.status_code == 422


def test_benchmark_suite_endpoint():
    payload = {
        "agent_types": ["donothing", "heuristic"],
        "seeds": [1, 2],
        "horizon_years": 0.1,
    }
    res = client.post("/api/benchmark/suite", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["records_count"] == 4
    assert "aggregation" in data
    assert "leaderboard" in data
    assert "heuristic" in data["aggregation"]
    assert "donothing" in data["aggregation"]


def test_generalization_gap_endpoint():
    res = client.get("/api/benchmark/generalization-gap?horizon_years=0.1")
    assert res.status_code == 200
    data = res.json()
    assert "generalization_gap" in data
    assert "train_aggregate" in data
    assert "held_out_aggregate" in data


def test_direct_benchmark_prefix_route():
    payload = {
        "seed": 42,
        "agent_type": "donothing",
        "max_steps": 50,
    }
    res = client.post("/benchmark/run", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["seed"] == 42
    assert data["agent_type"] == "donothing"

