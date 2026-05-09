FROM python:3.11-slim
WORKDIR /app

COPY peer-and-industry-context/pyproject.toml ./pyproject.toml
RUN pip install --no-cache-dir -e .

COPY peer-benchmarker/ /app/peer-benchmarker/
COPY industry-risk-scorer/ /app/industry-risk-scorer/
COPY peer-and-industry-context/ /app/

ENV PORT=8080
CMD ["functions-framework", "--target=http", "--port=8080"]
