from contracts.schemas import assess_complexity


def test_simple_snake_game():
    assert assess_complexity("Make me a simple snake game") == "simple"

def test_simple_landing():
    assert assess_complexity("Build a basic landing page") == "simple"

def test_medium_default():
    assert assess_complexity("Build me a task management application with user accounts") == "medium"

def test_complex_platform():
    assert assess_complexity("Build a multi-tenant real-time dashboard platform with auth, database, API, and admin panel for managing microservice integrations") == "complex"

def test_short_ambiguous():
    assert assess_complexity("Build a weather app") == "medium"
