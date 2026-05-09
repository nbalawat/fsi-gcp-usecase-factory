FROM python:3.11-slim

WORKDIR /app

# Install system deps for pdf-related libraries (in case LiteParse needs them)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpoppler-cpp-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY main.py schemas.py requirements_loader.py audit.py ./
COPY vendors ./vendors
# document_requirements.json + extractions/*.json are staged into _schemas/
# at deploy-time by scripts/deploy_service.sh (cross-directory COPY isn't
# allowed in standard Docker context — the deploy stages files in).
COPY _schemas ./_schemas

# Cloud Run convention
ENV PORT=8080
EXPOSE 8080

# Run via functions-framework so it can be invoked as either Cloud Function or Cloud Run
CMD ["functions-framework", "--target=http", "--port=8080", "--source=main.py"]
