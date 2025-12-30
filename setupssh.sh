#!/bin/bash

# SSH Setup Helper for IConduct Server Manager

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}SSH Setup Helper${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Check if .ssh directory exists
if [ ! -d ~/.ssh ]; then
    echo "Creating ~/.ssh directory..."
    mkdir -p ~/.ssh
    chmod 700 ~/.ssh
fi

echo "Current SSH key files:"
ls -la ~/.ssh/*.pem ~/.ssh/id_* 2>/dev/null || echo "  No SSH keys found in ~/.ssh/"
echo ""

echo -e "${YELLOW}Do you want to:${NC}"
echo "1) Use an existing private key file"
echo "2) Copy private key content (paste the key)"
echo "3) Generate a new SSH key pair"
echo "4) Test SSH connection manually"
echo "5) Skip SSH key setup (use password)"
echo ""
read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo ""
        read -p "Enter the full path to your private key file: " KEY_PATH
        
        if [ ! -f "$KEY_PATH" ]; then
            echo -e "${RED}✗ File not found: $KEY_PATH${NC}"
            exit 1
        fi
        
        # Copy to .ssh directory with proper name
        KEY_NAME=$(basename "$KEY_PATH")
        cp "$KEY_PATH" ~/.ssh/"$KEY_NAME"
        chmod 600 ~/.ssh/"$KEY_NAME"
        
        echo -e "${GREEN}✓ Key copied to ~/.ssh/$KEY_NAME${NC}"
        FINAL_KEY_PATH="$HOME/.ssh/$KEY_NAME"
        ;;
        
    2)
        echo ""
        echo "Enter a name for this key (e.g., iconduct-key):"
        read KEY_NAME
        
        KEY_FILE="$HOME/.ssh/${KEY_NAME}.pem"
        
        echo ""
        echo "Paste your private key (press Ctrl+D when done):"
        cat > "$KEY_FILE"
        
        chmod 600 "$KEY_FILE"
        echo ""
        echo -e "${GREEN}✓ Key saved to $KEY_FILE${NC}"
        FINAL_KEY_PATH="$KEY_FILE"
        ;;
        
    3)
        echo ""
        read -p "Enter email or identifier for the key: " EMAIL
        ssh-keygen -t rsa -b 4096 -C "$EMAIL" -f ~/.ssh/iconduct_key -N ""
        
        echo ""
        echo -e "${GREEN}✓ Key pair generated!${NC}"
        echo ""
        echo "Public key (copy this to your Windows server):"
        echo "=============================================="
        cat ~/.ssh/iconduct_key.pub
        echo "=============================================="
        echo ""
        echo "On your Windows server, add this key to:"
        echo "  C:\\ProgramData\\ssh\\administrators_authorized_keys"
        echo ""
        FINAL_KEY_PATH="$HOME/.ssh/iconduct_key"
        
        read -p "Press Enter when you've added the key to Windows..."
        ;;
        
    4)
        echo ""
        echo "Manual SSH connection test:"
        echo ""
        
        # Get server info from config
        if [ -f backend/config/servers.json ]; then
            SERVER_INFO=$(python3 << 'PYTHON'
import json
with open('backend/config/servers.json', 'r') as f:
    data = json.load(f)
    server = data['servers'][0]
    print(f"{server['username']}@{server['host']}")
PYTHON
)
            
            echo "Testing connection to: $SERVER_INFO"
            echo ""
            read -p "Path to private key (or press Enter to use password): " TEST_KEY
            
            if [ -n "$TEST_KEY" ]; then
                ssh -i "$TEST_KEY" -o StrictHostKeyChecking=no "$SERVER_INFO"
            else
                ssh -o StrictHostKeyChecking=no "$SERVER_INFO"
            fi
        fi
        exit 0
        ;;
        
    5)
        echo ""
        echo "Skipping SSH key setup. Using password authentication."
        echo "Your current configuration will use passwords."
        exit 0
        ;;
        
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

# Test the SSH connection
echo ""
echo "Testing SSH connection..."
echo ""

# Get server details
if [ -f backend/config/servers.json ]; then
    SERVER_HOST=$(python3 -c "import json; data=json.load(open('backend/config/servers.json')); print(data['servers'][0]['host'])")
    SERVER_USER=$(python3 -c "import json; data=json.load(open('backend/config/servers.json')); print(data['servers'][0]['username'])")
    
    echo "Connecting to $SERVER_USER@$SERVER_HOST..."
    
    if ssh -i "$FINAL_KEY_PATH" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$SERVER_USER@$SERVER_HOST" "echo 'Connection successful!'" 2>/dev/null; then
        echo ""
        echo -e "${GREEN}✓ SSH connection successful!${NC}"
        echo ""
        
        # Update servers.json to use the key
        echo "Updating backend/config/servers.json to use SSH key..."
        
        python3 << PYTHON_SCRIPT
import json

with open('backend/config/servers.json', 'r') as f:
    data = json.load(f)

data['servers'][0]['privateKey'] = "$FINAL_KEY_PATH"
data['servers'][0]['password'] = None

with open('backend/config/servers.json', 'w') as f:
    json.dump(data, f, indent=2)

print("✓ Configuration updated")
PYTHON_SCRIPT
        
        echo ""
        echo -e "${GREEN}================================${NC}"
        echo -e "${GREEN}Setup Complete!${NC}"
        echo -e "${GREEN}================================${NC}"
        echo ""
        echo "Your configuration has been updated to use:"
        echo "  Private Key: $FINAL_KEY_PATH"
        echo ""
        echo "Next steps:"
        echo "  1. Run: ./check.sh"
        echo "  2. Run: ./start.sh"
        
    else
        echo ""
        echo -e "${RED}✗ SSH connection failed${NC}"
        echo ""
        echo "Troubleshooting steps:"
        echo "1. Verify OpenSSH Server is running on Windows:"
        echo "   Get-Service sshd"
        echo ""
        echo "2. Check Windows firewall allows port 22"
        echo ""
        echo "3. For SSH key authentication, add your public key to Windows:"
        echo "   C:\\ProgramData\\ssh\\administrators_authorized_keys"
        echo ""
        echo "4. Verify key permissions on Windows:"
        echo "   icacls C:\\ProgramData\\ssh\\administrators_authorized_keys"
        echo ""
        echo "For now, you can proceed with password authentication."
        echo "The application will work with passwords in servers.json"
    fi
else
    echo -e "${RED}✗ backend/config/servers.json not found${NC}"
fi
