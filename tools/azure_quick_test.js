const sdk = require("microsoft-cognitiveservices-speech-sdk");
const fs = require("fs");

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;

if (!key || !region) {
  console.error("Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION");
  process.exit(1);
}

const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
speechConfig.speechSynthesisOutputFormat =
  sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

const audioConfig = sdk.AudioConfig.fromAudioFileOutput("test_slow.mp3");
const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

const ssml = `
<speak version="1.0" xml:lang="en-US">
  <voice name="en-US-JennyNeural">
    <prosody rate="x-slow">
      This is an extremely slow test. 
      I am speaking very, very slowly so there is no doubt.
      Each word should be clearly separated.
    </prosody>
  </voice>
</speak>
`.trim();

// DEBUG: confirm SSML actually sent to Azure
console.log("=== SSML SENT TO AZURE ===");
console.log(ssml);
console.log("==========================");

synthesizer.speakSsmlAsync(
  ssml,
  result => {
    synthesizer.close();
    console.log("DONE:", result.reason);
  },
  err => {
    synthesizer.close();
    console.error("ERROR:", err);
  }
);
