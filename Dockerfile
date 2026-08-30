# ===========================================
# STAGE 1: Build
# ===========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Tăng timeout và retry cho npm để tránh ECONNRESET
RUN npm config set fetch-timeout 300000 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set fetch-retries 5

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

# ===========================================
# STAGE 2: Production Runtime
# ===========================================
FROM node:20-alpine AS runner

RUN apk add --no-cache tzdata
ENV TZ=Asia/Ho_Chi_Minh

WORKDIR /app

# Tăng timeout và retry cho npm
RUN npm config set fetch-timeout 300000 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set fetch-retries 5

# Copy only production deps
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npx prisma generate

# Copy built files
COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/src/server.js"]
