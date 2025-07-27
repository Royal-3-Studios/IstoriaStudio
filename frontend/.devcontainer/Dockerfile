FROM node:22-bullseye

# Native build deps for sharp and other packages
RUN apt-get update && apt-get install -y \
  build-essential \
  libcairo2-dev \
  libjpeg-dev \
  libpango1.0-dev \
  libgif-dev \
  librsvg2-dev \
  libvips-dev \
  python3 \
  && rm -rf /var/lib/apt/lists/*

# Working directory at root of Next.js app (not src)
WORKDIR /app

ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

CMD ["npm", "run", "dev"]
