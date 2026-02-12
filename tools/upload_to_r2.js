import fs from 'fs';
import path from 'path';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, 'web-viewer/public/models');
const BUCKET = process.env.R2_BUCKET_NAME;
const PREFIX = 'shenmue'; // Use a different folder as requested

if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_ENDPOINT) {
    console.error('Error: R2 credentials missing in .env');
    process.exit(1);
}

const s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

async function uploadFile(filePath, key) {
    const stats = fs.statSync(filePath);
    try {
        // Skip if same size
        const head = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        if (head.ContentLength === stats.size) {
            return 'skipped';
        }
    } catch (e) {
        // Not found, proceed
    }

    const fileStream = fs.createReadStream(filePath);
    const parallelUploads3 = new Upload({
        client: s3Client,
        params: {
            Bucket: BUCKET,
            Key: key,
            Body: fileStream,
            ContentType: key.endsWith('.MT5') ? 'application/octet-stream' :
                key.endsWith('.json') ? 'application/json' :
                    key.endsWith('.bin') ? 'application/octet-stream' :
                        'application/octet-stream'
        },
    });

    await parallelUploads3.done();
    return 'uploaded';
}

async function run() {
    if (!fs.existsSync(MODELS_DIR)) {
        console.error(`Directory not found: ${MODELS_DIR}`);
        return;
    }

    const files = fs.readdirSync(MODELS_DIR);

    // Add models.json which is one level up in /public
    const modelsJsonPath = path.join(__dirname, 'web-viewer/public/models.json');
    const uploadTasks = files.map(f => ({ path: path.join(MODELS_DIR, f), key: `${PREFIX}/${f}` }));
    if (fs.existsSync(modelsJsonPath)) {
        uploadTasks.push({ path: modelsJsonPath, key: `${PREFIX}/models.json` });
    }

    console.log(`Starting upload of ${uploadTasks.length} tasks to R2 folder: ${PREFIX}/`);

    let uploaded = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < uploadTasks.length; i++) {
        const task = uploadTasks[i];
        if (fs.statSync(task.path).isDirectory()) continue;

        try {
            const result = await uploadFile(task.path, task.key);
            if (result === 'uploaded') uploaded++;
            else skipped++;

            if ((i + 1) % 50 === 0 || i === uploadTasks.length - 1) {
                console.log(`Progress: ${i + 1}/${uploadTasks.length} | Uploaded: ${uploaded} | Skipped: ${skipped}`);
            }
        } catch (e) {
            console.error(`Failed to upload ${task.key}: ${e.message}`);
            failed++;
        }
    }

    console.log(`\nUpload complete!`);
    console.log(`- Total: ${uploadTasks.length}`);
    console.log(`- Uploaded: ${uploaded}`);
    console.log(`- Skipped: ${skipped}`);
    console.log(`- Failed: ${failed}`);
}

run().catch(console.error);
