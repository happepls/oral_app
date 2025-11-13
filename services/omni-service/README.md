# Omni Service

Microservice integrating Qwen3-Omni for real-time ASR, LLM, and TTS processing.

## Features
- HTTP-based API for text and audio processing
- Speech-to-text (ASR) processing
- Language model (LLM) inference
- Text-to-speech (TTS) synthesis
- Context-aware conversation management

## Getting Started

### Prerequisites
- Node.js >= 18.0.0
- Docker (optional, for containerized deployment)

### Installation
1. Clone the repository
2. Navigate to this service directory: `cd services/omni-service`
3. Install dependencies: `npm install`

### Configuration
Create a `.env` file based on `.env.example`:
```bash
PORT=8081
QWEN3_OMNI_BASE_URL=http://localhost:8000
QWEN3_OMNI_MODEL=qwen3-omni
```

### Running the Service
- **Development**: `npm run dev`
- **Production**: `npm start`
- **Docker**: `docker-compose up omni-service`

## API Design

### Health Check
- **Endpoint**: `GET /health`
- **Response**: 
  ```json
  {
    "status": "OK",
    "service": "omni-service"
  }
  ```

### Text Processing
- **Endpoint**: `POST /api/process/text`
- **Headers**: 
  - `Content-Type: application/json`
- **Body**:
  ```json
  {
    "text": "Hello, how are you?",
    "userId": "user123",
    "context": {
      "proficiencyLevel": "Intermediate",
      "learningGoals": "Business English",
      "interests": "Technology"
    }
  }
  ```
- **Response**:
  ```json
  {
    "code": 200,
    "message": "Success",
    "data": {
      "type": "text_response",
      "text": "I'm doing well, thank you for asking!",
      "lang": "en-US"
    }
  }
  ```

### Audio Processing
- **Endpoint**: `POST /api/process/audio`
- **Headers**: 
  - `Content-Type: audio/wav` (or appropriate audio type)
  - `user-id: user123` (optional)
  - `context: {"proficiencyLevel": "Intermediate"}` (optional, JSON string)
- **Body**: Binary audio data (PCM/WAV)
- **Response**:
  ```json
  {
    "code": 200,
    "message": "Success",
    "data": {
      "transcript": "Hello, how are you?",
      "response": "I'm doing well, thank you for asking!"
    }
  }
  ```

### Set User Context
- **Endpoint**: `POST /api/context`
- **Headers**: 
  - `Content-Type: application/json`
- **Body**:
  ```json
  {
    "context": {
      "proficiencyLevel": "Intermediate",
      "learningGoals": "Business English",
      "interests": "Technology"
    }
  }
  ```
- **Response**:
  ```json
  {
    "code": 200,
    "message": "User context updated successfully",
    "data": {
      "type": "context_set",
      "message": "User context updated successfully"
    }
  }
  ```

## Architecture
The Omni Service acts as a bridge between client applications and the Qwen3-Omni multimodal AI engine, handling:
- HTTP request processing
- ASR/LLM/TTS pipeline orchestration
- Conversation context management

### Project Structure
```
src/
├── index.js          # Entry point and HTTP server
├── prompt/
│   └── system.js     # System prompt template for Qwen3-Omni
└── qwen3omni/
    ├── client.js     # Qwen3-Omni client implementation
    └── service.js    # Service layer for handling client requests
```