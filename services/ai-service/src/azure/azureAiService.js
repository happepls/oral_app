const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { PassThrough } = require("stream");

class AzureAiService {
    constructor(ws) {
        this.ws = ws;
        this.speechConfig = null;
        this.audioConfig = null;
        this.recognizer = null;
        this.pushStream = sdk.AudioInputStream.createPushStream();
    }

    initialize() {
        const subscriptionKey = process.env.AZURE_SPEECH_API_KEY;
        const serviceRegion = process.env.AZURE_SPEECH_REGION;

        if (!subscriptionKey || !serviceRegion) {
            throw new Error("Azure Speech API key and region must be set in environment variables.");
        }

        this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, serviceRegion);
        // We use the standard speech-to-text endpoint as ConversationTranslator is not suitable.
        // The endpoint for universal speech recognition is `wss://${serviceRegion}.stt.speech.microsoft.com/speech/universal/v2`.
        // However, we will let the SDK determine the default endpoint for SpeechRecognizer.
        // this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_Endpoint, `wss://${serviceRegion}.convai.speech.azure.com/convai/runtime/v1`);

        this.audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
        this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);

        this.setupRecognizerEvents();
    }

    setupRecognizerEvents() {
        const send = (data) => {
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.send(JSON.stringify(data));
            }
        };

        this.recognizer.recognizing = (s, e) => {
            console.log(`RECOGNIZING: Text=${e.result.text}`);
            if (e.result.text) {
                send({ type: 'asr_result', text: e.result.text, isFinal: false });
            }
        };

        this.recognizer.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                console.log(`RECOGNIZED: Text=${e.result.text}`);
                if (e.result.text) {
                    // Send the final recognition result
                    send({ type: 'asr_result', text: e.result.text, isFinal: true });
                    // Send the "echo" AI response
                    send({ type: 'ai_response', text: e.result.text });
                }
            } else if (e.result.reason === sdk.ResultReason.NoMatch) {
                console.log("NOMATCH: Speech could not be recognized.");
                send({ type: 'asr_nomatch' });
            }
        };

        this.recognizer.canceled = (s, e) => {
            console.log(`CANCELED: Reason=${e.reason}`);
            send({ type: 'asr_canceled', reason: e.reason });

            if (e.reason === sdk.CancellationReason.Error) {
                console.log(`"CANCELED: ErrorCode=${e.errorCode}`);
                console.log(`"CANCELED: ErrorDetails=${e.errorDetails}`);
            }
            this.recognizer.stopContinuousRecognitionAsync();
        };

        this.recognizer.sessionStopped = (s, e) => {
            console.log("Session stopped event.");
            send({ type: 'asr_session_stopped' });
            this.recognizer.stopContinuousRecognitionAsync();
        };
    }

    start() {
        this.recognizer.startContinuousRecognitionAsync(
            () => {
                console.log("Recognition started.");
            },
            (err) => {
                console.error(`Error starting recognition: ${err}`);
            }
        );
    }

    stop() {
        this.recognizer.stopContinuousRecognitionAsync(
            () => {
                console.log("Recognition stopped.");
            },
            (err) => {
                console.error(`Error stopping recognition: ${err}`);
            }
        );
    }

    handleAudio(audioData) {
        this.pushStream.write(audioData);
    }
}

module.exports = AzureAiService;
