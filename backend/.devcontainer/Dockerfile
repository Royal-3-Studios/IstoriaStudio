FROM mcr.microsoft.com/vscode/devcontainers/python:3.12

RUN pip install --upgrade pip \
 && pip install fastapi uvicorn boto3 minio pillow reportlab

WORKDIR /workspace

CMD ["sleep", "infinity"]
