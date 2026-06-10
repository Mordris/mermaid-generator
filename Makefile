# Mermaid Studio — convenience commands.
#
#   make            show this help
#   make up         build + start the container (http://localhost:$(PORT))
#   make down       stop + remove the container
#   make restart    restart the running container
#   make rebuild    force a clean rebuild + start
#   make logs       follow the container logs
#   make ps         show container status
#   make dev        run a no-Docker static server (needs Node)
#   make clean      remove the container + image
#
# Override the port:  make up PORT=12345

PORT ?= 8473
export MERMAID_PORT = $(PORT)

.DEFAULT_GOAL := help

.PHONY: help up down restart rebuild logs ps dev clean

help: ## Show this help
	@echo "Mermaid Studio — make targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

up: ## Build and start (detached)
	docker compose up -d --build
	@echo "Mermaid Studio → http://localhost:$(PORT)"

down: ## Stop and remove the container
	docker compose down

restart: ## Restart the container
	docker compose restart

rebuild: ## Force a clean rebuild and start
	docker compose up -d --build --force-recreate
	@echo "Mermaid Studio → http://localhost:$(PORT)"

logs: ## Follow container logs
	docker compose logs -f

ps: ## Show container status
	docker compose ps

dev: ## Run a static dev server without Docker (needs Node.js)
	npx --yes http-server -p 4321 -c-1

clean: ## Remove the container and built image
	docker compose down --rmi local --remove-orphans
