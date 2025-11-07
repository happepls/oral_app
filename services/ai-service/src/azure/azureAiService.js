const sdk = require("microsoft-cognitiveservices-speech-sdk");

class AzureAiService {
    constructor(ws) {
        this.ws = ws;
        this.pushStream = null;
        this.speechRecognizer = null;
        this.speechConfig = null;
    }

    // Initializes the SpeechConfig using the robust `fromSubscription` method.
    // This is the most reliable way to configure the SDK for standard ASR.
    async initialize() {
        const subscriptionKey = process.env.AZURE_SPEECH_API_KEY;
        const serviceRegion = process.env.AZURE_SPEECH_REGION;

        if (!subscriptionKey || !serviceRegion) {
            throw new Error("Azure environment variables (AZURE_SPEECH_API_KEY, AZURE_SPEECH_REGION) must be set.");
        }

        this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, serviceRegion);
        this.speechConfig.speechRecognitionLanguage = "en-US";

        // Enable detailed logging
        this.speechConfig.setProperty(sdk.PropertyId.Speech_LogFilename, "/tmp/speech_sdk_log.txt");

        console.log("Azure AI Service initialized for basic ASR.");
    }

    // Sets up the event handlers for the SpeechRecognizer
    setupEvents() {
        const sendJson = (data) => {
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.send(JSON.stringify(data));
            }
        };

        this.speechRecognizer.sessionStarted = (s, e) => {
            console.log("ASR Session started.");
        };

        this.speechRecognizer.sessionStopped = (s, e) => {
            console.log("ASR Session stopped.");
            sendJson({ type: 'asr_session_stopped' });
        };

        this.speechRecognizer.canceled = (s, e) => {
            console.error(`ASR CANCELED: Reason=${e.reason}`);
            if (e.reason === sdk.CancellationReason.Error) {
                console.error(`CANCELED: ErrorCode=${e.errorCode}, ErrorDetails=${e.errorDetails}`);
            }
            sendJson({ type: 'asr_canceled', reason: e.reason, errorDetails: e.errorDetails });
        };

        // Event for final result
        this.speechRecognizer.recognized = (s, e) => {
            const result = e.result;
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                console.log(`RECOGNIZED (final): Text=${result.text}`);
                sendJson({ type: 'asr_result', text: result.text, isFinal: true });
                // Simple echo for now
                sendJson({ type: 'tts_result', text: `You said: ${result.text}`});
            }
        };
        
        // Event for intermediate result
        this.speechRecognizer.recognizing = (s, e) => {
            const result = e.result;
            if (result.reason === sdk.ResultReason.RecognizingSpeech) {
                console.log(`RECOGNIZING (intermediate): Text=${result.text}`);
                sendJson({ type: 'asr_result', text: result.text, isFinal: false });
            }
        };
    }

    // Starts the recognition process
    async start() {
        try {
            await this.initialize();

            const audioFormat = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
            this.pushStream = sdk.AudioInputStream.createPushStream(audioFormat);
            const audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);

            this.speechRecognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
            
            this.setupEvents();

            this.speechRecognizer.startContinuousRecognitionAsync(
                () => { console.log("Continuous recognition started."); },
                (err) => { console.error(`Error starting recognition: ${err}`); }
            );

        } catch (err) {
            console.error(`Error in start method: ${err.message}`);
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.send(JSON.stringify({ type: 'error', message: `Failed to start AI service: ${err.message}` }));
            }
            throw err;
        }
    }

    // Stops the recognition
    async stop() {
        if (this.speechRecognizer) {
            this.speechRecognizer.stopContinuousRecognitionAsync(
                () => { console.log("Continuous recognition stopped."); },
                (err) => { console.error(`Error stopping recognition: ${err}`); }
            );
            this.speechRecognizer.close();
            this.speechRecognizer = null;
        }
    }

    // Handles incoming audio data from the client
    handleAudio(audioData) {
        if (this.pushStream) {
            const arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
            this.pushStream.write(arrayBuffer);
        }
    }
}

module.exports = AzureAiService;