FROM python:3.11-slim
WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

# Service code
COPY main.py ./

# Bring in the agents package — the agent modules' response_schema
# constants live in usecases/<uc>/agents/<role>.py and the prompts in
# usecases/<uc>/agents/prompts/<role>.md. The deploy script stages
# these files in.
COPY usecases /app/usecases

ENV PORT=8080
ENV REPO_ROOT=/app
CMD ["functions-framework", "--target=http", "--port=8080"]
