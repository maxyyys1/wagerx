FROM node:20-slim

WORKDIR /app

COPY package.json server.js reset-password.js ./
COPY index.html styles.css games.css core.js games.js ./
COPY assets ./assets

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173
ENV BASE_PATH=/
ENV DATA_FILE=/data/data.json

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 4173

CMD ["node", "server.js"]
