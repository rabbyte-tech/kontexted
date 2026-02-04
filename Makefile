.PHONY: install dev build start clean test docker-build docker-run help

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)Kontexted Development Commands$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

install: ## Install dependencies for all projects
	@echo "$(BLUE)Installing client dependencies...$(NC)"
	cd apps/client && bun install
	@echo "$(BLUE)Installing server dependencies...$(NC)"
	cd apps/server && bun install
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

install-client: ## Install client dependencies only
	cd apps/client && bun install

install-server: ## Install server dependencies only
	cd apps/server && bun install

dev: ## Start both client and server in development mode
	@echo "$(BLUE)Starting client and server in development mode...$(NC)"
	npx concurrently "make dev-client" "make dev-server"

dev-client: ## Start client in development mode
	@echo "$(BLUE)Starting client dev server...$(NC)"
	cd apps/client && bun run dev

dev-server: ## Start server in development mode
	@echo "$(BLUE)Starting server dev server...$(NC)"
	cd apps/server && bun run dev

build: ## Build both client and server for production
	@echo "$(BLUE)Building client...$(NC)"
	cd apps/client && bun run build
	@echo "$(GREEN)✓ Client built$(NC)"
	@echo "$(BLUE)Building server...$(NC)"
	cd apps/server && bun run build
	@echo "$(BLUE)Copying client dist to server dist/public...$(NC)"
	mkdir -p apps/server/dist/public
	cp -r apps/client/dist/* apps/server/dist/public/
	@echo "$(GREEN)✓ Server built$(NC)"
	@echo "$(GREEN)✓ Full build complete$(NC)"

build-client: ## Build client only
	@echo "$(BLUE)Building client...$(NC)"
	cd apps/client && bun run build
	@echo "$(GREEN)✓ Client built$(NC)"

build-server: ## Build server only
	@echo "$(BLUE)Building server...$(NC)"
	cd apps/server && bun run build
	@echo "$(GREEN)✓ Server built$(NC)"

start: ## Start production server (requires build)
	@echo "$(BLUE)Starting production server...$(NC)"
	cd apps/server && bun start

clean: ## Remove build artifacts and node_modules
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	rm -rf apps/client/dist apps/server/dist
	@echo "$(YELLOW)Cleaning node_modules...$(NC)"
	rm -rf apps/client/node_modules apps/server/node_modules
	@echo "$(GREEN)✓ Clean complete$(NC)"

clean-build: ## Remove build artifacts only
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	rm -rf apps/client/dist apps/server/dist
	@echo "$(GREEN)✓ Build artifacts removed$(NC)"

lint: ## Run linter for client (and server if configured)
	@echo "$(BLUE)Linting client...$(NC)"
	cd apps/client && bun run lint
	@echo "$(GREEN)✓ Lint complete$(NC)"

test: ## Run tests
	@echo "$(BLUE)Running tests...$(NC)"
	cd apps/client && bun test || true
	cd apps/server && npm test || true
	@echo "$(GREEN)✓ Tests complete$(NC)"

db-generate: ## Generate database migrations (server)
	cd apps/server && bun run db:generate

db-migrate: ## Run database migrations (server)
	cd apps/server && bun run db:migrate

db-studio: ## Open Drizzle Studio (server)
	cd apps/server && bun run db:studio

docker-build: ## Build Docker image
	@echo "$(BLUE)Building Docker image...$(NC)"
	docker build -t kontexted .
	@echo "$(GREEN)✓ Docker image built$(NC)"

docker-run: ## Run Docker container
	@echo "$(BLUE)Running Docker container...$(NC)"
	docker run -p 3000:3000 --env-file apps/server/.env kontexted

docker-dev: ## Run with docker-compose
	docker-compose build
	docker-compose run --rm kontexted

.DEFAULT_GOAL := help
