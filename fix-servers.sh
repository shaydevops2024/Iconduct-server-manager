#!/bin/bash

# Fix servers.json issues

echo "Diagnosing servers.json issues..."
echo ""

CONFIG_FILE="backend/config/servers.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: $CONFIG_FILE not found!"
    exit 1
fi

echo "1. Checking for hidden characters..."
file "$CONFIG_FILE"

echo ""
echo "2. Checking file encoding..."
file -i "$CONFIG_FILE"

echo ""
echo "3. Checking line endings..."
dos2unix -ic "$CONFIG_FILE" 2>/dev/null && echo "File has Windows line endings (CRLF)" || echo "File has Unix line endings (LF)"

echo ""
echo "4. Attempting to parse JSON..."
if jq empty "$CONFIG_FILE" 2>&1; then
    echo "✓ JSON is valid!"
else
    echo "✗ JSON validation failed"
    echo ""
    echo "Showing exact error:"
    jq . "$CONFIG_FILE" 2>&1
fi

echo ""
echo "5. Would you like to fix common issues? (y/n)"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo "Creating backup..."
    cp "$CONFIG_FILE" "${CONFIG_FILE}.backup"
    
    echo "Fixing line endings..."
    dos2unix "$CONFIG_FILE" 2>/dev/null || sed -i 's/\r$//' "$CONFIG_FILE"
    
    echo "Removing BOM if present..."
    sed -i '1s/^\xEF\xBB\xBF//' "$CONFIG_FILE"
    
    echo "Removing trailing whitespace..."
    sed -i 's/[[:space:]]*$//' "$CONFIG_FILE"
    
    echo ""
    echo "Testing fixed file..."
    if jq empty "$CONFIG_FILE" 2>/dev/null; then
        echo "✓ JSON is now valid!"
        echo "Backup saved as: ${CONFIG_FILE}.backup"
    else
        echo "✗ Still invalid. Restoring backup..."
        mv "${CONFIG_FILE}.backup" "$CONFIG_FILE"
        echo ""
        echo "Please use the clean template file I provided."
    fi
fi
