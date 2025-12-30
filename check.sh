#!/bin/bash

# IConduct Server Manager - Pre-flight Checklist (No jq required)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Pre-flight Checklist${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

ERRORS=0
WARNINGS=0

# Check 1: Docker installation
echo -n "Checking Docker installation... "
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo -e "${GREEN}✓${NC} $DOCKER_VERSION"
else
    echo -e "${RED}✗${NC} Docker not found"
    ((ERRORS++))
fi

# Check 2: Docker Compose installation
echo -n "Checking Docker Compose installation... "
if command -v docker compose &> /dev/null; then
    COMPOSE_VERSION=$(docker compose version)
    echo -e "${GREEN}✓${NC} $COMPOSE_VERSION"
else
    echo -e "${RED}✗${NC} Docker Compose not found"
    ((ERRORS++))
fi

# Check 3: Docker service running
echo -n "Checking Docker service status... "
if systemctl is-active --quiet docker; then
    echo -e "${GREEN}✓${NC} Docker service is running"
else
    echo -e "${RED}✗${NC} Docker service is not running"
    ((ERRORS++))
fi

# Check 4: User in docker group
echo -n "Checking Docker group membership... "
if groups | grep -q docker; then
    echo -e "${GREEN}✓${NC} User is in docker group"
else
    echo -e "${YELLOW}⚠${NC} User is not in docker group (you may need sudo)"
    ((WARNINGS++))
fi

# Check 5: Project structure
echo ""
echo "Checking project structure..."

FILES=(
    "docker-compose.yml"
    "backend/package.json"
    "backend/Dockerfile"
    "backend/src/server.js"
    "backend/config/servers.json"
    "frontend/package.json"
    "frontend/Dockerfile"
    "frontend/src/App.js"
)

for file in "${FILES[@]}"; do
    echo -n "  Checking $file... "
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC} Missing"
        ((ERRORS++))
    fi
done

# Check 6: Server configuration (using Python instead of jq)
echo ""
echo -n "Checking server configuration... "
if [ -f "backend/config/servers.json" ]; then
    # Use Python to validate JSON
    if command -v python3 &> /dev/null; then
        VALIDATION=$(python3 << 'PYTHON'
import json
import sys
try:
    with open('backend/config/servers.json', 'r') as f:
        data = json.load(f)
    print(f"valid|{len(data.get('servers', []))}")
except:
    print("invalid")
PYTHON
)
        
        if [[ $VALIDATION == valid* ]]; then
            SERVER_COUNT=$(echo $VALIDATION | cut -d'|' -f2)
            echo -e "${GREEN}✓${NC} Valid JSON"
            echo "  Found $SERVER_COUNT server(s) configured"
            
            # Check for default passwords using Python
            HAS_DEFAULT=$(python3 << 'PYTHON'
import json
with open('backend/config/servers.json', 'r') as f:
    data = json.load(f)
for server in data.get('servers', []):
    if server.get('password') == 'your-password-here':
        print('yes')
        break
PYTHON
)
            if [ "$HAS_DEFAULT" = "yes" ]; then
                echo -e "  ${YELLOW}⚠${NC} Warning: Default passwords detected - please update"
                ((WARNINGS++))
            fi
        else
            echo -e "${RED}✗${NC} Invalid JSON format"
            ((ERRORS++))
        fi
    else
        echo -e "${YELLOW}⚠${NC} Cannot validate (Python not found)"
        echo "  Install Python3 or manually verify JSON syntax"
        ((WARNINGS++))
    fi
else
    echo -e "${RED}✗${NC} Configuration file not found"
    ((ERRORS++))
fi

# Check 7: Port availability
echo ""
echo "Checking port availability..."
PORTS=(3000 5000)

for port in "${PORTS[@]}"; do
    echo -n "  Checking port $port... "
    if ss -tuln 2>/dev/null | grep -q ":$port " || netstat -tuln 2>/dev/null | grep -q ":$port "; then
        echo -e "${YELLOW}⚠${NC} Port already in use"
        ((WARNINGS++))
    else
        echo -e "${GREEN}✓${NC} Available"
    fi
done

# Check 8: Python availability (helpful for validation)
echo ""
echo -n "Checking Python 3... "
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✓${NC} $PYTHON_VERSION"
else
    echo -e "${YELLOW}⚠${NC} Not found (recommended for JSON validation)"
    ((WARNINGS++))
fi

# Check 9: SSH connectivity (optional test)
echo ""
echo "Testing SSH connectivity to servers (optional)..."
if [ -f "backend/config/servers.json" ] && command -v python3 &> /dev/null; then
    # Extract first server details using Python
    SERVER_INFO=$(python3 << 'PYTHON'
import json
try:
    with open('backend/config/servers.json', 'r') as f:
        data = json.load(f)
    if data.get('servers'):
        server = data['servers'][0]
        print(f"{server.get('username')}@{server.get('host')}")
except:
    pass
PYTHON
)
    
    if [ -n "$SERVER_INFO" ] && [ "$SERVER_INFO" != "@" ]; then
        echo -n "  Testing connection to $SERVER_INFO... "
        if timeout 5 ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes "$SERVER_INFO" "echo test" &>/dev/null; then
            echo -e "${GREEN}✓${NC} Connection successful"
        else
            echo -e "${YELLOW}⚠${NC} Cannot connect (verify SSH setup on Windows servers)"
            ((WARNINGS++))
        fi
    fi
fi

# Summary
echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Summary${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! You're ready to go.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review backend/config/servers.json"
    echo "  2. Run: ./start.sh"
    echo "  3. Access: http://localhost:3000"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    echo "You can proceed, but review the warnings above."
else
    echo -e "${RED}✗ $ERRORS error(s) and $WARNINGS warning(s) found${NC}"
    echo "Please fix the errors before proceeding."
    exit 1
fi

echo ""