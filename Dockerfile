FROM node:20-alpine

# Create app dir
WORKDIR /usr/src/app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy app
COPY . .

# Create data directories
RUN mkdir -p /usr/src/app/data/books
VOLUME ["/usr/src/app/data"]

EXPOSE 3000

CMD ["node", "server.js"]