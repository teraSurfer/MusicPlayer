"""Guards the layering rules from PRD section 5.3."""

import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[3] / "app"


def imported_modules(path: Path) -> set[str]:
    modules: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def python_files(package: str) -> list[Path]:
    return sorted((APP / package).rglob("*.py"))


def test_services_depend_on_storage_protocol_not_implementations() -> None:
    for path in python_files("services"):
        assert "app.storage.local" not in imported_modules(path), path


def test_services_do_not_import_fastapi() -> None:
    for path in python_files("services"):
        assert not any(m.split(".")[0] == "fastapi" for m in imported_modules(path)), path


def test_storage_package_does_not_import_database_or_web_layers() -> None:
    forbidden = ("app.db", "app.api", "app.services", "fastapi", "sqlalchemy")
    for path in python_files("storage"):
        for module in imported_modules(path):
            assert not module.startswith(forbidden), (path, module)
