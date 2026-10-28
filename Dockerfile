FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY engine ./engine
COPY server ./server
COPY client ./client
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
