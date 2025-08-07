FROM mcr.microsoft.com/vscode/devcontainers/python:3.10

# Install system tools
RUN apt update && apt install -y git

# Set working directory
WORKDIR /workspace

# Copy and install Python dependencies
COPY requirements.txt .

# First install CUDA-enabled torch packages
RUN pip install --upgrade pip \
 && pip install torch==2.2.0+cu118 torchvision==0.17.0+cu118 torchaudio==2.2.0+cu118 --index-url https://download.pytorch.org/whl/cu118 \
 && pip install -r requirements.txt

# Copy your app
COPY app ./app

CMD ["sleep", "infinity"]
