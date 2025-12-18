const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');
const path = require('path');

const cos = new COS({
    SecretId: process.env.TENCENT_SECRET_ID,
    SecretKey: process.env.TENCENT_SECRET_KEY,
});

const uploadFile = async (filePath, key) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            return reject(new Error('File not found'));
        }

        cos.putObject({
            Bucket: process.env.TENCENT_BUCKET,
            Region: process.env.TENCENT_REGION,
            Key: key,
            Body: fs.createReadStream(filePath),
        }, function(err, data) {
            if (err) {
                console.error('COS Upload Error:', err);
                return reject(err);
            }
            resolve(data);
        });
    });
};

module.exports = {
    uploadFile,
    cos
};
