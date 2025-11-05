FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy the rest of the sources and build
COPY . .
RUN npm run build

## Runtime image
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy built app from builder
COPY --from=builder /app /app

# Install production deps (if package-lock.json is absent, npm will use package.json)
RUN npm ci --omit=dev || true

EXPOSE 3000

# Start the Next.js app
CMD ["npm", "start"]
