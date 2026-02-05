# =============================================================================
# Stage 1: Builder - Compile the frontend
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the production bundle
RUN npm run build

# =============================================================================
# Stage 2: Runner - Serve with Nginx + HTTPS
# =============================================================================
FROM nginx:alpine AS runner

# Install openssl for self-signed certificate generation
RUN apk add --no-cache openssl

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Create SSL directory and generate self-signed certificate
RUN mkdir -p /etc/nginx/ssl && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/server.key \
    -out /etc/nginx/ssl/server.crt \
    -subj "/C=US/ST=State/L=City/O=Vortex/OU=Dev/CN=localhost"

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage (Vite outputs to 'dist/')
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose ports 80 (HTTP redirect) and 443 (HTTPS)
EXPOSE 80 443

# Health check on HTTPS
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider --no-check-certificate https://localhost:443/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
