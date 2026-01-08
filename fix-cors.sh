#!/bin/bash
#
# Quick Fix for CORS Issue - IConduct Server Manager
# Run this on your Ubuntu server
#

set -e

APP_DIR="/opt/iconduct-server-manager"

echo "=========================================="
echo "Fixing CORS Issue"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "./docker-compose.yml" ]; then
    echo "❌ Error: Application not found at $APP_DIR"
    echo "Please run this script from your application directory or update APP_DIR"
    exit 1
fi

cd ./

echo "📝 Step 1: Backing up current docker-compose.yml..."
cp docker-compose.yml docker-compose.yml.backup
echo "✅ Backup created: docker-compose.yml.backup"

echo ""
echo "📝 Step 2: Updating docker-compose.yml..."
# Update the frontend section
sed -i 's|ports:.*3333:80|ports:\n      - "80:80"|g' docker-compose.yml
sed -i 's|REACT_APP_API_URL=http://localhost:5000|REACT_APP_API_URL=/api|g' docker-compose.yml

# If the environment line exists under frontend, move it to build args
if grep -q "REACT_APP_API_URL" docker-compose.yml; then
    # Create a temporary file with the corrected structure
    cat docker-compose.yml | sed '/frontend:/,/networks:/{
        s|environment:|args:|
        s|- REACT_APP_API_URL=.*|- REACT_APP_API_URL=/api|
    }' > docker-compose.yml.tmp
    mv docker-compose.yml.tmp docker-compose.yml
fi

echo "✅ docker-compose.yml updated"

echo ""
echo "📝 Step 3: Backing up frontend Dockerfile..."
cp frontend/Dockerfile frontend/Dockerfile.backup
echo "✅ Backup created: frontend/Dockerfile.backup"

echo ""
echo "📝 Step 4: Updating frontend Dockerfile..."
# Add build args to Dockerfile if not present
if ! grep -q "ARG REACT_APP_API_URL" frontend/Dockerfile; then
    # Insert after FROM node line
    sed -i '/FROM node:18-alpine as build/a\
\
WORKDIR /app\
\
# Accept build argument\
ARG REACT_APP_API_URL=/api\
ENV REACT_APP_API_URL=$REACT_APP_API_URL' frontend/Dockerfile
    
    # Remove duplicate WORKDIR if added
    sed -i '0,/WORKDIR \/app/{/WORKDIR \/app/d;}' frontend/Dockerfile
fi

echo "✅ frontend/Dockerfile updated"

echo ""
echo "📝 Step 5: Updating api.js..."
# Backup and update api.js
cp frontend/src/services/api.js frontend/src/services/api.js.backup

# Update the API_BASE_URL line
sed -i "s|const API_BASE_URL = process.env.REACT_APP_API_URL.*|const API_BASE_URL = process.env.REACT_APP_API_URL \|\| '/api';|g" frontend/src/services/api.js

echo "✅ api.js updated"

echo ""
echo "📝 Step 6: Stopping current containers..."
docker compose down

echo ""
echo "📝 Step 7: Rebuilding and starting containers..."
docker compose up -d --build

echo ""
echo "📝 Step 8: Waiting for services to start..."
sleep 10

echo ""
echo "📝 Step 9: Checking status..."
docker compose ps

echo ""
echo "=========================================="
echo "✅ Fix Complete!"
echo "=========================================="
echo ""
echo "Your application should now be accessible at:"
echo "http://$(hostname -I | awk '{print $1}')"
echo ""
echo "Note: Changed from port 3333 to port 80"
echo ""
echo "If you still see issues:"
echo "1. Clear your browser cache (Ctrl+Shift+R)"
echo "2. Check logs: docker-compose logs -f"
echo "3. Verify: curl http://localhost/api/health"
echo ""
echo "Backups created:"
echo "- docker-compose.yml.backup"
echo "- frontend/Dockerfile.backup"
echo "- frontend/src/services/api.js.backup"
echo ""
