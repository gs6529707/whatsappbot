FROM node:20-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p /data/auth && chown -R node:node /data
ENV SESSION_DIR=/data/auth
ENV NODE_ENV=production

USER node

CMD ["npm", "start"]
