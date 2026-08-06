.PHONY: venv install dev test lint migrate seed format clean

SERVICES := gateway auth-service workflow-service execution-service billing-service notification-service

venv:
	@echo "Creating Python virtual environments..."
	@for svc in $(SERVICES); do \
		cd services/$$svc && python -m venv .venv && cd ../..; \
	done

install:
	@echo "Installing Python dependencies..."
	@for svc in $(SERVICES); do \
		cd services/$$svc && .venv/bin/pip install -r requirements.txt && .venv/bin/pip install -r requirements-dev.txt && cd ../..; \
	done
	@echo "Installing frontend dependencies..."
	cd apps/web && npm install

dev:
	docker-compose up --build

test:
	@for svc in $(SERVICES); do \
		cd services/$$svc && .venv/bin/pytest && cd ../..; \
	done
	cd apps/web && npm run test

lint:
	@for svc in $(SERVICES); do \
		cd services/$$svc && .venv/bin/ruff check . && .venv/bin/mypy . && cd ../..; \
	done
	cd apps/web && npm run lint

seed:
	@echo "Seeding template gallery..."
	cd services/workflow-service && .venv/bin/python scripts/seed_templates.py

migrate:
	@for svc in auth-service workflow-service execution-service billing-service notification-service; do \
		cd services/$$svc && .venv/bin/alembic upgrade head && cd ../..; \
	done

format:
	@for svc in $(SERVICES); do \
		cd services/$$svc && .venv/bin/ruff format . && cd ../..; \
	done
	cd apps/web && npm run format

clean:
	@for svc in $(SERVICES); do \
		rm -rf services/$$svc/.venv; \
	done
	@rm -rf apps/web/node_modules
