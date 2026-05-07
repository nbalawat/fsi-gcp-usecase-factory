FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy source
COPY . .

# Cloud Run sets PORT
ENV PORT=8080
EXPOSE 8080

# OTel auto-instrumentation runs the app
CMD ["opentelemetry-instrument", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
