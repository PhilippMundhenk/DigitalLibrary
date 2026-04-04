FROM node:20-alpine AS base

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy application files
COPY server.js ./
COPY lib/ ./lib/
COPY public/ ./public/

# Create non-root user and data directory
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    mkdir -p /app/data && \
    chown -R appuser:appgroup /app/data

USER appuser

# Data volume for persistent storage
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/settings || exit 1

CMD ["node", "server.js"]
