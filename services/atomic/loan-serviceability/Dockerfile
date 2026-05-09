FROM python:3.11-slim
WORKDIR /app

# Copy this service's pyproject + the legacy services we consolidate.
# Build context must be services/atomic/ so all three directories are available.
COPY loan-serviceability/pyproject.toml ./pyproject.toml
RUN pip install --no-cache-dir -e .

# Copy in dependency-order: legacy modules first (they're imported at startup),
# then the new service that imports them.
COPY dscr-calculator/ /app/dscr-calculator/
COPY covenant-analyzer/ /app/covenant-analyzer/
COPY loan-serviceability/ /app/

ENV PORT=8080
ENV ATOMIC_ROOT=/app
CMD ["functions-framework", "--target=http", "--port=8080"]
