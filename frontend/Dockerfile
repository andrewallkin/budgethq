# Shared install layer for production build and Vite dev.
FROM node:18-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Build stage
FROM deps AS build

# Respect frontend/.dockerignore so host node_modules does not overwrite the install above.
COPY . .
RUN npm run build

# Dev stage — Vite HMR (docker-compose.dev.yml uses target: dev)
FROM deps AS dev

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config to handle client-side routing and API proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
