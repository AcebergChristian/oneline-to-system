# 由 DeepWisdom 平台自动生成,请勿手动修改。
# 单容器部署:前端构建产物由后端静态托管,对外只暴露一个端口。

FROM node:20-alpine AS frontend-build
ARG NPM_CONFIG_REGISTRY
WORKDIR /app/frontend
# LLM 生成的代码常带有轻微 lint/警告问题,不应阻断构建
ENV CI=false
ENV DISABLE_ESLINT_PLUGIN=true
ENV GENERATE_SOURCEMAP=false
COPY frontend/ ./
RUN if [ -n "$NPM_CONFIG_REGISTRY" ]; then \
      npm install --registry="$NPM_CONFIG_REGISTRY" --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi
RUN npm run build
RUN if [ -d dist ]; then mv dist /out; \
    elif [ -d build ]; then mv build /out; \
    else mkdir -p /out && echo "<h1>frontend build output not found</h1>" > /out/index.html; \
    fi

FROM python:3.11-slim
ARG PIP_INDEX_URL
ARG PIP_TRUSTED_HOST
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY backend/requirements.txt /tmp/requirements.txt
RUN set -e; \
    PIP_EXTRA=""; \
    if [ -n "$PIP_INDEX_URL" ]; then PIP_EXTRA="--index-url $PIP_INDEX_URL"; fi; \
    if [ -n "$PIP_TRUSTED_HOST" ]; then PIP_EXTRA="$PIP_EXTRA --trusted-host $PIP_TRUSTED_HOST"; fi; \
    pip install --no-cache-dir $PIP_EXTRA -r /tmp/requirements.txt; \
    pip install --no-cache-dir $PIP_EXTRA fastapi uvicorn
COPY backend/ ./backend/
COPY --from=frontend-build /out ./static
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend._dw_serve:app", "--host", "0.0.0.0", "--port", "8000"]
