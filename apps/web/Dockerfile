FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

FROM base AS dev
CMD ["npm", "run", "dev"]

FROM base AS production
RUN npm run build
RUN npm install -g serve
CMD ["serve", "-s", "dist", "-l", "5173"]
