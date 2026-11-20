FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY data ./data

EXPOSE 3000

# node directo (no "npm start") para que el proceso reciba el SIGTERM de ECS y apague prolijo.
CMD ["node", "src/app.js"]