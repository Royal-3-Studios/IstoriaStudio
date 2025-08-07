# Base image with CUDA
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

# System deps
RUN apt update && apt install -y python3-pip git

# Working dir
WORKDIR /app

# Install deps early for cache reuse
COPY requirements.txt ./
RUN pip3 install --upgrade pip && pip3 install -r requirements.txt

# Copy source code AFTER
COPY app/ ./app

# Run API
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
