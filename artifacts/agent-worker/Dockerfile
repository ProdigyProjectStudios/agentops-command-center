FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY *.py alembic.ini ./
COPY alembic/ ./alembic/

ENV PATH="/app/.venv/bin:$PATH"
ENV WORKER_PORT=8000

EXPOSE 8000

CMD ["python", "app.py"]
