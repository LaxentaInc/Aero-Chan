#!/bin/bash

# Handle Ctrl+C and kill background processes
# trap 'kill $(jobs -p); exit' INT

# Clean up broken npm install from Panel entrypoint
rm -rf node_modules package-lock.json .npm .cache pnpm-local

# Create a small script to grab dependencies from package.json ONE BY ONE
node -e "
const deps = require('./package.json').dependencies || {};
const packages = Object.entries(deps).map(([name, ver]) => name + '@' + ver);
packages.forEach(pkg => console.log(pkg));
" > single_deps.txt

echo "Starting ultra-slow single-package installation to prevent OOM..."

while read -r pkg; do
  if [ -n "$pkg" ]; then
    echo "====================================="
    echo "Installing: $pkg"
    echo "====================================="
    
    # 1. Install ONE package at a time, no audit, no lockfile analysis, quiet mode
    npm install "$pkg" --no-save --no-audit --no-fund --loglevel=error --legacy-peer-deps
    
    # 2. Immediately clear the cache to free up RAM before the next package
    npm cache clean --force
    
    # 3. Give the panel 1 second to breathe and let garbage collection catch up
    sleep 1
  fi
done < single_deps.txt

# Clean up temporary list
rm single_deps.txt
# Start both processes
node index.js &
# sleep 500
# Wait for background processes
wait
