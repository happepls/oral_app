# Omni Service

The Omni Service is a microservice that integrates the Qwen3-Omni multimodal AI engine for real-time ASR (Automatic Speech Recognition), LLM (Large Language Model), and TTS (Text-to-Speech) processing.

## Features

- Real-time audio processing with Qwen3-Omni
- WebSocket interface for streaming audio and text data
- ASR, LLM, and TTS capabilities in a single service
- Scalable microservice architecture

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)

### Installation

1. Clone the repository
2. Navigate to the omni-service directory
3. Install dependencies:
   ```bash
   npm install
   ```

### Configuration

Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

### Running the Service

#### With Docker Compose (Recommended)

```bash
docker-compose up --build omni-service
```

#### Locally

```bash
npm start
```

## API Endpoints

### HTTP Endpoints

- `GET /health` - Health check endpoint

### WebSocket Endpoints

- `/stream` - WebSocket endpoint for real-time audio/text processing

#### WebSocket Message Types

1. **Text Input**
   ```json
   {
     "type": "text_input",
     "text": "Hello, how are you?",
     "lang": "en-US"
   }
   ```

2. **Session Control**
   ```json
   {
     "type": "start_session"
   }
   ```
   
   ```json
   {
     "type": "stop_session"
   }
   ```

## Architecture

The Omni Service follows the SROP (Scalable Real-time Oral Practice) architecture and communicates with other services through WebSockets.

## Development

### Installing Dependencies

```bash
npm install
```

### Running in Development Mode

```bash
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | HTTP server port | 8081 |
| QWEN3_OMNI_BASE_URL | Qwen3-Omni API base URL | http://localhost:8000 |
| QWEN3_OMNI_MODEL | Qwen3-Omni model name | qwen3-omni |

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## License

MIT