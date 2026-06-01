FROM node:22-bookworm-slim

# Set working directory
WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies using clean install for production
RUN npm ci

# Copy application source
COPY . .

# Build the TypeScript code
RUN npm run build

# Expose port 3010
EXPOSE 3010

# Command to run the application directly
CMD ["node", "dist/app.js"]
