FROM node:20-alpine
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
# Use npm ci when package-lock.json present, otherwise npm install
RUN if [ -f package-lock.json ]; then npm ci --production --no-audit --no-fund --silent; else npm install --production --no-audit --no-fund --silent; fi
COPY . .
RUN mkdir -p /usr/src/app/data/books
VOLUME ["/usr/src/app/data"]
EXPOSE 3000
CMD ["node","server.js"]
