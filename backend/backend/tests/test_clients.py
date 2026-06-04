import pytest
from app.routes.clients import router


def test_clients_router_exists():
    """Vérifie que le router clients existe."""
    assert router is not None
    assert router.prefix == "/clients"


def test_client_create_model():
    """Teste le modèle ClientCreate."""
    from app.routes.clients import ClientCreate
    client = ClientCreate(name="Acme Corp")
    assert client.name == "Acme Corp"
