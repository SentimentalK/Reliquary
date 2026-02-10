# =============================================================================
# Stage 1: Builder - Compile the frontend
# We use --platform=$BUILDPLATFORM to always run the build on the native builder
# architecture (usually amd64). This prevents slow/unstable QEMU emulation
# when building for arm64, since the output (HTML/JS/CSS) is platform-agnostic.
# =============================================================================
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

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

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage (Vite outputs to 'dist/')
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 3000 (Internal HTTP)
EXPOSE 3000

# Health check on HTTP port 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
