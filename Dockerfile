FROM node:22-alpine

LABEL description="Super-Agent Platform – Multi-agent AI orchestrator"

WORKDIR /app

# Install production dependencies only
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy application source
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Data directory (override with a volume in production)
RUN mkdir -p /app/backend/data

EXPOSE 3001

ENV NODE_ENV=production \
    PORT=3001 \
    AI_PROVIDER=mock

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "backend/src/server.js"]
