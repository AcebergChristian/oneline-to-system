FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --registry=https://registry.npmmirror.com
COPY . ./
ENV PORT=3005
EXPOSE 3005
CMD ["npm", "start"]