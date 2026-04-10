/**
 * DockerfileGenerator.ts — Phase 19 Step 19.5
 * Generate optimized Dockerfiles, docker-compose, .dockerignore
 */

import { ProjectStack, DevOpsGenerationResult } from './DevOpsTypes';

export class DockerfileGenerator {
  generate(stack: ProjectStack, appName: string = 'app'): DevOpsGenerationResult {
    const files: { name: string; content: string }[] = [];

    files.push({ name: 'Dockerfile', content: this.generateDockerfile(stack) });
    files.push({ name: '.dockerignore', content: this.generateDockerignore(stack) });

    if (stack.databases.length > 0) {
      files.push({ name: 'docker-compose.yml', content: this.generateCompose(stack, appName) });
    }

    return { type: 'dockerfile', files, recommendations: [] };
  }

  private generateDockerfile(stack: ProjectStack): string {
    switch (stack.runtime) {
      case 'node': return this.nodeDockerfile(stack);
      case 'python': return this.pythonDockerfile(stack);
      case 'go': return this.goDockerfile(stack);
      case 'rust': return this.rustDockerfile(stack);
      case 'java': return this.javaDockerfile(stack);
      default: return this.genericDockerfile(stack);
    }
  }

  private nodeDockerfile(stack: ProjectStack): string {
    const pm = stack.packageManager;
    const install = pm === 'pnpm' ? 'pnpm install --frozen-lockfile' : pm === 'yarn' ? 'yarn install --frozen-lockfile' : 'npm ci';
    const lockfile = pm === 'pnpm' ? 'pnpm-lock.yaml' : pm === 'yarn' ? 'yarn.lock' : 'package-lock.json';
    const port = stack.ports[0] || 3000;
    const buildCmd = stack.framework === 'next' ? 'npm run build' : 'npm run build';

    return `# Multi-stage build — INA Coding DevOps Agent
# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ${lockfile} ./
RUN ${install}

# Stage 2: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN ${buildCmd}

# Stage 3: Production
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/package.json ./
${stack.framework === 'next' ? 'COPY --from=builder --chown=appuser:appgroup /app/.next ./.next\nCOPY --from=builder --chown=appuser:appgroup /app/public ./public' : 'COPY --from=builder --chown=appuser:appgroup /app/dist ./dist'}
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

USER appuser
EXPOSE ${port}
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:${port}/health || exit 1
CMD ["node", "${stack.framework === 'next' ? 'node_modules/.bin/next start' : 'dist/index.js'}"]
`;
  }

  private pythonDockerfile(stack: ProjectStack): string {
    const port = stack.ports[0] || 8000;
    const installCmd = stack.packageManager === 'poetry' ? 'poetry install --no-dev' : 'pip install --no-cache-dir -r requirements.txt';
    const copyDeps = stack.packageManager === 'poetry' ? 'COPY pyproject.toml poetry.lock ./' : 'COPY requirements.txt ./';
    const runCmd = stack.framework === 'fastapi' ? `uvicorn main:app --host 0.0.0.0 --port ${port}` : stack.framework === 'django' ? `gunicorn config.wsgi:application --bind 0.0.0.0:${port}` : `python main.py`;

    return `FROM python:3.12-slim AS builder
WORKDIR /app
${copyDeps}
RUN ${stack.packageManager === 'poetry' ? 'pip install poetry && ' : ''}${installCmd}

FROM python:3.12-slim AS runner
WORKDIR /app
RUN useradd -r -u 1001 appuser
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --chown=appuser:appuser . .
USER appuser
EXPOSE ${port}
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${port}/health')" || exit 1
CMD ["${runCmd.split(' ')[0]}", ${runCmd.split(' ').slice(1).map(s => `"${s}"`).join(', ')}]
`;
  }

  private goDockerfile(stack: ProjectStack): string {
    const port = stack.ports[0] || 8080;
    return `FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server .

FROM alpine:3.19 AS runner
RUN apk --no-cache add ca-certificates && adduser -D -u 1001 appuser
COPY --from=builder /app/server /usr/local/bin/server
USER appuser
EXPOSE ${port}
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:${port}/health || exit 1
CMD ["server"]
`;
  }

  private rustDockerfile(stack: ProjectStack): string {
    const port = stack.ports[0] || 8080;
    return `FROM rust:1.77-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main(){}" > src/main.rs && cargo build --release && rm -rf src
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim AS runner
RUN useradd -r -u 1001 appuser && apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/app /usr/local/bin/app
USER appuser
EXPOSE ${port}
CMD ["app"]
`;
  }

  private javaDockerfile(stack: ProjectStack): string {
    const port = stack.ports[0] || 8080;
    const build = stack.packageManager === 'gradle' ? 'gradle build -x test' : 'mvn package -DskipTests';
    const jar = stack.packageManager === 'gradle' ? 'build/libs/*.jar' : 'target/*.jar';
    return `FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app
COPY . .
RUN ${build}

FROM eclipse-temurin:21-jre-alpine AS runner
RUN adduser -D -u 1001 appuser
COPY --from=builder /app/${jar} /app/app.jar
USER appuser
EXPOSE ${port}
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:${port}/actuator/health || exit 1
CMD ["java", "-jar", "/app/app.jar"]
`;
  }

  private genericDockerfile(stack: ProjectStack): string {
    return `FROM ubuntu:22.04\nWORKDIR /app\nCOPY . .\nEXPOSE ${stack.ports[0] || 3000}\nCMD ["./start.sh"]\n`;
  }

  private generateDockerignore(stack: ProjectStack): string {
    const lines = ['node_modules', '.git', '.gitignore', '.env', '.env.*', '!.env.example', 'dist', 'build', '.next', 'coverage', '__pycache__', '*.pyc', '.venv', 'venv', 'target', '.idea', '.vscode', '*.md', '!README.md', 'Dockerfile', 'docker-compose*.yml', '.dockerignore', '.github', '.gitlab-ci.yml', 'tests', '__tests__', '*.test.*', '*.spec.*'];
    return lines.join('\n') + '\n';
  }

  private generateCompose(stack: ProjectStack, appName: string): string {
    const port = stack.ports[0] || 3000;
    const services: string[] = [];

    services.push(`  ${appName}:\n    build: .\n    ports:\n      - "\${PORT:-${port}}:${port}"\n    env_file: .env\n    restart: unless-stopped\n    depends_on:${stack.databases.map(db => `\n      ${db}:\n        condition: service_healthy`).join('')}`);

    if (stack.databases.includes('postgres')) {
      services.push(`  postgres:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: \${DB_NAME:-app}\n      POSTGRES_USER: \${DB_USER:-postgres}\n      POSTGRES_PASSWORD: \${DB_PASSWORD:-postgres}\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n    ports:\n      - "5432:5432"\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U postgres"]\n      interval: 10s\n      timeout: 5s\n      retries: 5`);
    }
    if (stack.databases.includes('redis')) {
      services.push(`  redis:\n    image: redis:7-alpine\n    ports:\n      - "6379:6379"\n    healthcheck:\n      test: ["CMD", "redis-cli", "ping"]\n      interval: 10s\n      timeout: 5s\n      retries: 5`);
    }

    const volumes = stack.databases.includes('postgres') ? '\nvolumes:\n  pgdata:' : '';
    return `version: "3.8"\n\nservices:\n${services.join('\n\n')}\n${volumes}\n`;
  }
}
