/**
 * Google Drive Uploader
 *
 * Uploads MP3 files to a specified Google Drive folder
 */

const { google } = require('googleapis');
const fs = require('fs');

/**
 * Upload audio file to Google Drive
 */
async function uploadToDrive(filePath, fileName) {
  console.log('Uploading to Google Drive...');

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const fileMetadata = {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      mimeType: 'audio/mpeg',
    };

    const media = {
      mimeType: 'audio/mpeg',
      body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
    });

    console.log(`  ✅ Uploaded: ${response.data.webViewLink}`);
    console.log(`  File ID: ${response.data.id}`);

    return response.data;

  } catch (error) {
    console.error('Error uploading to Google Drive:', error.message);
    throw error;
  }
}

module.exports = { uploadToDrive };
