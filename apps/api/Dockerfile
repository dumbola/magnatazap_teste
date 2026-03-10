FROM node:20-alpine

# Necessary for baileys and bcrypt
RUN apk add --no-cache git python3 make g++ openssl

WORKDIR /app

# Copy root config
COPY package*.json ./
COPY tsconfig.json ./

# Copy packages
COPY packages/wa-engine ./packages/wa-engine

# Copy API
COPY apps/api ./apps/api

# Install dependencies (from root to handle workspaces)
RUN npm install

# Build shared package first
WORKDIR /app/packages/wa-engine
RUN npm run build

# Build API
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

EXPOSE 4000

CMD ["npm", "run", "start:prod"]
