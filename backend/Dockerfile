# Use Node.js as the base
FROM node:20-alpine

WORKDIR /backend

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your code
COPY . .

# Start the application
CMD ["npm", "start"]