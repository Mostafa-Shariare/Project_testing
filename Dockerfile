FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements/backend.txt requirements/
RUN pip install --no-cache-dir -r requirements/backend.txt
COPY backend/ ./backend/
COPY ml/ ./ml/
COPY --from=frontend /app/frontend/dist ./frontend/dist
ENV ENVIRONMENT=production
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
