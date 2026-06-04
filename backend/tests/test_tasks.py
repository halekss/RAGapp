import pytest
from app.services.tasks import check_scheduled_sources


def test_check_scheduled_sources():
    """Test que la tâche se lance sans erreur."""
    result = check_scheduled_sources()
    assert result["status"] == "ok"
