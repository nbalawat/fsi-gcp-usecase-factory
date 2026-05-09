FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir -e .
COPY . .
ENV PORT=8080
CMD ["functions-framework", "--target=http", "--port=8080"]
