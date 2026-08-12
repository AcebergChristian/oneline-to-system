FROM node:18-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install --registry=https://registry.npmmirror.com

COPY . ./
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3005

CMD ["nginx", "-g", "daemon off;"]
