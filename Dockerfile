FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4173
ENV DATA_DIR=/data

COPY package.json ./
COPY index.html display.html flap.html gif.html ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src

EXPOSE 4173

CMD ["npm", "start"]
