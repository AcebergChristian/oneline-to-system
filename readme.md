# DeepWisdom — AI Agent 项目生成控制台

> 让 Agent 根据一句需求，在 `project/` 下自动生成真实可启动的全栈项目。

## 项目简介

DeepWisdom 是一个 AI Agent 控制台系统。用户在主界面输入产品需求，Agent 会自动在 `project/projectN/` 目录下创建完整的前后端项目（React + FastAPI），并支持 Docker 一键启动与实时预览。

整个系统由 **主控前端**、**主控后端**、**AI Agent** 三部分组成，数据全部落本地 JSON/JSONL，无需数据库。

<img width="2756" height="1572" alt="image" src="https://github.com/user-attachments/assets/d7d3cab9-43ac-4664-a66e-8ded691045ab" />


<img width="2758" height="1572" alt="image" src="https://github.com/user-attachments/assets/db8fa66e-d1ee-4def-9214-928595f78c8e" />


<img width="2756" height="1570" alt="image" src="https://github.com/user-attachments/assets/6aa502b8-5516-4022-8572-0989a8d96b42" />


<img width="2758" height="1572" alt="image" src="https://github.com/user-attachments/assets/42bc5e65-2225-4382-a08d-0398ebae540b" />


<img width="2762" height="1574" alt="image" src="https://github.com/user-attachments/assets/29ca61d9-8504-42d1-b14d-7f43b8baaf32" />

## 核心能力

- 🧠 **AI Agent 驱动** — 基于 OpenAI 兼容接口，Agent 自动规划执行计划并调用受限工具（`list`、`read`、`mkdir`、`write`）生成项目文件
- 📦 **按会话生成项目** — 每个会话对应一个独立项目目录 `project/projectN/`，含 frontend、backend、Dockerfile、docker-compose.yml
- 🔄 **流式步骤追踪** — Agent 的 thinking、step、tool 调用和结果通过 SSE 实时推送到前端工作台
- 🖥️ **工作台三栏布局** — 左侧会话列表、中间 Agent 流程与对话、右侧项目预览与启动状态
- 🐳 **Docker 一键启动** — 支持 compose 启动、容器状态探测、前端 URL 检查和后端健康检查
- 🔧 **失败分析与修复** — 启动失败时展示具体错误日志，并提供一键回填修复提示词
- 📋 **本地持久化** — 会话、步骤、日志、项目元信息全部以 JSON/JSONL 格式存储在 `backend/data/`

## 技术栈

| 层级 | 技术 |
|------|------|
| 主控前端 | React 18 + Vite + Tailwind CSS + lucide-react |
| 主控后端 | Python FastAPI + Uvicorn + Pydantic |
| AI 接口 | OpenAI SDK（兼容任意 OpenAI API 格式的模型） |
| 生成项目 | React 前端 + FastAPI 后端 + Docker |
| 数据存储 | 本地 JSON / JSONL 文件 |

## 项目结构

```
oneline-to-system/
├── frontend/              # 主控前端（React + Vite）
│   └── src/
│       ├── App.jsx            # 主应用（路由、Landing、Workspace、Docs、Pricing）
│       ├── components/        # Sidebar、TaskPanel、PreviewPanel
│       └── lib/api.js         # 后端 API 封装
├── backend/               # 主控后端（FastAPI）
│   ├── main.py                # API 入口与会话/项目/流式接口
│   ├── requirements.txt
│   ├── utils/
│   │   ├── agent.py           # AI Agent 核心（规划、工具调用、流式执行）
│   │   ├── config.py          # 配置管理（.env 读取）
│   │   ├── project_tools.py   # 受限工具实现（list/read/mkdir/write）
│   │   ├── project_runner.py  # Docker 项目启动与健康检查
│   │   ├── schemas.py         # Pydantic 数据模型
│   │   ├── storage.py         # JSON/JSONL 读写工具
│   │   └── logger.py          # 日志记录
│   └── data/                  # 运行时数据（会话、日志、项目元信息）
├── project/               # Agent 生成的项目目录
│   ├── project1/
│   ├── project2/
│   └── ...
├── .env                   # 环境变量配置
└── .env.example           # 环境变量示例
```

## 快速开始

### 1. 克隆项目

```bash
git clone <repo-url>
cd oneline-to-system
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的模型 API 配置：

```env
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1    # 或其他兼容接口
OPENAI_MODEL=gpt-4.1-mini                     # 或其他模型
AI_MEMORY_WINDOW=8
AI_MAX_TOOL_ROUNDS=24
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
FRONTEND_PORT=5173
```

### 3. 启动主控后端

```bash
cd backend
pip install -r requirements.txt
python main.py
```

后端默认运行在 `http://localhost:8000`。

### 4. 启动主控前端

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 `http://localhost:5173`。

### 5. 使用

1. 打开浏览器访问 `http://localhost:5173`
2. 在首页输入产品需求，例如："做一个支持登录、仪表盘和工单管理的系统"
3. 点击发送，自动进入工作台
4. 等待 Agent 流式生成项目文件
5. 点击「启动项目」，通过 Docker Compose 启动生成的项目
6. 在右侧预览面板查看生成结果

## 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | 模型 API 密钥 | — |
| `OPENAI_BASE_URL` | 模型 API 地址 | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | 使用的模型名称 | `gpt-4.1-mini` |
| `AI_MEMORY_WINDOW` | Agent 记忆窗口（最近 N 条消息） | `8` |
| `AI_MAX_TOOL_ROUNDS` | 工具调用最大轮次 | `24` |
| `BACKEND_HOST` | 主控后端监听地址 | `0.0.0.0` |
| `BACKEND_PORT` | 主控后端端口 | `8000` |
| `FRONTEND_PORT` | 主控前端端口 | `5173` |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/sessions` | 获取所有会话列表 |
| GET | `/api/sessions/{id}` | 获取单个会话详情 |
| POST | `/api/sessions` | 创建新会话 |
| POST | `/api/sessions/{id}/messages` | 向会话发送消息 |
| GET | `/api/sessions/{id}/stream` | SSE 流式获取 Agent 执行过程 |
| POST | `/api/sessions/{id}/start` | 启动会话对应的生成项目 |
| POST | `/api/sessions/{id}/tools` | 手动执行工具操作 |
| GET | `/api/projects` | 获取所有项目元信息 |
| GET | `/api/config` | 获取当前配置 |

## 生成项目端口规划

每个生成的项目使用独立端口，避免与主控冲突：

| 项目 | 前端预览端口 | 后端 API 端口 |
|------|-------------|--------------|
| project1 | 3001 | 8001 |
| project2 | 3002 | 8002 |
| projectN | 300N | 800N |

## 安全限制

- Agent 工具调用被限制在当前项目目录 `project/projectN/` 内
- 禁止读写 `.env` 等敏感文件
- 禁止路径逃逸（不允许操作项目目录之外的文件）

## License

MIT
