FROM node:20-alpine

WORKDIR /app

# Copy all files
COPY . .

# Create data directory (will be overridden by volume mount)
RUN mkdir -p /data

EXPOSE 8080

CMD ["node", "server.js"]
