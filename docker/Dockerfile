FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake libgl1 libglib2.0-0 libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY . .
RUN useradd -m appuser && mkdir -p /srv/data /srv/models && chown -R appuser /srv
USER appuser

EXPOSE 8000 8501
CMD ["uvicorn", "app.api.main:get_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
