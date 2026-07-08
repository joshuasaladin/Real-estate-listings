# Aruba Homes aggregator — portable container for Railway / Fly.io / Render.
# Node 22.5+ is required for the built-in node:sqlite module.
FROM node:22-slim

WORKDIR /app

# Install production deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

# SQLite lives on a mounted volume so listings survive restarts/redeploys.
ENV DB_PATH=/data/listings.db
ENV PORT=3000
VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "src/index.js"]
