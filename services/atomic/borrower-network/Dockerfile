FROM python:3.11-slim
WORKDIR /app

COPY borrower-network/pyproject.toml ./pyproject.toml
RUN pip install --no-cache-dir -e .

COPY exposure-aggregator/ /app/exposure-aggregator/
COPY insider-screening/ /app/insider-screening/
COPY borrower-network/ /app/

ENV PORT=8080
CMD ["functions-framework", "--target=http", "--port=8080"]
