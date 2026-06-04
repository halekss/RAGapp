import pytest
from app.api.routes.clients import router, ClientCreate


def test_clients_router_exists():
    assert router is not None
    assert router.prefix == "/clients"


def test_client_create_model():
    client = ClientCreate(name="Acme Corp")
    assert client.name == "Acme Corp"
