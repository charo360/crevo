# Stage 1: Build Vite + React frontend
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production Node.js + Express API + Native FFmpeg + Built Frontend
FROM node:20-alpine

WORKDIR /usr/src/app

# Install native FFmpeg (handles multi-GB video clipping cleanly on ARM64 & AMD64)
RUN apk add --no-cache ffmpeg

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY --from=builder /usr/src/app/dist ./dist

ENV NODE_ENV=production
ENV API_PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

CMD ["node", "server/index.js"]
