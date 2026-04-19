# Use Node 24 on Alpine (super lightweight)
FROM node:24-alpine

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /usr/src/app

# Copy only files needed for installing
COPY pnpm-lock.yaml package.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of your source code
COPY . .

# Build your TypeScript code
RUN pnpm run build

# Start the bot
CMD ["node", "dist/index.js"]