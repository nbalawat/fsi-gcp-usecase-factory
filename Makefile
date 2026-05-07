# Top-level convenience targets. Run `make help` for the full list.

.PHONY: help test test-framework test-services test-all test-llm lint clean

help:
	@echo "FSI agentic banking factory — common targets"
	@echo ""
	@echo "  make test-framework   Framework tests (gatekeepers / harness) — deterministic, fast"
	@echo "  make test-services    Per-atomic-service unit tests (real SQLite, no mocks)"
	@echo "  make test-rules       Rules-service unit tests"
	@echo "  make test-all         Run framework + services + rules — full unit/lint tier"
	@echo "  make test-llm         Framework tests in LLM tier (requires ANTHROPIC_API_KEY)"
	@echo "  make lint             ruff + mypy across the repo"
	@echo "  make clean            Remove caches"

test: test-framework

test-framework:
	@echo "── framework tests (deterministic) ──"
	@pytest tests/framework -q

test-services:
	@for svc in services/atomic/*/; do \
		if [ -f "$$svc/tests/test_main.py" ]; then \
			echo "── $$(basename $$svc) ──"; \
			(cd "$$svc" && python3 -m pytest tests/ -q) || exit 1; \
		fi; \
	done

test-rules:
	@if [ -f services/rules-service/tests/test_main.py ]; then \
		echo "── rules-service ──"; \
		(cd services/rules-service && python3 -m pytest tests/ -q); \
	fi

test-all: test-framework test-services test-rules

test-llm:
	@RUN_LLM_TESTS=1 pytest tests/framework -q -m llm

lint:
	@if command -v ruff >/dev/null; then ruff check tests/ services/ usecases/; else echo "ruff not installed"; fi
	@if command -v mypy >/dev/null; then mypy tests/framework --ignore-missing-imports; else echo "mypy not installed"; fi

clean:
	@find . -type d \( -name __pycache__ -o -name .pytest_cache -o -name .ruff_cache -o -name .mypy_cache \) -prune -exec rm -rf {} +
