const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

function bufferToStream(buffer) {
    return Readable.from(buffer);
}

async function uploadToCloudinary(file) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'woodshop',
                resource_type: 'auto'
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );

        bufferToStream(file.buffer).pipe(uploadStream);
    });
}

module.exports = { uploadToCloudinary }; 