#!/bin/bash

# IConduct Server Manager - Quick Start Script
# This script helps set up and run the application

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}IConduct Server Manager Setup${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    echo "Please install Docker first. See SETUP_COMMANDS.md for instructions."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    echo "Please install Docker Compose first. See SETUP_COMMANDS.md for instructions."
    exit 1
fi

echo -e "${GREEN}✓ Docker and Docker Compose are installed${NC}"
echo ""

# Check if servers.json exists
if [ ! -f "backend/config/servers.json" ]; then
    echo -e "${RED}Error: backend/config/servers.json not found${NC}"
    echo "Please create the server configuration file."
    exit 1
fi

echo -e "${GREEN}✓ Server configuration found${NC}"
echo ""

# Create logs directory
mkdir -p backend/logs

# Ask user what they want to do
echo "What would you like to do?"
echo "1) Build and start the application"
echo "2) Stop the application"
echo "3) View logs"
echo "4) Rebuild from scratch"
echo "5) Check status"
echo "6) Run in development mode (without Docker)"
read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo -e "${YELLOW}Building and starting the application...${NC}"
        docker compose build
        docker compose up -d
        echo ""
        echo -e "${GREEN}✓ Application started successfully!${NC}"
        echo ""
        echo "Access the application at:"
        echo "  Frontend: http://localhost:3000"
        echo "  Backend:  http://localhost:5000/api/health"
        echo ""
        echo "To view logs, run: docker compose logs -f"
        ;;
    
    2)
        echo -e "${YELLOW}Stopping the application...${NC}"
        docker compose down
        echo -e "${GREEN}✓ Application stopped${NC}"
        ;;
    
    3)
        echo -e "${YELLOW}Showing logs (Ctrl+C to exit)...${NC}"
        docker compose logs -f
        ;;
    
    4)
        echo -e "${YELLOW}Rebuilding from scratch...${NC}"
        docker compose down -v
        docker compose build --no-cache
        docker compose up -d
        echo -e "${GREEN}✓ Application rebuilt and started${NC}"
        ;;
    
    5)
        echo -e "${YELLOW}Checking status...${NC}"
        docker compose ps
        echo ""
        echo "Testing backend health..."
        curl -s http://localhost:5000/api/health | jq . || echo "Backend not responding"
        ;;
    
    6)
        echo -e "${YELLOW}Starting in development mode...${NC}"
        echo ""
        echo "This will start both backend and frontend in separate terminals."
        echo "Make sure you have Node.js installed."
        echo ""
        
        # Start backend in background
        cd backend
        npm install
        npm run dev &
        BACKEND_PID=$!
        cd ..
        
        # Start frontend
        cd frontend
        npm install
        npm start &
        FRONTEND_PID=$!
        cd ..
        
        echo ""
        echo -e "${GREEN}✓ Development servers started${NC}"
        echo "Backend PID: $BACKEND_PID"
        echo "Frontend PID: $FRONTEND_PID"
        echo ""
        echo "To stop:"
        echo "  kill $BACKEND_PID $FRONTEND_PID"
        ;;
    
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"