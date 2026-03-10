FROM node:20-alpine

RUN apk add --no-cache git python3 make g++ openssl

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

COPY packages/wa-engine ./packages/wa-engine
COPY apps/web ./apps/web

RUN npm install

# CRITICAL: Accept API URL as a build argument
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

WORKDIR /app/apps/web
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
