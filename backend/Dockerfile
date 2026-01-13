FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm packages only (Node 18 Alpine already includes OpenSSL)
RUN npm install --production

# Copy application files
COPY . .

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]