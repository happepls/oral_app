const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

/**
 * Transcodes an audio file to a target format.
 * @param {string} inputPath - Path to the input file.
 * @param {string} outputPath - Path to the output file.
 * @param {string} format - Target format (e.g., 'mp3', 'aac').
 * @param {Array<string>} inputOptions - Optional input options for ffmpeg (e.g., for raw PCM).
 * @returns {Promise<string>} - Path to the transcoded file.
 */
const transcodeAudio = (inputPath, outputPath, format = 'mp3', inputOptions = []) => {
    return new Promise((resolve, reject) => {
        let command = ffmpeg(inputPath);
        
        if (inputOptions && inputOptions.length > 0) {
            command = command.inputOptions(inputOptions);
        }

        command
            .toFormat(format)
            .on('end', () => {
                console.log(`Transcoding finished: ${outputPath}`);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('Transcoding error:', err);
                reject(err);
            })
            .save(outputPath);
    });
};

module.exports = {
    transcodeAudio
};
